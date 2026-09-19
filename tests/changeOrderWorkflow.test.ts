import { describe, it, expect } from "vitest";
import {
  CO_LEGAL_TRANSITIONS,
  CO_STAGE_PERMISSION,
  CO_TERMINAL_STATUSES,
  canTransitionChangeOrder,
  assertTransitionChangeOrder,
  changeOrderActions,
  permissionForTransition,
} from "@/lib/workflow/changeOrder";
import { CHANGE_ORDER_STATUSES, CO_APPROVAL_STAGES } from "@/lib/enums";
import { PERMISSIONS } from "@/lib/rbac";

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
    expect(() => assertTransitionChangeOrder("CLOSED", "DRAFT")).toThrow(/Illegal transition/);
  });

  it("rejects skipping review", () => {
    expect(canTransitionChangeOrder("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionChangeOrder("SUBMITTED", "COMPLETED")).toBe(false);
  });

  it("lets a rejected change order be revised", () => {
    expect(canTransitionChangeOrder("REJECTED", "DRAFT")).toBe(true);
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
