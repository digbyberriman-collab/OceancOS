// Loading the vessel register into the database.
//
// Safe to run again and again, including against production: vessels are
// matched by IMO (then yard number), a value already held is never replaced
// unless asked, observations and data gaps are only ever added, and a gap's
// status set in the application survives a re-import. Every vessel ends up
// with a project, so its particulars appear in the project switcher and on
// every project page.

import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { EVIDENCE_FIELD_MAP, isBlank, type VesselParticulars } from "./fields";
import { gapVessels, type VesselRegister } from "./workbook";

export type ImportOptions = {
  /** Replace values already held with the workbook's. Off by default. */
  overwrite?: boolean;
  builder?: string;
  /** Name given to the project created for a vessel that has none. */
  projectName?: string;
  projectType?: string;
  actorId?: string | null;
};

export type ImportSummary = {
  vesselsCreated: number;
  vesselsUpdated: number;
  fieldsFilled: number;
  projectsCreated: number;
  sourcesUpserted: number;
  observationsAdded: number;
  gapsAdded: number;
};

export const IMPORT_DEFAULTS = {
  builder: "Oceanco",
  projectName: "Aftersales & refit",
  projectType: "REFIT",
} as const;

type VesselData = Omit<Partial<VesselParticulars>, "name"> & {
  name: string;
  imo: string;
  yardNumber: string;
  verification: string;
};

/** One record per vessel: register, technical and build-sequence rows joined by yard number. */
export function buildVesselRecords(register: VesselRegister, builder: string = IMPORT_DEFAULTS.builder): VesselData[] {
  const technical = new Map(register.technical.map((t) => [t.yardNumber, t]));
  const slots = new Map(register.buildSequence.map((b) => [b.yardNumber, b]));

  return register.vessels.map((v) => {
    const t = technical.get(v.yardNumber);
    const slot = slots.get(v.yardNumber);
    return {
      name: v.name,
      yardNumber: v.yardNumber,
      builder,
      vesselType: v.vesselType,
      formerNames: v.formerNames,
      deliveredYear: v.deliveredYear,
      imo: v.imo,
      mmsi: v.mmsi,
      callSign: v.callSign,
      flag: v.flag,
      loa: v.loa,
      beam: v.beam,
      grossTonnage: v.grossTonnage,
      dimensionsBasis: v.dimensionsBasis,
      tonnageBasis: v.tonnageBasis,
      identityNote: v.identityNote,
      dimensionsNote: v.dimensionsNote,
      builderUrl: v.builderUrl,
      databaseUrl: v.databaseUrl,
      identitySupplementUrl: v.identitySupplementUrl,
      particularsCheckedOn: v.checkedOn,
      draft: t?.draft ?? null,
      hullMaterial: t?.hullMaterial ?? null,
      superstructureMaterial: t?.superstructureMaterial ?? null,
      navalArchitect: t?.navalArchitect ?? null,
      exteriorDesigner: t?.exteriorDesigner ?? null,
      interiorDesigner: t?.interiorDesigner ?? null,
      mainMachinery: t?.mainMachinery ?? null,
      propulsion: t?.propulsion ?? null,
      cruiseSpeed: t?.cruiseSpeed ?? null,
      maxSpeed: t?.maxSpeed ?? null,
      maxSailSpeed: t?.maxSailSpeed ?? null,
      rangeNm: t?.rangeNm ?? null,
      guests: t?.guests ?? null,
      guestCabins: t?.guestCabins ?? null,
      crew: t?.crew ?? null,
      classSociety: t?.classSociety ?? null,
      lastRefitYear: t?.lastRefitYear ?? null,
      features: t?.features ?? null,
      technicalNote: t?.technicalNote ?? null,
      yardNumberBasis: slot?.evidenceType ?? null,
      yardNumberNote: slot?.qualification ?? null,
      verification: "PUBLIC_SOURCE",
    };
  });
}

/**
 * The fields of `incoming` to write onto `existing`. Without `overwrite`, only
 * blanks are filled: a value someone entered in the application is theirs.
 */
export function fillBlanks<T extends Record<string, unknown>>(
  existing: Record<string, unknown>,
  incoming: T,
  overwrite = false
): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(incoming) as (keyof T & string)[]) {
    const value = incoming[key];
    if (isBlank(value as never)) continue;
    const current = existing[key];
    if (!overwrite && !isBlank(current as never)) continue;
    if (current instanceof Date && value instanceof Date && current.getTime() === value.getTime()) continue;
    if (current === value) continue;
    patch[key] = value;
  }
  return patch;
}

function fingerprint(parts: (string | null | undefined)[]): string {
  return createHash("sha256").update(parts.map((p) => p ?? "").join("␟")).digest("hex");
}

export function observationFingerprint(o: {
  imo: string;
  fieldLabel: string;
  value: string;
  sourceCode: string | null;
  basis: string | null;
}): string {
  return fingerprint(["obs", o.imo, o.fieldLabel, o.value, o.sourceCode, o.basis]);
}

export function gapFingerprint(g: { scope: string; issue: string }, yardNumber: string | null): string {
  return fingerprint(["gap", g.scope, g.issue, yardNumber ?? "FLEET"]);
}

