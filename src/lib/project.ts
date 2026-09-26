// Active-project context.
//
// The Bridge scopes everything to one project code, chosen in the header.
// OceancOS keeps its cross-project views but adds the same notion of a
// "project I am working in now", stored on the session so it survives
// navigation and page reloads without a client-side store.

import { cookies } from "next/headers";
import { prisma } from "./db";

const SESSION_COOKIE = "oc_session";

export type ProjectSummary = {
  id: string;
  name: string;
  code: string | null;
  vesselId: string;
  vesselName: string;
  status: string;
};

/**
 * Projects the user may work in.
 *
 * A user whose role assignments name specific projects sees only those; a user
 * with an unscoped assignment (the common case for owner-side staff) sees every
 * active project. Archived projects are never listed.
 */
export async function listProjectsForUser(userId: string): Promise<ProjectSummary[]> {
  const scopes = await prisma.userRole.findMany({
    where: { userId },
    select: { projectId: true, vesselId: true },
  });

  const projectIds = scopes.map((s) => s.projectId).filter((x): x is string => !!x);
  const vesselIds = scopes.map((s) => s.vesselId).filter((x): x is string => !!x);
  const hasUnscopedRole = scopes.some((s) => !s.projectId && !s.vesselId);

  const where = hasUnscopedRole
    ? { archivedAt: null }
    : {
        archivedAt: null,
        OR: [
          ...(projectIds.length ? [{ id: { in: projectIds } }] : []),
          ...(vesselIds.length ? [{ vesselId: { in: vesselIds } }] : []),
        ],
      };

  // A scoped user with no project or vessel named would otherwise match everything.
  if (!hasUnscopedRole && !projectIds.length && !vesselIds.length) return [];

  const projects = await prisma.project.findMany({
    where,
    include: { vessel: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { code: "asc" }, { name: "asc" }],
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    vesselId: p.vesselId,
    vesselName: p.vessel.name,
    status: p.status,
  }));
}

/**
 * The project the user is working in.
 *
 * Falls back to their first available project when nothing is selected yet, or
 * when the stored selection is no longer one they can reach. Returns null only
 * when the user has access to no project at all.
 */
export async function getActiveProject(userId: string) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = token
    ? await prisma.session.findUnique({ where: { token }, select: { activeProjectId: true } })
    : null;

  const available = await listProjectsForUser(userId);
  if (!available.length) return null;

  const stored = session?.activeProjectId;
  const chosen = available.find((p) => p.id === stored) ?? available[0];

  const project = await prisma.project.findUnique({
    where: { id: chosen.id },
    include: { vessel: true },
  });
  return project;
}

/** Persist the selection against the current session. */
export async function storeActiveProject(userId: string, projectId: string) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return;

  // Never store a project the user cannot reach.
  const available = await listProjectsForUser(userId);
  if (!available.some((p) => p.id === projectId)) {
    throw new Error("Forbidden: no access to that project");
  }

  await prisma.session.update({
    where: { token },
    data: { activeProjectId: projectId },
  });
}
