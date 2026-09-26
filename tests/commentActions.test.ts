import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/lib/rbac";
import { isActionError } from "@/lib/errors";

// Both comment actions are Server Actions, reachable over the wire
// independently of whatever the detail page renders — the page gating the
// comment form behind CO_VIEW/CR_VIEW never stopped a request landing on the
// action directly. These tests call the real exported functions the way a
// crafted request would, with everything else mocked, to prove the action
// itself now refuses what the page merely used to hide (G2.12).

const {
  requireUser,
  changeOrderFindUnique,
  crewRequestFindUnique,
  commentCreate,
  requireProjectAccess,
  recordAudit,
  revalidatePath,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  changeOrderFindUnique: vi.fn(),
  crewRequestFindUnique: vi.fn(),
  commentCreate: vi.fn(),
  requireProjectAccess: vi.fn(),
  recordAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    changeOrder: { findUnique: changeOrderFindUnique },
    crewRequest: { findUnique: crewRequestFindUnique },
    comment: { create: commentCreate },
  },
}));
vi.mock("@/lib/project", () => ({
  getActiveProject: vi.fn(),
  requireProjectAccess,
  usersReachingProject: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/audit", () => ({ recordAudit }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { addChangeOrderComment } from "@/app/(app)/change-orders/actions";
import { addCrewRequestComment } from "@/app/(app)/crew-requests/actions";

function fakeUser(perms: string[]) {
  return {
    id: "u1",
    email: "u@example.com",
    name: "Test User",
    roles: [],
    roleKeys: [],
    permissions: new Set(perms),
  } as any;
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  changeOrderFindUnique.mockReset();
  crewRequestFindUnique.mockReset();
  commentCreate.mockReset();
  requireProjectAccess.mockReset().mockResolvedValue(undefined);
  recordAudit.mockReset();
  revalidatePath.mockReset();
});

describe("addChangeOrderComment", () => {
  it("refuses a user with no CO_VIEW, without looking up the change order or writing a comment", async () => {
    requireUser.mockResolvedValue(fakeUser([]));

    const err = await addChangeOrderComment(formData({ id: "co1", body: "hi" })).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(changeOrderFindUnique).not.toHaveBeenCalled();
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("refuses when the named change order does not exist — no orphan comment", async () => {
    requireUser.mockResolvedValue(fakeUser([PERMISSIONS.CO_VIEW]));
    changeOrderFindUnique.mockResolvedValue(null);

    const err = await addChangeOrderComment(formData({ id: "missing", body: "hi" })).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("not-found");
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("checks project access against the change order's own project before writing", async () => {
    requireUser.mockResolvedValue(fakeUser([PERMISSIONS.CO_VIEW]));
    changeOrderFindUnique.mockResolvedValue({ projectId: "p-other" });
    requireProjectAccess.mockRejectedValue(new Error("no access"));

    await expect(addChangeOrderComment(formData({ id: "co1", body: "hi" }))).rejects.toThrow(
      "no access"
    );

    expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), "p-other");
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("writes the comment once every check passes", async () => {
    requireUser.mockResolvedValue(fakeUser([PERMISSIONS.CO_VIEW]));
    changeOrderFindUnique.mockResolvedValue({ projectId: "p1" });

    await addChangeOrderComment(formData({ id: "co1", body: "Looks good" }));

    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: "Looks good",
          resource: "ChangeOrder",
          resourceId: "co1",
          changeOrderId: "co1",
        }),
      })
    );
  });
});

describe("addCrewRequestComment", () => {
  it("refuses a user with no CR_VIEW, without looking up the request or writing a comment", async () => {
    requireUser.mockResolvedValue(fakeUser([]));

    const err = await addCrewRequestComment(formData({ id: "cr1", body: "hi" })).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(crewRequestFindUnique).not.toHaveBeenCalled();
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("refuses when the named crew request does not exist — no orphan comment", async () => {
    requireUser.mockResolvedValue(fakeUser([PERMISSIONS.CR_VIEW]));
    crewRequestFindUnique.mockResolvedValue(null);

    const err = await addCrewRequestComment(formData({ id: "missing", body: "hi" })).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("not-found");
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("checks project access against the crew request's own project before writing", async () => {
    requireUser.mockResolvedValue(fakeUser([PERMISSIONS.CR_VIEW]));
    crewRequestFindUnique.mockResolvedValue({ projectId: "p-other" });
    requireProjectAccess.mockRejectedValue(new Error("no access"));

    await expect(addCrewRequestComment(formData({ id: "cr1", body: "hi" }))).rejects.toThrow(
      "no access"
    );

    expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), "p-other");
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("writes the comment once every check passes", async () => {
    requireUser.mockResolvedValue(fakeUser([PERMISSIONS.CR_VIEW]));
    crewRequestFindUnique.mockResolvedValue({ projectId: "p1" });

    await addCrewRequestComment(formData({ id: "cr1", body: "On it" }));

    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: "On it",
          resource: "CrewRequest",
          resourceId: "cr1",
          crewRequestId: "cr1",
        }),
      })
    );
  });
});