/** A project code not yet in use, starting from the yard number. */
async function freeProjectCode(tx: Prisma.TransactionClient, base: string): Promise<string> {
  for (let n = 1; ; n++) {
    const code = n === 1 ? base : `${base}-${n}`;
    const clash = await tx.project.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
}

export async function importVesselRegister(
  prisma: PrismaClient,
  register: VesselRegister,
  options: ImportOptions = {}
): Promise<ImportSummary> {
  const builder = options.builder ?? IMPORT_DEFAULTS.builder;
  const projectName = options.projectName ?? IMPORT_DEFAULTS.projectName;
  const projectType = options.projectType ?? IMPORT_DEFAULTS.projectType;
  const overwrite = options.overwrite ?? false;

  const summary: ImportSummary = {
    vesselsCreated: 0,
    vesselsUpdated: 0,
    fieldsFilled: 0,
    projectsCreated: 0,
    sourcesUpserted: 0,
    observationsAdded: 0,
    gapsAdded: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      // Sources are reference data; the workbook is their only editor.
      const sourceIds = new Map<string, string>();
      for (const s of register.sources) {
        const { code, ...rest } = s;
        const row = await tx.vesselSource.upsert({
          where: { code },
          update: rest,
          create: s,
          select: { id: true },
        });
        sourceIds.set(code, row.id);
        summary.sourcesUpserted++;
      }

      const vesselIds = new Map<string, string>(); // yard number -> id
      const vesselIdsByImo = new Map<string, string>();

      for (const record of buildVesselRecords(register, builder)) {
        const existing =
          (await tx.vessel.findUnique({ where: { imo: record.imo } })) ??
          (await tx.vessel.findUnique({ where: { yardNumber: record.yardNumber } }));

        let vesselId: string;
        if (!existing) {
          const created = await tx.vessel.create({ data: { ...record, updatedById: options.actorId ?? null } });
          vesselId = created.id;
          summary.vesselsCreated++;
        } else {
          vesselId = existing.id;
          const { verification, ...particulars } = record;
          const patch: Prisma.VesselUpdateInput = fillBlanks(existing, particulars, overwrite);
          const fields = Object.keys(patch).length;
          // Never downgrade: a certificate-verified vessel stays verified.
          if (existing.verification === "UNVERIFIED") patch.verification = verification;
          if (Object.keys(patch).length) {
            await tx.vessel.update({
              where: { id: existing.id },
              data: { ...patch, updatedById: options.actorId ?? null },
            });
            summary.vesselsUpdated++;
            summary.fieldsFilled += fields;
          }
        }
        vesselIds.set(record.yardNumber, vesselId);
        vesselIdsByImo.set(record.imo, vesselId);

        // Every vessel belongs to at least one project.
        const hasProject = await tx.project.findFirst({
          where: { vesselId, archivedAt: null },
          select: { id: true },
        });
        if (!hasProject) {
          await tx.project.create({
            data: {
              vesselId,
              name: projectName,
              type: projectType,
              code: await freeProjectCode(tx, record.yardNumber),
            },
          });
          summary.projectsCreated++;
        }
      }

      const observations: Prisma.VesselObservationCreateManyInput[] = [];
      for (const o of register.observations) {
        const vesselId = vesselIdsByImo.get(o.imo);
        if (!vesselId) continue;
        observations.push({
          vesselId,
          fieldKey: EVIDENCE_FIELD_MAP[o.fieldLabel] ?? null,
          fieldLabel: o.fieldLabel,
          value: o.value,
          unit: o.unit,
          basis: o.basis,
          qualification: o.qualification,
          sourceCode: o.sourceCode,
          sourceId: o.sourceCode ? (sourceIds.get(o.sourceCode) ?? null) : null,
          sourceUrl: o.sourceUrl,
          observedOn: o.checkedOn,
          origin: "IMPORT",
          fingerprint: observationFingerprint(o),
        });
      }
      const addedObs = await tx.vesselObservation.createMany({ data: observations, skipDuplicates: true });
      summary.observationsAdded = addedObs.count;

      const gaps: Prisma.VesselDataGapCreateManyInput[] = [];
      for (const g of register.gaps) {
        const yardNumbers = gapVessels(g.scope, register.vessels);
        const targets: (string | null)[] = yardNumbers.length ? yardNumbers : [null];
        for (const yardNumber of targets) {
          gaps.push({
            vesselId: yardNumber ? (vesselIds.get(yardNumber) ?? null) : null,
            scope: g.scope,
            priority: g.priority,
            issue: g.issue,
            treatment: g.treatment,
            evidenceNeeded: g.evidenceNeeded,
            status: g.status,
            reference: g.reference,
            fingerprint: gapFingerprint(g, yardNumber),
          });
        }
      }
      const addedGaps = await tx.vesselDataGap.createMany({ data: gaps, skipDuplicates: true });
      summary.gapsAdded = addedGaps.count;

      const changed =
        summary.vesselsCreated + summary.vesselsUpdated + summary.projectsCreated +
        summary.observationsAdded + summary.gapsAdded;
      if (changed) {
        await tx.auditLog.create({
          data: {
            actorId: options.actorId ?? null,
            action: "IMPORT",
            resource: "VesselRegister",
            details: { ...summary, overwrite },
          },
        });
      }
    },
    { timeout: 120_000 }
  );

  return summary;
}
