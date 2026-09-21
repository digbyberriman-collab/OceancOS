import { describe, it, expect } from "vitest";
import { resolveProjectWhere } from "@/lib/project";

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

  it("scopes to named vessels", () => {
    const scopes = [{ projectId: null, vesselId: "v1" }];
    expect(resolveProjectWhere(scopes)).toEqual({
      archivedAt: null,
      OR: [{ vesselId: { in: ["v1"] } }],
    });
  });

  it("combines project and vessel scopes in one OR", () => {
    const scopes = [
      { projectId: "p1", vesselId: null },
      { projectId: null, vesselId: "v1" },
    ];
    expect(resolveProjectWhere(scopes)).toEqual({
      archivedAt: null,
      OR: [{ id: { in: ["p1"] } }, { vesselId: { in: ["v1"] } }],
    });
  });

  it("resolves to null — not an empty OR — for a user with no role assignments", () => {
    // An empty `OR: []` matches every row in Prisma, which would silently
    // hand this user every project. null is the caller's signal to return
    // nothing without querying at all.
    expect(resolveProjectWhere([])).toBeNull();
  });
});
