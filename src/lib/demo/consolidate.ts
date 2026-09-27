// Moving the demo workspace onto Draak.
//
// One function, used two ways: the seed calls it to lay out the demo projects
// on a fresh database, and `npm run demo:consolidate` calls it on a database
// seeded before the demo moved, where the walkthrough still sits on the
// invented vessels M/Y Solstice and M/Y Northern Light. Either way the result
// is the same, and running it again changes nothing.
//
// What it does, in one transaction:
//   1. Finds Draak by yard number; the vessel register must be loaded first.
//   2. Refuses to go on if an invented vessel holds anything it cannot move:
//      a project other than the demo ones, or a role assignment. Deleting a
//      vessel sets UserRole.vesselId to null, which would silently turn a
//      vessel-scoped role into an unscoped one that reaches every project.
//   3. Puts both demo projects on Draak, marked isDemo, with their codes,
//      names and yard periods (data.ts).
//   4. Moves the dates the seed derived from the old arrival by the same
//      amount as the arrival moved, so the walkthrough keeps its shape.
//      Only timestamps inside the seed's window are moved (SEED_WINDOW_DAYS):
//      anything a person did happened at the real time they did it.
//   5. Sets the primary project's milestones, and its areas on Draak.
//   6. Deletes the invented vessels, now empty.

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  DEMO_AREAS,
  DEMO_MILESTONES,
  DEMO_PRIMARY,
  DEMO_PROJECTS,
  DEMO_VESSEL_YARD_NUMBER,
  FICTIONAL_VESSELS,
  RENAMED_TITLES,
  SEED_WINDOW_DAYS,
  type DemoProject,
} from "./data";

const DAY = 24 * 60 * 60 * 1000;

export type ConsolidateSummary = {
  projectsCreated: number;
  projectsUpdated: number;
  timestampsShifted: number;
  milestonesSet: number;
  areasSet: number;
  titlesRenamed: number;
  vesselsDeleted: number;
};

export function isNoChange(summary: ConsolidateSummary): boolean {
  return Object.values(summary).every((n) => n === 0);
}

export type DateShift = { deltaMs: number; from: Date; to: Date };

/**
 * How to move a project's seeded dates when its arrival moves from `stored`
 * to `target`: every timestamp in [stored, stored + window) moves by the same
 * amount. Null when there is nothing to move.
 */
export function planDateShift(stored: Date | null, target: Date): DateShift | null {
  if (!stored) return null;
  const deltaMs = target.getTime() - stored.getTime();
  if (deltaMs === 0) return null;
  return { deltaMs, from: stored, to: new Date(stored.getTime() + SEED_WINDOW_DAYS * DAY) };
}

/** Why an invented vessel cannot be removed, or null when it can. */
export function fictionalVesselBlocker(vessel: {
  name: string;
  projectIds: string[];
  roleCount: number;
}): string | null {
  const demoIds = new Set<string>(DEMO_PROJECTS.map((p) => p.id));
  const stranger = vessel.projectIds.filter((id) => !demoIds.has(id));
  if (stranger.length) {
    return `${vessel.name} holds project(s) that are not demo data (${stranger.join(", ")}). Move or archive them first.`;
  }
  if (vessel.roleCount) {
    return (
      `${vessel.name} has ${vessel.roleCount} role assignment(s) scoped to it. Deleting the vessel would ` +
      `turn them into unscoped roles that reach every project. Reassign them first.`
    );
  }
  return null;
}

function projectFields(def: DemoProject, vesselId: string) {
  return {
    vesselId,
    isDemo: true,
    code: def.code,
    name: def.name,
    type: "REFIT",
    status: def.status,
    yardName: def.yardName,
    currency: "EUR",
    startDate: def.arrivalDate,
    targetEndDate: def.departureDate,
    arrivalDate: def.arrivalDate,
    haulOutDate: def.haulOutDate,
    seaTrialsDate: def.seaTrialsDate,
    departureDate: def.departureDate,
    archivedAt: null,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : false;
  }
  return (a ?? null) === (b ?? null);
}

