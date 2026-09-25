// Which vessels a user can see, and loading one for display.
//
// A vessel is visible through its projects: anyone who can work in one of a
// vessel's projects can read its particulars. There is no separate vessel
// permission to view; editing needs `vessel.edit`.

import { prisma } from "../db";
import { listProjectsForUser } from "../project";

/** Ids of the vessels behind the projects the user can reach. */
export async function vesselIdsForUser(userId: string): Promise<string[]> {
  const projects = await listProjectsForUser(userId);
  return [...new Set(projects.map((p) => p.vesselId))];
}

export async function canReachVessel(userId: string, vesselId: string): Promise<boolean> {
  return (await vesselIdsForUser(userId)).includes(vesselId);
}

/** A vessel with everything its detail view shows, or null if unreachable. */
export async function loadVesselDetail(userId: string, vesselId: string) {
  if (!(await canReachVessel(userId, vesselId))) return null;
  return prisma.vessel.findUnique({
    where: { id: vesselId },
    include: {
      projects: {
        where: { archivedAt: null },
        select: { id: true, code: true, name: true, type: true, status: true },
        orderBy: [{ code: "asc" }, { name: "asc" }],
      },
      observations: {
        include: { source: { select: { code: true, publisher: true, sourceType: true, url: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      dataGaps: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
}

export type VesselDetail = NonNullable<Awaited<ReturnType<typeof loadVesselDetail>>>;
