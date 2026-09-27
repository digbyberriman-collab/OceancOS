import { describe, it, expect } from "vitest";
import { resolveProjectWhere, resolveUserRoleWhereForProject } from "@/lib/project";

describe("resolveProjectWhere", () => {
  it("admits everything for an unscoped platform-wide role", () => {
    expect(resolveProjectWhere([{ projectId: null, vesselId: null, roleKey: "OWNER" }])).toEqual({
      archivedAt: null,
    });
    expect(
      resolveProjectWhere([{ projectId: null, vesselId: null, roleKey: "OWNERS_REP" }])
    ).toEqual({ archivedAt: null });
  });

  it("an unscoped platform-wide role wins even alongside a scoped one", () => {
    // e.g. a user holding both a project-specific role and a global one.
    const scopes = [
      { projectId: "p1", vesselId: null, roleKey: "PROJECT_MANAGER" },
      { projectId: null, vesselId: null, roleKey: "OWNER" },
    ];
    expect(resolveProjectWhere(scopes)).toEqual({ archivedAt: null });
  });

  it("resolves to no project — not every project — for an unscoped non-platform-wide role", () => {
    // ACTION_PLAN.md G1.4 / AUDIT_REPORT_ADDENDUM.md C16: a yard PM,
    // contractor or class surveyor with no project or vessel named is a
    // provisioning gap, not a grant to every vessel on the platform.
    expect(
      resolveProjectWhere([{ projectId: null, vesselId: null, roleKey: "YARD_PM" }])
    ).toBeNull();
    expect(
      resolveProjectWhere([{ projectId: null, vesselId: null, roleKey: "CONTRACTOR" }])
    ).toBeNull();
  });

  it("scopes to named projects", () => {
    const scopes = [
      { projectId: "p1", vesselId: null, roleKey: "PROJECT_MANAGER" },
      { projectId: "p2", vesselId: null, roleKey: "PROJECT_MANAGER" },
    ];
    expect(resolveProjectWhere(scopes)).toEqual({
      archivedAt: null,
      OR: [{ id: { in: ["p1", "p2"] } }],
    });
  });

  it("scopes to named vessels", () => {
    const scopes = [{ projectId: null, vesselId: "v1", roleKey: "CAPTAIN" }];
    expect(resolveProjectWhere(scopes)).toEqual({
      archivedAt: null,
      OR: [{ vesselId: { in: ["v1"] } }],
    });
  });

  it("combines project and vessel scopes in one OR", () => {
    const scopes = [
      { projectId: "p1", vesselId: null, roleKey: "PROJECT_MANAGER" },
      { projectId: null, vesselId: "v1", roleKey: "CAPTAIN" },
    ];
    expect(resolveProjectWhere(scopes)).toEqual({
      archivedAt: null,
      OR: [{ id: { in: ["p1"] } }, { vesselId: { in: ["v1"] } }],
    });
  });

  it("a named project or vessel scope on a platform-wide role still narrows nothing away from it", () => {
    // Holding OWNER unscoped alongside a project-specific role of any kind
    // is still the "every project" branch — the platform-wide check looks
    // only for the unscoped row, not at what else the user holds.
    const scopes = [{ projectId: null, vesselId: null, roleKey: "OWNER" }];
    expect(resolveProjectWhere(scopes)).toEqual({ archivedAt: null });
  });

  it("resolves to null — not an empty OR — for a user with no role assignments", () => {
    // An empty `OR: []` matches every row in Prisma, which would silently
    // hand this user every project. null is the caller's signal to return
    // nothing without querying at all.
    expect(resolveProjectWhere([])).toBeNull();
  });
});

describe("resolveUserRoleWhereForProject", () => {
  const project = { id: "p1", vesselId: "v1" };

  it("admits an unscoped role", () => {
    const where = resolveUserRoleWhereForProject(project);
    expect(where.OR).toContainEqual({ projectId: null, vesselId: null });
  });

  it("admits a role scoped to this exact project", () => {
    const where = resolveUserRoleWhereForProject(project);
    expect(where.OR).toContainEqual({ projectId: "p1" });
  });

  it("admits a role scoped to this project's vessel", () => {
    const where = resolveUserRoleWhereForProject(project);
    expect(where.OR).toContainEqual({ vesselId: "v1" });
  });

  it("does not admit a different project or vessel", () => {
    const where = resolveUserRoleWhereForProject(project);
    expect(where.OR).not.toContainEqual({ projectId: "other" });
    expect(where.OR).not.toContainEqual({ vesselId: "other-vessel" });
  });
});
