// Loading a project for its overview page.
//
// Any project the user can reach — a live one or a historical yard period —
// with what its overview shows: its vessel, the published record when it is
// a yard period, its scope by discipline, the evidence behind it, the gaps
// about it, and how much live work hangs off it.

import { prisma } from "../db";
import { listProjectsForUser } from "../project";

/** A project with everything its overview shows, or null if unreachable. */
export async function loadProjectOverview(userId: string, projectId: string) {
  const reachable = await listProjectsForUser(userId);
  if (!reachable.some((p) => p.id === projectId)) return null;
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      vessel: {
        select: { id: true, name: true, yardNumber: true, vesselType: true, formerNames: true },
      },
      yardPeriod: true,
      scopeItems: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 200,
      },
      evidence: {
        include: {
          source: { select: { code: true, publisher: true, sourceType: true, url: true } },
        },
        orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
        take: 100,
      },
      dataGaps: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 },
      _count: {
        select: {
          jobs: true,
          changeOrders: true,
          crewRequests: true,
          documents: true,
          milestones: true,
        },
      },
    },
  });
}

export type ProjectOverview = NonNullable<Awaited<ReturnType<typeof loadProjectOverview>>>;
