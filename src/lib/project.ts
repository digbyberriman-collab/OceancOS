// Active-project context.
//
// The Bridge scopes everything to one project code, chosen in the header.
// OceancOS keeps its cross-project views but adds the same notion of a
// "project I am working in now", stored on the session so it survives
// navigation and page reloads without a client-side store.

import { cookies } from "next/headers";
import { prisma } from "./db";
import { PROJECT_STATUSES } from "./enums";
import { forbidden } from "./errors";
import { requestCache } from "./requestCache";

const SESSION_COOKIE = "oc_session";

export type ProjectSummary = {
  id: string;
  name: string;
  code: string | null;
  vesselId: string;
  vesselName: string;
  vesselYardNumber: string | null;
  status: string;
  isDemo: boolean;
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
  | { archivedAt: null; OR: Array<{ id: { in: string[] } } | { vesselId: { in: string[] }; isDemo: false }> }
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
      // A role over a real vessel reaches its real projects, never the demo
      // workspace parked on it: Draak's own crew have no business in the
      // fictional walkthrough data. A demo project is reached by name or by
      // an unscoped role only.
      ...(vesselIds.length ? [{ vesselId: { in: vesselIds }, isDemo: false as const }] : []),
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
export const listProjectsForUser = requestCache(async (userId: string): Promise<ProjectSummary[]> => {
  const scopes = await prisma.userRole.findMany({
    where: { userId },
    select: { projectId: true, vesselId: true },
  });

  const where = resolveProjectWhere(scopes);
  if (!where) return [];

  const projects = await prisma.project.findMany({
    where,
    include: { vessel: { select: { name: true, yardNumber: true } } },
    orderBy: [{ code: "asc" }, { name: "asc" }],
    take: 200,
  });

  return sortProjectSummaries(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      vesselId: p.vesselId,
      vesselName: p.vessel.name,
      vesselYardNumber: p.vessel.yardNumber,
      status: p.status,
      isDemo: p.isDemo,
    }))
  );
});

/**
 * Live projects first — active, then planned, then completed — each by code.
 * Alphabetical status order would put COMPLETED before PLANNED, and the first
 * project is the one a user lands in when nothing is selected.
 */
export function sortProjectSummaries<T extends { status: string; code: string | null; name: string }>(
  projects: T[]
): T[] {
  const rank = (status: string) => {
    const i = (PROJECT_STATUSES as readonly string[]).indexOf(status);
    return i === -1 ? PROJECT_STATUSES.length : i;
  };
  return [...projects].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (a.code ?? "").localeCompare(b.code ?? "") ||
      a.name.localeCompare(b.name)
  );
}

/**
 * Whether a set of role scopes covers a whole vessel — every project on it,
 * including ones not created yet. An unscoped role does, and so does one
 * scoped to the vessel; a role scoped to one project does not. Pure.
 */
export function rolesCoverVessel(scopes: RoleScope[], vesselId: string): boolean {
  return scopes.some((s) => !s.projectId && (!s.vesselId || s.vesselId === vesselId));
}

/**
 * Whether the user may add a project to this vessel: only someone whose role
 * covers the whole vessel, since anyone else could create a project they
 * then cannot reach.
 */
export async function canActForWholeVessel(userId: string, vesselId: string): Promise<boolean> {
  const scopes = await prisma.userRole.findMany({ where: { userId }, select: { projectId: true, vesselId: true } });
  return rolesCoverVessel(scopes, vesselId);
}

/** The ids of the projects this user can reach. Empty for a user with none. */
export async function accessibleProjectIds(userId: string): Promise<string[]> {
  return (await listProjectsForUser(userId)).map((p) => p.id);
}

/**
 * The projects a list or a total should cover: the reachable projects on the
 * same side of the demo line as the one the user is working in.
 *
 * Working in a real project, the demo workspace is left out entirely, so its
 * fictional change orders, budgets and milestones never appear in a real
 * vessel's lists or add to its totals. Working in a demo project, only demo
 * projects are covered, so the walkthrough never shows real records either.
 * Pure — the decision `projectScope` makes, testable without a request.
 */
export function workspaceProjectIds(
  projects: { id: string; isDemo: boolean }[],
  activeIsDemo: boolean
): string[] {
  return projects.filter((p) => p.isDemo === activeIsDemo).map((p) => p.id);
}

/**
 * A Prisma filter fragment scoping a list or total to the projects this user
 * can reach in their current workspace — the value of a `projectId` filter on
 * any project-scoped model, e.g.
 * `prisma.changeOrder.findMany({ where: projectScope(userId) })`.
 *
 * This is list scope, not access control: it also drops reachable projects on
 * the other side of the demo line (`workspaceProjectIds`). Whether a user may
 * open one record is `accessibleProjectIds` / `requireProjectAccess`, which
 * ignore the workspace. Reads the session, so call it inside a request.
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
  const projects = await listProjectsForUser(userId);
  const active = await getActiveProject(userId);
  return { projectId: { in: workspaceProjectIds(projects, active?.isDemo ?? false) } };
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
 *
 * Wrapped in `requestCache` — React's `cache()` where it's actually
 * available (ACTION_PLAN.md G4.3) — because `(app)/layout.tsx` calls it, and
 * the page under it (`jobs/page.tsx`, `dashboard/page.tsx`, …) calls it
 * again for the same userId, previously re-running its full four-query
 * sequence (this function's own session lookup, plus `listProjectsForUser`'s
 * two, plus the final `project.findUnique`) a second time.
 * `listProjectsForUser` is also cached, so the two calls to it here and in
 * `(app)/layout.tsx` collapse into one query too.
 */
export const getActiveProject = requestCache(async (userId: string) => {
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
});

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

/**
 * The `UserRole` filter that admits a role scope reaching a given project —
 * the inverse of `resolveProjectWhere`. That function asks "which projects
 * can this role scope reach"; this asks "which role scopes reach this
 * project". Used to find who to notify about something that happened on one
 * project, without notifying everyone who holds the permission platform-wide.
 *
 * Pure, for the same reason `resolveProjectWhere` is.
 */
export function resolveUserRoleWhereForProject(project: { id: string; vesselId: string; isDemo: boolean }) {
  return {
    OR: [
      { projectId: null, vesselId: null },
      { projectId: project.id },
      // Mirrors resolveProjectWhere: a vessel-scoped role never reaches a demo
      // project, so it is never told about one either.
      ...(project.isDemo ? [] : [{ vesselId: project.vesselId }]),
    ],
  };
}

/**
 * Active users holding `permKey` through a role scope that reaches `project`.
 *
 * Replaces the pattern of selecting every user who holds a permission
 * anywhere on the platform to notify them about one project's job or change
 * order — AUDIT_REPORT.md's `[NOTIFICATIONS] — Recipient lookups are global`:
 * every yard PM on the platform was notified of every new quote request on
 * every vessel, including the job code and title of one they could not open.
 */
export async function usersWithPermissionOnProject(
  project: { id: string; vesselId: string; isDemo: boolean },
  permKey: string
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      roles: {
        some: {
          role: { permissions: { some: { permission: { key: permKey } } } },
          ...resolveUserRoleWhereForProject(project),
        },
      },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