/** Every timestamp the seed derives from arrival, table by table. */
async function shiftSeededDates(
  tx: Prisma.TransactionClient,
  projectId: string,
  shift: DateShift,
): Promise<number> {
  const { deltaMs, from, to } = shift;
  let moved = 0;
  const run = (sql: string) => tx.$executeRawUnsafe(sql, deltaMs, from, to, projectId);
  // $1 delta (ms), $2 window start, $3 window end, $4 project id.
  const inWindow = (col: string) => `"${col}" >= $2 AND "${col}" < $3`;
  const plus = (col: string) =>
    `"${col}" = "${col}" + ($1::double precision * interval '1 millisecond')`;

  moved += await run(
    `UPDATE "ChangeOrder" SET ${plus("createdAt")} WHERE "projectId" = $4 AND ${inWindow("createdAt")}`,
  );
  moved += await run(
    `UPDATE "ChangeOrderApproval" SET ${plus("decidedAt")} WHERE ${inWindow("decidedAt")} ` +
      `AND "changeOrderId" IN (SELECT "id" FROM "ChangeOrder" WHERE "projectId" = $4)`,
  );
  moved += await run(
    `UPDATE "ChangeOrderHistory" SET ${plus("createdAt")} WHERE ${inWindow("createdAt")} ` +
      `AND "changeOrderId" IN (SELECT "id" FROM "ChangeOrder" WHERE "projectId" = $4)`,
  );
  for (const col of [
    "requestedAt",
    "quoteDeliveredAt",
    "expiresAt",
    "clientAcceptedAt",
    "yardAcceptedAt",
    "yardCompletedAt",
    "worksAcceptedAt",
    "cancelledAt",
    "createdAt",
  ]) {
    moved += await run(`UPDATE "Job" SET ${plus(col)} WHERE "projectId" = $4 AND ${inWindow(col)}`);
  }
  moved += await run(
    `UPDATE "JobHistory" SET ${plus("createdAt")} WHERE ${inWindow("createdAt")} ` +
      `AND "jobId" IN (SELECT "id" FROM "Job" WHERE "projectId" = $4)`,
  );
  moved += await run(
    `UPDATE "Comment" SET ${plus("createdAt")} WHERE ${inWindow("createdAt")} ` +
      `AND "jobId" IN (SELECT "id" FROM "Job" WHERE "projectId" = $4)`,
  );
  return moved;
}

class RollBack extends Error {
  constructor(readonly summary: ConsolidateSummary) {
    super("rolled back");
  }
}

/**
 * Lay out, or move, the demo workspace on Draak. With `check`, work out what
 * would change and roll it all back.
 */
