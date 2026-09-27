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
  const reachable = await listProjectsForUser(userId);
  if (!reachable.some((p) => p.vesselId === vesselId)) return null;
  return prisma.vessel.findUnique({
    where: { id: vesselId },
    include: {
      // Only the projects this user can reach: seeing a vessel does not open
      // every project on it to someone scoped to one.
      projects: {
        where: { archivedAt: null, id: { in: reachable.map((p) => p.id) } },
        select: { id: true, code: true, name: true, type: true, status: true, isDemo: true },
        orderBy: [{ code: "asc" }, { name: "asc" }],
        take: 200,
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
