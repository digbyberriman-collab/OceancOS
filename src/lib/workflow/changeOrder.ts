// Change-order workflow rules.
//
// Single source of truth for: which status transitions are legal, which
// permission each approval stage requires, and which transitions the UI offers.
// Kept free of Prisma and React so it can be unit-tested directly — this is the
// pattern the Job state machine follows in Phase 1 of BRIDGE_ALIGNMENT_PLAN.md.

import { PERMISSIONS, type PermissionKey } from "@/lib/rbac";
import type { ChangeOrderStatus, CoApprovalStage } from "@/lib/enums";

/** Permission required to decide each approval stage. */
export const CO_STAGE_PERMISSION: Record<CoApprovalStage, PermissionKey> = {
  CAPTAIN: PERMISSIONS.CO_APPROVE_CAPTAIN,
  OWNERS_REP: PERMISSIONS.CO_APPROVE_OWNERS_REP,
  YARD: PERMISSIONS.CO_APPROVE_YARD,
  FINANCE: PERMISSIONS.CO_APPROVE_FINANCE,
  TECH_MANAGER: PERMISSIONS.CO_APPROVE_TECH,
  CLASS: PERMISSIONS.CO_APPROVE_CLASS,
  FLAG: PERMISSIONS.CO_APPROVE_FLAG,
};

/**
 * Every transition the server will accept, keyed by current status.
 * Enforced in `transitionChangeOrder`; nothing may move a change order
 * along an edge that is not listed here.
 */
export const CO_LEGAL_TRANSITIONS: Record<ChangeOrderStatus, ChangeOrderStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "MORE_INFO", "CANCELLED"],
  UNDER_REVIEW: ["MORE_INFO", "APPROVED", "REJECTED"],
  MORE_INFO: ["UNDER_REVIEW", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
  REJECTED: ["DRAFT"],
  CANCELLED: [],
};

/** Terminal statuses — nothing moves out of these. */
export const CO_TERMINAL_STATUSES: ChangeOrderStatus[] = ["CLOSED", "CANCELLED"];

export function canTransitionChangeOrder(from: ChangeOrderStatus, to: ChangeOrderStatus): boolean {
  return CO_LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransitionChangeOrder(from: ChangeOrderStatus, to: ChangeOrderStatus) {
  if (!canTransitionChangeOrder(from, to)) {
    throw new Error(`Illegal transition ${from} → ${to}`);
  }
}

/** Permission a user needs to perform a given transition. */
export function permissionForTransition(to: ChangeOrderStatus): PermissionKey {
  if (to === "SUBMITTED") return PERMISSIONS.CO_SUBMIT;
  if (to === "CANCELLED") return PERMISSIONS.CO_CANCEL;
  return PERMISSIONS.CO_EDIT;
}

export type ChangeOrderAction = {
  to: ChangeOrderStatus;
  label: string;
  permission: PermissionKey;
  tone: "primary" | "danger";
};

const ACTION_LABELS: Partial<Record<ChangeOrderStatus, string>> = {
  SUBMITTED: "Submit for review",
  UNDER_REVIEW: "Move to review",
  MORE_INFO: "Request more information",
  APPROVED: "Approve",
  REJECTED: "Reject",
  IN_PROGRESS: "Start work",
  COMPLETED: "Mark completed",
  CLOSED: "Close",
  CANCELLED: "Cancel",
  DRAFT: "Revise",
};

/**
 * Transitions offered as buttons on the detail page.
 *
 * APPROVED, REJECTED and MORE_INFO are deliberately excluded: those are reached
 * by deciding the approval chain, not by a direct status button. Every other
 * legal edge is offered and then gated by the user's permission.
 */
const NOT_OFFERED_AS_BUTTON: ChangeOrderStatus[] = ["APPROVED", "REJECTED", "MORE_INFO"];

export function changeOrderActions(from: ChangeOrderStatus): ChangeOrderAction[] {
  return (CO_LEGAL_TRANSITIONS[from] ?? [])
    .filter((to) => !NOT_OFFERED_AS_BUTTON.includes(to))
    .map((to) => ({
      to,
      label:
        from === "MORE_INFO" && to === "UNDER_REVIEW"
          ? "Resume review"
          : ACTION_LABELS[to] ?? to.replace(/_/g, " "),
      permission: permissionForTransition(to),
      tone: to === "CANCELLED" ? ("danger" as const) : ("primary" as const),
    }));
}