export async function consolidateDemo(
  prisma: PrismaClient,
  options: { actorId?: string | null; check?: boolean } = {},
): Promise<ConsolidateSummary> {
  const summary: ConsolidateSummary = {
    projectsCreated: 0,
    projectsUpdated: 0,
    timestampsShifted: 0,
    milestonesSet: 0,
    areasSet: 0,
    titlesRenamed: 0,
    vesselsDeleted: 0,
  };

  try {
    await prisma.$transaction(
      async (tx) => {
        const draak = await tx.vessel.findUnique({
          where: { yardNumber: DEMO_VESSEL_YARD_NUMBER },
          select: { id: true },
        });
        if (!draak) {
          throw new Error(
            `The demo workspace lives on ${DEMO_VESSEL_YARD_NUMBER} (Draak), which is not in the database. ` +
              "Load the vessel register first (npm run vessels:import).",
          );
        }

        const fictionalIds = FICTIONAL_VESSELS.map((v) => v.id as string);
        const fictional = await tx.vessel.findMany({
          where: { id: { in: fictionalIds } },
          select: {
            id: true,
            name: true,
            yardNumber: true,
            projects: { select: { id: true } },
            _count: { select: { userRoles: true } },
          },
        });
        for (const v of fictional) {
          const known = FICTIONAL_VESSELS.find((f) => f.id === v.id);
          if (!known || known.name !== v.name || v.yardNumber) {
            throw new Error(
              `Vessel ${v.id} ("${v.name}") is not one of the invented demo vessels; leaving it alone.`,
            );
          }
          const blocker = fictionalVesselBlocker({
            name: v.name,
            projectIds: v.projects.map((p) => p.id),
            roleCount: v._count.userRoles,
          });
          if (blocker) throw new Error(blocker);
        }

        // 3–4. The projects, and the dates the seed hung off them.
        for (const def of DEMO_PROJECTS) {
          const fields = projectFields(def, draak.id);
          const existing = await tx.project.findUnique({ where: { id: def.id } });
          if (!existing) {
            await tx.project.create({ data: { id: def.id, ...fields } });
            summary.projectsCreated++;
            continue;
          }
          const shift = planDateShift(existing.arrivalDate, def.arrivalDate);
          if (shift) summary.timestampsShifted += await shiftSeededDates(tx, def.id, shift);
          const differs = (Object.keys(fields) as (keyof typeof fields)[]).some(
            (k) => !sameValue(existing[k], fields[k]),
          );
          if (differs) {
            await tx.project.update({ where: { id: def.id }, data: fields });
            summary.projectsUpdated++;
          }
        }

        // 5. Milestones, matched by name.
        for (const m of DEMO_MILESTONES) {
          const found = await tx.milestone.findFirst({
            where: { projectId: DEMO_PRIMARY.id, name: m.name },
          });
          if (!found) {
            await tx.milestone.create({
              data: { projectId: DEMO_PRIMARY.id, name: m.name, type: m.type, date: m.date },
            });
            summary.milestonesSet++;
          } else if (found.date.getTime() !== m.date.getTime() || found.type !== m.type) {
            await tx.milestone.update({
              where: { id: found.id },
              data: { date: m.date, type: m.type },
            });
            summary.milestonesSet++;
          }
        }

        // 5. Areas: the invented vessel's move across; any missing are added.
        const moved = await tx.vesselArea.updateMany({
          where: { vesselId: { in: fictionalIds } },
          data: { vesselId: draak.id, isDemo: true },
        });
        summary.areasSet += moved.count;
        for (const name of DEMO_AREAS) {
          const found = await tx.vesselArea.findFirst({
            where: { vesselId: draak.id, name, isDemo: true },
          });
          if (!found) {
            await tx.vesselArea.create({ data: { vesselId: draak.id, name, isDemo: true } });
            summary.areasSet++;
          }
        }

        for (const { from, to } of RENAMED_TITLES) {
          const renamed = await tx.changeOrder.updateMany({
            where: { projectId: { in: DEMO_PROJECTS.map((p) => p.id) }, title: from },
            data: { title: to },
          });
          summary.titlesRenamed += renamed.count;
        }

        // 6. The invented vessels, now holding nothing.
        if (fictional.length) {
          const deleted = await tx.vessel.deleteMany({
            where: {
              id: { in: fictional.map((v) => v.id) },
              yardNumber: null,
              projects: { none: {} },
            },
          });
          summary.vesselsDeleted += deleted.count;
        }

        if (!isNoChange(summary)) {
          await tx.auditLog.create({
            data: {
              actorId: options.actorId ?? null,
              action: "UPDATE",
              resource: "DemoWorkspace",
              details: { ...summary, vessel: DEMO_VESSEL_YARD_NUMBER },
            },
          });
        }

        if (options.check) throw new RollBack(summary);
      },
      { timeout: 120_000 },
    );
  } catch (e) {
    if (e instanceof RollBack) return e.summary;
    throw e;
  }
  return summary;
}
