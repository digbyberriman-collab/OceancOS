import { describe, it, expect } from "vitest";
import {
  CO_LEGAL_TRANSITIONS,
  CO_STAGE_PERMISSION,
  CO_TERMINAL_STATUSES,
  canTransitionChangeOrder,
  assertTransitionChangeOrder,
  changeOrderActions,
  permissionForTransition,
  canDecideApproval,
  nextChangeOrderStatus,
  nextDueApprovals,
} from "@/lib/workflow/changeOrder";
import { CHANGE_ORDER_STATUSES, CO_APPROVAL_STAGES } from "@/lib/enums";
import { PERMISSIONS } from "@/lib/rbac";
import { isActionError } from "@/lib/errors";

describe("change order legal transitions", () => {
  it("covers every status", () => {
    for (const status of CHANGE_ORDER_STATUSES) {
      expect(CO_LEGAL_TRANSITIONS[status], `missing map entry for ${status}`).toBeDefined();
    }
  });

  it("only ever targets a known status", () => {
    for (const [from, targets] of Object.entries(CO_LEGAL_TRANSITIONS)) {
      for (const to of targets) {
        expect(CHANGE_ORDER_STATUSES, `${from} → ${to}`).toContain(to);
      }
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const [from, targets] of Object.entries(CO_LEGAL_TRANSITIONS)) {
      expect(targets, `${from} → ${from}`).not.toContain(from);
    }
  });

  it("leaves terminal statuses with no way out", () => {
    for (const status of CO_TERMINAL_STATUSES) {
      expect(CO_LEGAL_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("allows the documented happy path", () => {
    const path = [
      "DRAFT",
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "IN_PROGRESS",
      "COMPLETED",
      "CLOSED",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionChangeOrder(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(
        true
      );
    }
  });

  it("rejects reopening a closed change order", () => {
    expect(canTransitionChangeOrder("CLOSED", "DRAFT")).toBe(false);
    expect(() => assertTransitionChangeOrder("CLOSED", "DRAFT")).toThrow(/can no longer move/);
  });

  it("throws an ActionError of kind conflict, not a bare Error (ACTION_PLAN.md G3.6)", () => {
    try {
      assertTransitionChangeOrder("CLOSED", "DRAFT");
      expect.unreachable();
    } catch (e) {
      expect(isActionError(e)).toBe(true);
      expect((e as { kind?: string }).kind).toBe("conflict");
    }
  });

  it("rejects skipping review", () => {
    expect(canTransitionChangeOrder("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionChangeOrder("SUBMITTED", "COMPLETED")).toBe(false);
  });

  it("lets a rejected change order be revised", () => {
    expect(canTransitionChangeOrder("REJECTED", "DRAFT")).toBe(true);
  });

  it("lets a change order sent back for more information be revised too (ACTION_PLAN.md G3.9)", () => {
    // Before this, MORE_INFO had no route back to an editable state at all —
    // only REJECTED did, so an approver's question could only be answered
    // with a free-text comment, never by actually changing the figures.
    expect(canTransitionChangeOrder("MORE_INFO", "DRAFT")).toBe(true);
  });

  it("lets an approval decision resolve the chain from any status a pending row is valid in", () => {
    // decideChangeOrderApproval accepts a decision while status is SUBMITTED,
    // UNDER_REVIEW or MORE_INFO (G2.2) — a decision completing or rejecting
    // the chain must be able to land from all three, not only UNDER_REVIEW.
    for (const from of ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO"] as const) {
      expect(canTransitionChangeOrder(from, "APPROVED"), `${from} → APPROVED`).toBe(true);
      expect(canTransitionChangeOrder(from, "REJECTED"), `${from} → REJECTED`).toBe(true);
    }
  });
});

describe("transition permissions", () => {
  it("requires the submit permission to submit", () => {
    expect(permissionForTransition("SUBMITTED")).toBe(PERMISSIONS.CO_SUBMIT);
  });

  it("requires the cancel permission to cancel", () => {
    expect(permissionForTransition("CANCELLED")).toBe(PERMISSIONS.CO_CANCEL);
  });

  it("falls back to the edit permission", () => {
    expect(permissionForTransition("IN_PROGRESS")).toBe(PERMISSIONS.CO_EDIT);
  });

  it("maps every approval stage to a permission", () => {
    for (const stage of CO_APPROVAL_STAGES) {
      expect(CO_STAGE_PERMISSION[stage], `stage ${stage}`).toBeTruthy();
    }
  });
});

describe("offered actions", () => {
  it("offers only legal transitions", () => {
    for (const status of CHANGE_ORDER_STATUSES) {
      for (const action of changeOrderActions(status)) {
        expect(canTransitionChangeOrder(status, action.to), `${status} → ${action.to}`).toBe(true);
      }
    }
  });

  it("never offers approve or reject as a direct button", () => {
    for (const status of CHANGE_ORDER_STATUSES) {
      const targets = changeOrderActions(status).map((a) => a.to);
      expect(targets).not.toContain("APPROVED");
      expect(targets).not.toContain("REJECTED");
    }
  });

  it("offers nothing on a closed change order", () => {
    expect(changeOrderActions("CLOSED")).toEqual([]);
    expect(changeOrderActions("CANCELLED")).toEqual([]);
  });

  it("offers submit and cancel on a draft", () => {
    const actions = changeOrderActions("DRAFT");
    expect(actions.map((a) => a.to).sort()).toEqual(["CANCELLED", "SUBMITTED"]);
    expect(actions.find((a) => a.to === "CANCELLED")?.tone).toBe("danger");
  });

  it("labels the return from more-information as resuming review", () => {
    const action = changeOrderActions("MORE_INFO").find((a) => a.to === "UNDER_REVIEW");
    expect(action?.label).toBe("Resume review");
  });

  it("gives every action a label and a permission", () => {
    for (const status of CHANGE_ORDER_STATUSES) {
      for (const action of changeOrderActions(status)) {
        expect(action.label.length).toBeGreaterThan(0);
        expect(action.permission.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("canDecideApproval", () => {
  const chain = (overrides: Partial<import("@/lib/workflow/changeOrder").ApprovalRow>[]) =>
    overrides.map((o, i) => ({
      id: o.id ?? `a${i}`,
      stage: o.stage ?? "STAGE",
      decision: o.decision ?? "PENDING",
      required: o.required ?? true,
      order: o.order ?? i,
    }));

  it("allows the first stage in an untouched chain", () => {
    const rows = chain([{ id: "a0", order: 0 }, { id: "a1", order: 1 }, { id: "a2", order: 2 }]);
    expect(canDecideApproval(rows[0], rows)).toBe(true);
  });

  it("blocks a later stage while an earlier required stage is still pending", () => {
    const rows = chain([{ id: "a0", order: 0 }, { id: "a1", order: 1 }]);
    expect(canDecideApproval(rows[1], rows)).toBe(false);
  });

  it("allows a later stage once the earlier one has decided, whichever way", () => {
    const approved = chain([{ id: "a0", order: 0, decision: "APPROVED" }, { id: "a1", order: 1 }]);
    expect(canDecideApproval(approved[1], approved)).toBe(true);

    const rejected = chain([{ id: "a0", order: 0, decision: "REJECTED" }, { id: "a1", order: 1 }]);
    expect(canDecideApproval(rejected[1], rejected)).toBe(true);
  });

  it("ignores an earlier stage that is optional (not required)", () => {
    const rows = chain([
      { id: "a0", order: 0, required: false },
      { id: "a1", order: 1 },
    ]);
    expect(canDecideApproval(rows[1], rows)).toBe(true);
  });

  it("refuses a row that has already been decided — no re-deciding a settled approval", () => {
    const rows = chain([{ id: "a0", order: 0, decision: "APPROVED" }]);
    expect(canDecideApproval(rows[0], rows)).toBe(false);
  });

  it("two stages sharing the same order do not block each other", () => {
    const rows = chain([{ id: "a0", order: 0 }, { id: "a1", order: 0 }]);
    expect(canDecideApproval(rows[0], rows)).toBe(true);
    expect(canDecideApproval(rows[1], rows)).toBe(true);
  });
});

describe("nextChangeOrderStatus", () => {
  const row = (decision: string, order = 0) => ({ id: `a${order}`, stage: "S", decision, required: true, order });

  it("rejects unconditionally, regardless of siblings", () => {
    const siblings = [row("REJECTED"), row("PENDING", 1), row("APPROVED", 2)];
    expect(nextChangeOrderStatus("UNDER_REVIEW", "REJECTED", siblings)).toBe("REJECTED");
  });

  it("does not let remaining approvals override a rejection — the C7 fix", () => {
    // The exact shape of the original bug: one REJECTED row, the rest
    // PENDING. The old code counted PENDING rows and found 0 remaining
    // once they'd all been (wrongly) decided, and set APPROVED. This
    // function is never even asked to decide completeness for a REJECTED
    // decision — it returns REJECTED immediately.
    const siblings = [row("REJECTED"), row("PENDING", 1), row("PENDING", 2)];
    expect(nextChangeOrderStatus("UNDER_REVIEW", "REJECTED", siblings)).toBe("REJECTED");
  });

  it("moves to MORE_INFO unconditionally too", () => {
    const siblings = [row("MORE_INFO"), row("PENDING", 1)];
    expect(nextChangeOrderStatus("SUBMITTED", "MORE_INFO", siblings)).toBe("MORE_INFO");
  });

  it("completes to APPROVED once every required row is APPROVED", () => {
    const siblings = [row("APPROVED"), row("APPROVED", 1), row("APPROVED", 2)];
    expect(nextChangeOrderStatus("UNDER_REVIEW", "APPROVED", siblings)).toBe("APPROVED");
  });

  it("ignores an optional row still pending when deciding completeness", () => {
    const siblings = [row("APPROVED"), { ...row("PENDING", 1), required: false }];
    expect(nextChangeOrderStatus("UNDER_REVIEW", "APPROVED", siblings)).toBe("APPROVED");
  });

  it("moves SUBMITTED to UNDER_REVIEW on a partial approval", () => {
    const siblings = [row("APPROVED"), row("PENDING", 1)];
    expect(nextChangeOrderStatus("SUBMITTED", "APPROVED", siblings)).toBe("UNDER_REVIEW");
  });

  it("moves MORE_INFO to UNDER_REVIEW on a partial approval", () => {
    const siblings = [row("APPROVED"), row("PENDING", 1)];
    expect(nextChangeOrderStatus("MORE_INFO", "APPROVED", siblings)).toBe("UNDER_REVIEW");
  });

  it("returns null — not a self-transition — for a partial approval while already UNDER_REVIEW", () => {
    const siblings = [row("APPROVED"), row("PENDING", 1)];
    expect(nextChangeOrderStatus("UNDER_REVIEW", "APPROVED", siblings)).toBeNull();
  });
});

describe("nextDueApprovals", () => {
  const row = (order: number, decision = "PENDING", required = true) => ({
    id: `a${order}`,
    stage: `STAGE_${order}`,
    decision,
    required,
    order,
  });

  it("returns the lowest-order pending stage", () => {
    const approvals = [row(0, "APPROVED"), row(1), row(2)];
    expect(nextDueApprovals(approvals).map((a) => a.id)).toEqual(["a1"]);
  });

  it("returns every stage sharing the lowest pending order", () => {
    const approvals = [row(0, "APPROVED"), row(1), row(1)];
    expect(nextDueApprovals(approvals).map((a) => a.id)).toEqual(["a1", "a1"]);
  });

  it("skips optional rows", () => {
    const approvals = [row(0, "PENDING", false), row(1)];
    expect(nextDueApprovals(approvals).map((a) => a.id)).toEqual(["a1"]);
  });

  it("is empty once nothing required is pending", () => {
    expect(nextDueApprovals([row(0, "APPROVED"), row(1, "REJECTED")])).toEqual([]);
  });
});
