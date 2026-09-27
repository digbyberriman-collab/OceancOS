import { describe, it, expect } from "vitest";
import {
  resolveProjectWhere,
  resolveUserRoleWhereForProject,
  rolesCoverVessel,
  sortProjectSummaries,
  workspaceProjectIds,
} from "@/lib/project";

describe("resolveProjectWhere", () => {
  it("admits everything for an unscoped role", () => {
    expect(resolveProjectWhere([{ projectId: null, vesselId: null }])).toEqual({
      archivedAt: null,
    });
  });

  it("an unscoped role wins even alongside a scoped one", () => {
    // e.g. a user holding both a project-specific role and a global one.
    const scopes = [
      { projectId: "p1", vesselId: null },
      { projectId: null, vesselId: null },
    ];
    expect(resolveProjectWhere(scopes)).toEqual({ archivedAt: null });
  });

  it("scopes to named projects", () => {
    const scopes = [{ projectId: "p1", vesselId: null }, { projectId: "p2", vesselId: null }];
    expect(resolveProjectWhere(scopes)).toEqual({
      archivedAt: null,
      OR: [{ id: { in: ["p1", "p2"] } }],
    });
  });

  it("scopes to named vessels, leaving out any demo project parked on them", () => {
    const scopes = [{ projectId: null, vesselId: "v1" }];
    expect(resolveProjectWhere(scopes)).toEqual({
      archivedAt: null,
      OR: [{ vesselId: { in: ["v1"] }, isDemo: false }],
    });
  });

  it("combines project and vessel scopes in one OR", () => {
    const scopes = [
      { projectId: "p1", vesselId: null },
      { projectId: null, vesselId: "v1" },
    ];
    expect(resolveProjectWhere(scopes)).toEqual({
      archivedAt: null,
      OR: [{ id: { in: ["p1"] } }, { vesselId: { in: ["v1"] }, isDemo: false }],
    });
  });

  it("resolves to null — not an empty OR — for a user with no role assignments", () => {
    // An empty `OR: []` matches every row in Prisma, which would silently
    // hand this user every project. null is the caller's signal to return
    // nothing without querying at all.
    expect(resolveProjectWhere([])).toBeNull();
  });
});

describe("resolveUserRoleWhereForProject", () => {
  const project = { id: "p1", vesselId: "v1", isDemo: false };

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

  it("does not admit a role scoped to the vessel of a demo project", () => {
    const where = resolveUserRoleWhereForProject({ ...project, isDemo: true });
    expect(where.OR).not.toContainEqual({ vesselId: "v1" });
    expect(where.OR).toContainEqual({ projectId: "p1" });
    expect(where.OR).toContainEqual({ projectId: null, vesselId: null });
  });
});

describe("workspaceProjectIds", () => {
  const projects = [
    { id: "demo-1", isDemo: true },
    { id: "real-1", isDemo: false },
    { id: "demo-2", isDemo: true },
    { id: "real-2", isDemo: false },
  ];

  it("covers only real projects while working in a real one", () => {
    expect(workspaceProjectIds(projects, false)).toEqual(["real-1", "real-2"]);
  });

  it("covers only demo projects while working in a demo one", () => {
    expect(workspaceProjectIds(projects, true)).toEqual(["demo-1", "demo-2"]);
  });

  it("covers nothing for a user who can reach nothing", () => {
    expect(workspaceProjectIds([], false)).toEqual([]);
  });
});

describe("sortProjectSummaries", () => {
  const p = (code: string, status: string) => ({ code, status, name: code });

  it("lists active, then planned, then completed projects, each by code", () => {
    const sorted = sortProjectSummaries([
      p("Y709-2017", "COMPLETED"),
      p("Y701", "ACTIVE"),
      p("DEMO-02", "PLANNED"),
      p("Y701-2012", "COMPLETED"),
      p("DEMO-01", "ACTIVE"),
    ]);
    expect(sorted.map((x) => x.code)).toEqual(["DEMO-01", "Y701", "DEMO-02", "Y701-2012", "Y709-2017"]);
  });

  it("puts an unknown status after the known ones rather than dropping it", () => {
    const sorted = sortProjectSummaries([p("B", "SOMETHING"), p("A", "COMPLETED")]);
    expect(sorted.map((x) => x.code)).toEqual(["A", "B"]);
  });

  it("does not reorder the array it was given", () => {
    const input = [p("B", "ACTIVE"), p("A", "ACTIVE")];
    sortProjectSummaries(input);
    expect(input.map((x) => x.code)).toEqual(["B", "A"]);
  });
});

describe("rolesCoverVessel", () => {
  it("is true for an unscoped role", () => {
    expect(rolesCoverVessel([{ projectId: null, vesselId: null }], "v1")).toBe(true);
  });

  it("is true for a role scoped to the vessel, and not for another vessel", () => {
    expect(rolesCoverVessel([{ projectId: null, vesselId: "v1" }], "v1")).toBe(true);
    expect(rolesCoverVessel([{ projectId: null, vesselId: "v2" }], "v1")).toBe(false);
  });

  it("is false for a role scoped to one project, even one on the vessel", () => {
    expect(rolesCoverVessel([{ projectId: "p1", vesselId: null }], "v1")).toBe(false);
    expect(rolesCoverVessel([], "v1")).toBe(false);
  });
});
