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

import {
  listProjectsForUser,
  requireProjectAccess,
  scopedProjectFilter,
  usersReachingProject,
} from "@/lib/project";
import { isActionError } from "@/lib/errors";

function project(id: string) {
  return { id, name: `Project ${id}`, code: id, status: "ACTIVE", vessel: { name: `Vessel ${id}` } };
}

function fakeUser(id: string) {
  return {
    id,
    email: `${id}@example.com`,
    name: "Test User",
    roles: [],
    roleKeys: [],
    permissions: new Set<string>(),
  } as any;
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

describe("requireProjectAccess — G1.2 write-path guard", () => {
  it("throws a forbidden ActionError for the zero-project case", async () => {
    userRoleFindMany.mockResolvedValue([
      { projectId: null, vesselId: null, role: { key: "CONTRACTOR" } },
    ]);

    const err = await requireProjectAccess(fakeUser("u1"), "p1").catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
  });

  it("passes for a project a vessel-scoped user can reach", async () => {
    userRoleFindMany.mockResolvedValue([
      { projectId: null, vesselId: "v1", role: { key: "CHIEF_ENGINEER" } },
    ]);
    projectFindMany.mockResolvedValue([project("p1")]);

    await expect(requireProjectAccess(fakeUser("u1"), "p1")).resolves.toBeUndefined();
  });

  it("throws for a project a vessel-scoped user cannot reach", async () => {
    userRoleFindMany.mockResolvedValue([
      { projectId: null, vesselId: "v1", role: { key: "CHIEF_ENGINEER" } },
    ]);
    projectFindMany.mockResolvedValue([project("p1")]);

    const err = await requireProjectAccess(fakeUser("u1"), "p2").catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
  });

  it("passes for any project an unscoped owner-side user reaches", async () => {
    userRoleFindMany.mockResolvedValue([{ projectId: null, vesselId: null, role: { key: "OWNER" } }]);
    projectFindMany.mockResolvedValue([project("p1"), project("p2")]);

    await expect(requireProjectAccess(fakeUser("u1"), "p2")).resolves.toBeUndefined();
  });
});

describe("usersReachingProject — G2.1 notification fan-out scoping", () => {
  it("keeps only candidates who can actually reach the project", async () => {
    userRoleFindMany.mockImplementation(async (args: any) => {
      const userId = args.where.userId;
      if (userId === "scoped-to-p1") {
        return [{ projectId: "p1", vesselId: null, role: { key: "YARD_PM" } }];
      }
      if (userId === "scoped-to-p2") {
        return [{ projectId: "p2", vesselId: null, role: { key: "YARD_PM" } }];
      }
      if (userId === "platform-wide") {
        return [{ projectId: null, vesselId: null, role: { key: "OWNER" } }];
      }
      return [];
    });
    projectFindMany.mockImplementation(async (args: any) => {
      const all = [project("p1"), project("p2")];
      if (!args.where.OR) return all; // the unscoped-platform-role branch
      const ids: string[] = args.where.OR[0]?.id?.in ?? [];
      return all.filter((p) => ids.includes(p.id));
    });

    const result = await usersReachingProject(
      ["scoped-to-p1", "scoped-to-p2", "platform-wide", "no-roles"],
      "p1"
    );

    expect(result.sort()).toEqual(["platform-wide", "scoped-to-p1"].sort());
  });

  it("returns an empty list when nobody in the candidate set can reach the project", async () => {
    userRoleFindMany.mockResolvedValue([{ projectId: "p2", vesselId: null, role: { key: "YARD_PM" } }]);
    projectFindMany.mockResolvedValue([project("p2")]);

    const result = await usersReachingProject(["u1"], "p1");

    expect(result).toEqual([]);
  });
});

describe("scopedProjectFilter — G1.2 read-path guard", () => {
  it("returns a never-matching filter for the zero-project case, not undefined", async () => {
    userRoleFindMany.mockResolvedValue([
      { projectId: null, vesselId: null, role: { key: "CONTRACTOR" } },
    ]);

    const filter = await scopedProjectFilter(fakeUser("u1"));

    expect(filter).toEqual({ projectId: { in: [] } });
    // The bug this replaces: `projectId ? { projectId } : undefined`, which
    // Prisma drops entirely rather than treating as "match nothing".
    expect(filter.projectId).not.toBeUndefined();
  });

  it("scopes to exactly the projects a vessel-scoped user can reach", async () => {
    userRoleFindMany.mockResolvedValue([
      { projectId: null, vesselId: "v1", role: { key: "CHIEF_ENGINEER" } },
    ]);
    projectFindMany.mockResolvedValue([project("p1")]);

    const filter = await scopedProjectFilter(fakeUser("u1"));

    expect(filter).toEqual({ projectId: { in: ["p1"] } });
  });

  it("scopes to every project for an unscoped owner-side user", async () => {
    userRoleFindMany.mockResolvedValue([{ projectId: null, vesselId: null, role: { key: "OWNER" } }]);
    projectFindMany.mockResolvedValue([project("p1"), project("p2")]);

    const filter = await scopedProjectFilter(fakeUser("u1"));

    expect(filter).toEqual({ projectId: { in: ["p1", "p2"] } });
  });
});
