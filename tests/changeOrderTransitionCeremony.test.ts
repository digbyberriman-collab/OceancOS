import { describe, it, expect, vi, beforeEach } from "vitest";
import { PERMISSIONS } from "@/lib/rbac";
import { isActionError } from "@/lib/errors";

// audit/findings-phase5.md, Critical: permissionForTransition falls back to
// CO_EDIT for every status it doesn't special-case, including APPROVED,
// REJECTED and MORE_INFO — and CO_LEGAL_TRANSITIONS must still list those as
// legal edges so decideChangeOrderApproval itself can reach them. Neither
// check alone stops the generic transitionChangeOrder action from reaching
// them directly: a PROJECT_MANAGER or OWNERS_REP holding CO_EDIT (neither
// holds any CO_APPROVE_* permission) could post transitionChangeOrder(id,
// "APPROVED") and skip the entire approval chain — no stage decisions
// recorded, no sequencing, no approvedCost set. This test calls the real
// exported action to prove the ceremony-only statuses are refused outright,
// before the permission or legality checks even run.

const { requireUser, changeOrderFindUnique, listProjectsForUser, transaction } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  changeOrderFindUnique: vi.fn(),
  listProjectsForUser: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    changeOrder: { findUnique: changeOrderFindUnique },
    changeOrderApproval: { updateMany: vi.fn() },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/project", () => ({
  listProjectsForUser,
  requireProjectAccess: vi.fn().mockResolvedValue(undefined),
  usersWithPermissionOnProject: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { transitionChangeOrder } from "@/app/(app)/change-orders/actions";

function fakeUser(perms: string[]) {
  return {
    id: "pm1",
    email: "pm@example.com",
    name: "Test PM",
    roles: [],
    roleKeys: [],
    permissions: new Set(perms),
  } as any;
}

const co = {
  id: "co1",
  projectId: "p1",
  status: "UNDER_REVIEW",
  createdById: "creator1",
  project: { id: "p1", vesselId: "v1" },
};

beforeEach(() => {
  changeOrderFindUnique.mockReset().mockResolvedValue(co);
  listProjectsForUser.mockReset().mockResolvedValue([{ id: "p1" }]);
  transaction.mockReset().mockResolvedValue(undefined);
  // CO_EDIT only — no CO_APPROVE_* permission for any stage, the shape of a
  // PROJECT_MANAGER or OWNERS_REP per rbac.ts.
  requireUser.mockResolvedValue(fakeUser([PERMISSIONS.CO_EDIT]));
});

describe("transitionChangeOrder — the approval-chain side door", () => {
  it.each(["APPROVED", "REJECTED", "MORE_INFO"] as const)(
    "refuses to move straight to %s, even for a caller holding CO_EDIT",
    async (target) => {
      const err = await transitionChangeOrder("co1", target).catch((e) => e);

      expect(isActionError(err)).toBe(true);
      expect(err.kind).toBe("forbidden");
      expect(transaction).not.toHaveBeenCalled();
    }
  );

  it("still allows an ordinary legal transition CO_EDIT actually covers", async () => {
    changeOrderFindUnique.mockResolvedValue({ ...co, status: "APPROVED" });

    const err = await transitionChangeOrder("co1", "IN_PROGRESS").catch((e) => e);

    expect(isActionError(err)).toBe(false);
    expect(transaction).toHaveBeenCalled();
  });
});
