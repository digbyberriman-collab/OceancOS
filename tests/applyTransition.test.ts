import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/lib/rbac";
import { isActionError } from "@/lib/errors";

const { jobUpdateMany, changeOrderUpdateMany, requireProjectAccess } = vi.hoisted(() => ({
  jobUpdateMany: vi.fn(),
  changeOrderUpdateMany: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    job: { updateMany: jobUpdateMany },
    changeOrder: { updateMany: changeOrderUpdateMany },
  },
}));

vi.mock("@/lib/project", () => ({
  requireProjectAccess,
}));

import { applyTransition } from "@/lib/workflow/applyTransition";

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

beforeEach(() => {
  jobUpdateMany.mockReset();
  changeOrderUpdateMany.mockReset();
  requireProjectAccess.mockReset();
  requireProjectAccess.mockResolvedValue(undefined);
});

describe("applyTransition — the single status write path", () => {
  it("writes the new status conditionally on the status just read", async () => {
    jobUpdateMany.mockResolvedValue({ count: 1 });

    await applyTransition({
      entity: "Job",
      id: "j1",
      projectId: "p1",
      from: "NEW_REQUEST",
      to: "QUOTE_SENT",
      actor: fakeUser([PERMISSIONS.JOB_ISSUE_QUOTE]),
      permission: PERMISSIONS.JOB_ISSUE_QUOTE,
    });

    expect(jobUpdateMany).toHaveBeenCalledWith({
      where: { id: "j1", status: "NEW_REQUEST" },
      data: { status: "QUOTE_SENT" },
    });
  });

  it("merges extra data into the same write", async () => {
    jobUpdateMany.mockResolvedValue({ count: 1 });

    await applyTransition({
      entity: "Job",
      id: "j1",
      projectId: "p1",
      from: "ACCEPTED",
      to: "YARD_COMPLETED",
      actor: fakeUser([PERMISSIONS.JOB_COMPLETE]),
      permission: PERMISSIONS.JOB_COMPLETE,
      data: { progressPct: 100 },
    });

    expect(jobUpdateMany).toHaveBeenCalledWith({
      where: { id: "j1", status: "ACCEPTED" },
      data: { status: "YARD_COMPLETED", progressPct: 100 },
    });
  });

  it("throws a conflict, not a silent no-op, when no row matched the expected status", async () => {
    jobUpdateMany.mockResolvedValue({ count: 0 });

    const err = await applyTransition({
      entity: "Job",
      id: "j1",
      projectId: "p1",
      from: "NEW_REQUEST",
      to: "QUOTE_SENT",
      actor: fakeUser([PERMISSIONS.JOB_ISSUE_QUOTE]),
      permission: PERMISSIONS.JOB_ISSUE_QUOTE,
    }).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("conflict");
  });

  it("throws for an illegal transition without writing anything", async () => {
    const err = await applyTransition({
      entity: "Job",
      id: "j1",
      projectId: "p1",
      from: "NEW_REQUEST",
      to: "WORKS_ACCEPTED",
      actor: fakeUser([PERMISSIONS.JOB_WORKS_ACCEPT]),
      permission: PERMISSIONS.JOB_WORKS_ACCEPT,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });

  it("throws forbidden when the actor lacks the permission, without writing anything", async () => {
    const err = await applyTransition({
      entity: "Job",
      id: "j1",
      projectId: "p1",
      from: "NEW_REQUEST",
      to: "QUOTE_SENT",
      actor: fakeUser([]),
      permission: PERMISSIONS.JOB_ISSUE_QUOTE,
    }).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });

  it("checks project access before writing", async () => {
    requireProjectAccess.mockRejectedValue(new Error("no access"));

    await expect(
      applyTransition({
        entity: "Job",
        id: "j1",
        projectId: "p-other",
        from: "NEW_REQUEST",
        to: "QUOTE_SENT",
        actor: fakeUser([PERMISSIONS.JOB_ISSUE_QUOTE]),
        permission: PERMISSIONS.JOB_ISSUE_QUOTE,
      })
    ).rejects.toThrow("no access");

    expect(jobUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses CLIENT_ACCEPTED unconditionally, even for a user holding JOB_ACCEPT — this is C2", async () => {
    const err = await applyTransition({
      entity: "Job",
      id: "j1",
      projectId: "p1",
      from: "QUOTE_SENT",
      to: "CLIENT_ACCEPTED",
      actor: fakeUser([PERMISSIONS.JOB_ACCEPT]),
      permission: PERMISSIONS.JOB_ACCEPT,
    }).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses EXPIRED unconditionally — reached by the clock, not a person", async () => {
    const err = await applyTransition({
      entity: "Job",
      id: "j1",
      projectId: "p1",
      from: "QUOTE_SENT",
      to: "EXPIRED",
      actor: fakeUser([PERMISSIONS.JOB_ISSUE_QUOTE]),
      permission: PERMISSIONS.JOB_ISSUE_QUOTE,
    }).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
  });

  it("refuses APPROVED on a change order unconditionally, even for a user holding CO_EDIT — the bug found while building this", async () => {
    const err = await applyTransition({
      entity: "ChangeOrder",
      id: "co1",
      projectId: "p1",
      from: "UNDER_REVIEW",
      to: "APPROVED",
      actor: fakeUser([PERMISSIONS.CO_EDIT]),
      permission: PERMISSIONS.CO_EDIT,
    }).catch((e) => e);

    expect(isActionError(err)).toBe(true);
    expect(err.kind).toBe("forbidden");
    expect(changeOrderUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses REJECTED and MORE_INFO on a change order the same way", async () => {
    for (const to of ["REJECTED", "MORE_INFO"]) {
      const err = await applyTransition({
        entity: "ChangeOrder",
        id: "co1",
        projectId: "p1",
        from: "UNDER_REVIEW",
        to,
        actor: fakeUser([PERMISSIONS.CO_EDIT]),
        permission: PERMISSIONS.CO_EDIT,
      }).catch((e) => e);

      expect(isActionError(err)).toBe(true);
      expect(err.kind).toBe("forbidden");
    }
    expect(changeOrderUpdateMany).not.toHaveBeenCalled();
  });

  it("still allows a legal, non-decision change-order transition on CO_EDIT", async () => {
    changeOrderUpdateMany.mockResolvedValue({ count: 1 });

    await applyTransition({
      entity: "ChangeOrder",
      id: "co1",
      projectId: "p1",
      from: "DRAFT",
      to: "SUBMITTED",
      actor: fakeUser([PERMISSIONS.CO_SUBMIT]),
      permission: PERMISSIONS.CO_SUBMIT,
    });

    expect(changeOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "co1", status: "DRAFT" },
      data: { status: "SUBMITTED" },
    });
  });

  it("writes through a supplied interactive-transaction client instead of the plain one", async () => {
    const txJobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { job: { updateMany: txJobUpdateMany } } as any;

    await applyTransition({
      entity: "Job",
      id: "j1",
      projectId: "p1",
      from: "NEW_REQUEST",
      to: "QUOTE_SENT",
      actor: fakeUser([PERMISSIONS.JOB_ISSUE_QUOTE]),
      permission: PERMISSIONS.JOB_ISSUE_QUOTE,
      db: tx,
    });

    expect(txJobUpdateMany).toHaveBeenCalled();
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });
});
