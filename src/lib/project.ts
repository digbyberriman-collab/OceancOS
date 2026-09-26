// Active-project context.
//
// The Bridge scopes everything to one project code, chosen in the header.
// OceancOS keeps its cross-project views but adds the same notion of a
// "project I am working in now", stored on the session so it survives
// navigation and page reloads without a client-side store.

import { cookies } from "next/headers";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { forbidden } from "./errors";
import { PLATFORM_WIDE_ROLES, type RoleKey } from "./enums";

const SESSION_COOKIE = "oc_session";

export type ProjectSummary = {
  id: string;
  name: string;
  code: string | null;
  vesselName: string;
  status: string;
};

/**
 * Projects the user may work in.
 *
 * A user whose role assignments name specific projects sees only those. An
 * assignment that names neither a project nor a vessel sees every active
 * project only when the role itself is one of `PLATFORM_WIDE_ROLES` — the
 * fleet-wide owner-side case this function was written for. The same
 * unscoped shape on any other role is a provisioning gap, not a grant, and
 * resolves to no project (C16 in AUDIT_REPORT_ADDENDUM.md: this branch used
 * to grant every project to every unscoped role, which is how a yard PM or
 * a contractor engaged for one vessel could reach every vessel on the
 * platform). Archived projects are never listed.
 */
export async function listProjectsForUser(userId: string): Promise<ProjectSummary[]> {
  const scopes = await prisma.userRole.findMany({
    where: { userId },
    select: { projectId: true, vesselId: true, role: { select: { key: true } } },
  });

  const projectIds = scopes.map((s) => s.projectId).filter((x): x is string => !!x);
  const vesselIds = scopes.map((s) => s.vesselId).filter((x): x is string => !!x);
  const hasUnscopedPlatformRole = scopes.some(
    (s) => !s.projectId && !s.vesselId && PLATFORM_WIDE_ROLES.has(s.role.key as RoleKey)
  );

  const where = hasUnscopedPlatformRole
    ? { archivedAt: null }
    : {
        archivedAt: null,
        OR: [
          ...(projectIds.length ? [{ id: { in: projectIds } }] : []),
          ...(vesselIds.length ? [{ vesselId: { in: vesselIds } }] : []),
        ],
      };

  // No platform-wide role, and no project or vessel named, would otherwise
  // match everything: the fail-closed default for a data gap.
  if (!hasUnscopedPlatformRole && !projectIds.length && !vesselIds.length) return [];

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

/**
 * Asserts `user` can reach `projectId` — the write-path guard.
 *
 * Every create, update or transition that takes a project id from a
 * submitted form or a route param must call this before touching the
 * database. The active-project switcher and `getActiveProject` already only
 * ever offer a project the user can reach, but a request is not obliged to
 * agree with what the UI offered it — `projectId` read straight off a
 * change-order or crew-request create form is exactly this gap (T4 in
 * AUDIT_REPORT.md). Not yet called anywhere: application is G2.1.
 */
export async function requireProjectAccess(
  user: NonNullable<CurrentUser>,
  projectId: string
): Promise<void> {
  const available = await listProjectsForUser(user.id);
  if (!available.some((p) => p.id === projectId)) {
    throw forbidden("You do not have access to that project.");
  }
}

/**
 * A Prisma `where` fragment scoping a query to the projects `user` can
 * reach: `{ projectId: { in: [...] } }`.
 *
 * For a user who can reach no project this is `{ projectId: { in: [] } }` —
 * an empty `IN` list, which matches no row. It is never `undefined`, which
 * Prisma drops from a `where` entirely rather than treating as "match
 * nothing". That distinction is C4's exact failure: the change-order export
 * route used `projectId ? { projectId } : undefined`, which fell to
 * `undefined` for a user who could reach no project, and that user
 * exported every change order in the database. Not yet called anywhere:
 * application is G2.1.
 *
 * Only for a model whose scoping column is literally `projectId`. A model
 * scoped some other way (`PurchaseOrder.projectId` is nullable; `Supplier`
 * has no project column at all and is a fleet-wide directory) needs its own
 * fragment built from `listProjectsForUser` directly.
 */
export async function scopedProjectFilter(
  user: NonNullable<CurrentUser>
): Promise<{ projectId: { in: string[] } }> {
  const available = await listProjectsForUser(user.id);
  return { projectId: { in: available.map((p) => p.id) } };
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

/**
 * Filter a candidate list of user ids down to those who can reach
 * `projectId` — for a role-based notification fan-out, so "everyone
 * holding this permission" does not mean "everyone on the platform"
 * (workflow-logic `[NOTIFICATIONS]` — recipient lookups are global, not
 * scoped to the project).
 */
export async function usersReachingProject(userIds: string[], projectId: string): Promise<string[]> {
  const reach = await Promise.all(
    userIds.map(async (id) => ((await listProjectsForUser(id)).some((p) => p.id === projectId) ? id : null))
  );
  return reach.filter((id): id is string => !!id);
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
