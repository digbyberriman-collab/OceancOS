import { describe, it, expect, vi, beforeEach } from "vitest";

const { userRoleFindMany, projectFindMany } = vi.hoisted(() => ({
  userRoleFindMany: vi.fn(),
  projectFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findMany: userRoleFindMany },
    project: { findMany: projectFindMany },
  },
}));

// listProjectsForUser never calls cookies(); this stub only exists so the
// module (which also exports functions that do) imports cleanly outside a
// request context.
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

import { listProjectsForUser } from "@/lib/project";

function project(id: string) {
  return { id, name: `Project ${id}`, code: id, status: "ACTIVE", vessel: { name: `Vessel ${id}` } };
}

beforeEach(() => {
  userRoleFindMany.mockReset();
  projectFindMany.mockReset();
});

describe("listProjectsForUser — G1.4 fail-closed scoping", () => {
  it("resolves an unscoped platform-wide role (OWNER) to every active project, unchanged", async () => {
    userRoleFindMany.mockResolvedValue([{ projectId: null, vesselId: null, role: { key: "OWNER" } }]);
    projectFindMany.mockResolvedValue([project("p1"), project("p2")]);

    const result = await listProjectsForUser("u1");

    expect(result.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(projectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archivedAt: null } })
    );
  });

  it("resolves an unscoped non-platform role (CONTRACTOR) to no project", async () => {
    userRoleFindMany.mockResolvedValue([
      { projectId: null, vesselId: null, role: { key: "CONTRACTOR" } },
    ]);

    const result = await listProjectsForUser("u2");

    expect(result).toEqual([]);
    // The fail-closed branch returns before querying projects at all.
    expect(projectFindMany).not.toHaveBeenCalled();
  });

  it("resolves an unscoped non-platform role (YARD_PM) to no project, not every project", async () => {
    userRoleFindMany.mockResolvedValue([{ projectId: null, vesselId: null, role: { key: "YARD_PM" } }]);

    const result = await listProjectsForUser("u3");

    expect(result).toEqual([]);
  });

  it("resolves a project-scoped role to its own project only", async () => {
    userRoleFindMany.mockResolvedValue([
      { projectId: "p1", vesselId: null, role: { key: "CAPTAIN" } },
    ]);
    projectFindMany.mockResolvedValue([project("p1")]);

    const result = await listProjectsForUser("u4");

    expect(result.map((p) => p.id)).toEqual(["p1"]);
    expect(projectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archivedAt: null, OR: [{ id: { in: ["p1"] } }] },
      })
    );
  });

  it("resolves a vessel-scoped role to projects on that vessel only", async () => {
    userRoleFindMany.mockResolvedValue([
      { projectId: null, vesselId: "v1", role: { key: "CHIEF_ENGINEER" } },
    ]);
    projectFindMany.mockResolvedValue([project("p1")]);

    const result = await listProjectsForUser("u5");

    expect(result.map((p) => p.id)).toEqual(["p1"]);
    expect(projectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archivedAt: null, OR: [{ vesselId: { in: ["v1"] } }] },
      })
    );
  });

  it("a platform-wide role with an explicit project scope on one row is still unscoped overall", async () => {
    // Mixed rows: one unscoped OWNER-ish assignment plus a second, scoped one.
    // The unscoped platform-wide row still grants every project.
    userRoleFindMany.mockResolvedValue([
      { projectId: null, vesselId: null, role: { key: "OWNERS_REP" } },
      { projectId: "p1", vesselId: null, role: { key: "OWNERS_REP" } },
    ]);
    projectFindMany.mockResolvedValue([project("p1"), project("p2")]);

    const result = await listProjectsForUser("u6");

    expect(result.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(projectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archivedAt: null } })
    );
  });

  it("a user with no role assignments at all reaches no project", async () => {
    userRoleFindMany.mockResolvedValue([]);

    const result = await listProjectsForUser("u7");

    expect(result).toEqual([]);
    expect(projectFindMany).not.toHaveBeenCalled();
  });
});
