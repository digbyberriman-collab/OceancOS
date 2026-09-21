// Active-project context.
//
// The Bridge scopes everything to one project code, chosen in the header.
// OceancOS keeps its cross-project views but adds the same notion of a
// "project I am working in now", stored on the session so it survives
// navigation and page reloads without a client-side store.

import { cookies } from "next/headers";
import { prisma } from "./db";
import { forbidden } from "./errors";

const SESSION_COOKIE = "oc_session";

export type ProjectSummary = {
  id: string;
  name: string;
  code: string | null;
  vesselName: string;
  status: string;
};

type RoleScope = { projectId: string | null; vesselId: string | null };

/**
 * The Prisma `where` a set of role scopes admits for `Project`, or `null` when
 * they admit none.
 *
 * Pure — no database, which is what makes this the one part of the scoping
 * model with direct unit test coverage (`tests/project.test.ts`). Everything
 * below that touches Prisma is a thin wrapper around this decision, so there
 * is exactly one place it is made.
 *
 * A user whose role assignments name specific projects or vessels reaches
 * only those; a user with an unscoped assignment (the common case for
 * owner-side staff) reaches every active project. `null` — not an empty `OR`,
 * which would still match everything — is what a scoped user with no project
 * or vessel named resolves to.
 */
export function resolveProjectWhere(
  scopes: RoleScope[]
):
  | { archivedAt: null }
  | { archivedAt: null; OR: Array<{ id: { in: string[] } } | { vesselId: { in: string[] } }> }
  | null {
  const projectIds = scopes.map((s) => s.projectId).filter((x): x is string => !!x);
  const vesselIds = scopes.map((s) => s.vesselId).filter((x): x is string => !!x);
  const hasUnscopedRole = scopes.some((s) => !s.projectId && !s.vesselId);

  if (hasUnscopedRole) return { archivedAt: null };
  if (!projectIds.length && !vesselIds.length) return null;

  return {
    archivedAt: null,
    OR: [
      ...(projectIds.length ? [{ id: { in: projectIds } }] : []),
      ...(vesselIds.length ? [{ vesselId: { in: vesselIds } }] : []),
    ],
  };
}

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

  const where = resolveProjectWhere(scopes);
  if (!where) return [];

  const projects = await prisma.project.findMany({
    where,
    include: { vessel: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    vesselName: p.vessel.name,
    status: p.status,
  }));
}

/** The ids of the projects this user can reach. Empty for a user with none. */
export async function accessibleProjectIds(userId: string): Promise<string[]> {
  return (await listProjectsForUser(userId)).map((p) => p.id);
}

/**
 * A Prisma filter fragment scoping a query to the projects this user can
 * reach — the value of a `projectId` filter on any project-scoped model, e.g.
 * `prisma.changeOrder.findMany({ where: projectScope(userId) })`.
 *
 * Always a concrete `{ in: [...ids] }`, never `undefined`. A user who can
 * reach every project (an unscoped role) gets every active project id
 * enumerated rather than an unfiltered query — functionally the same result,
 * but the type of the return value cannot be mistaken for "no restriction"
 * the way `projectId ? { projectId } : undefined` was. **That ternary, found
 * in the change-order spreadsheet export, is the bug this replaces**: for a
 * user who could reach no project it fell through to `undefined` and
 * returned every project's data. `{ in: [] }` cannot do that — it matches
 * nothing.
 */
export async function projectScope(userId: string): Promise<{ projectId: { in: string[] } }> {
  return { projectId: { in: await accessibleProjectIds(userId) } };
}

/**
 * Refuse unless the user can reach this project. The record-level counterpart
 * to `projectScope`'s list-level filter — call this before a write to (or a
 * direct read of) something identified by its own id rather than reached
 * through a list.
 */
export async function requireProjectAccess(userId: string, projectId: string): Promise<void> {
  const ids = await accessibleProjectIds(userId);
  if (!ids.includes(projectId)) {
    throw forbidden("That belongs to a project you cannot reach.");
  }
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
  await requireProjectAccess(userId, projectId);

  await prisma.session.update({
    where: { token },
    data: { activeProjectId: projectId },
  });
}
