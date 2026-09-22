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
 * Enforced in `transitionChangeOrder` and, since G2.2, in
 * `decideChangeOrderApproval` too — every write to `status` goes through
 * `assertTransitionChangeOrder`, with no exception for the approval path.
 *
 * SUBMITTED and MORE_INFO both reach APPROVED and REJECTED directly, not
 * only via UNDER_REVIEW: a decision that completes or rejects the chain can
 * land while the change order is in any of the three "awaiting a decision"
 * statuses a pending approval row is valid in (the same three
 * `decideChangeOrderApproval` checks against, and the approvals queue
 * filters to). Requiring a detour through UNDER_REVIEW first would need a
 * self-transition to represent "a decision was recorded but the chain isn't
 * settled yet", which the second test below deliberately forbids.
 */
export const CO_LEGAL_TRANSITIONS: Record<ChangeOrderStatus, ChangeOrderStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "MORE_INFO", "APPROVED", "REJECTED", "CANCELLED"],
  UNDER_REVIEW: ["MORE_INFO", "APPROVED", "REJECTED"],
  MORE_INFO: ["UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
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

// ---------------------------------------------------------------------------
// The approval-decision path.
//
// Pure decision logic for decideChangeOrderApproval, split out for the same
// reason resolveProjectWhere is: no Prisma, no side effects, directly
// unit-tested. This is the part of G2.2's rewrite that fixes AUDIT_REPORT.md
// C7 (a rejected change order could become APPROVED) and the sibling
// "approval chain's order is stored but never enforced" finding.
// ---------------------------------------------------------------------------

export type ApprovalRow = {
  id: string;
  stage: string;
  decision: string;
  required: boolean;
  order: number;
};

/**
 * Whether `approval` may be decided right now, given its siblings on the
 * same chain.
 *
 * Refuses a row that has already been decided — no re-deciding a settled
 * approval, which is what let one approver reverse a rejection. Refuses a
 * row with a required, still-`PENDING` sibling earlier in `order` — the
 * chain is meant to be sequential ("CAPTAIN → TECH_MANAGER → YARD → …"),
 * and before this nothing enforced that; finance could approve the cost
 * before the captain had looked at it.
 */
export function canDecideApproval(approval: ApprovalRow, siblings: ApprovalRow[]): boolean {
  if (approval.decision !== "PENDING") return false;
  return !siblings.some(
    (s) => s.id !== approval.id && s.required && s.order < approval.order && s.decision === "PENDING"
  );
}

/**
 * The change order's status after `decision` is recorded on one approval,
 * given every row on the chain post-write (the decided row included, with
 * its new `decision` already reflected).
 *
 * `REJECTED` and `MORE_INFO` are unconditional — the chain does not keep
 * going once one required stage has said either, which is the fix for C7:
 * the old code decided completeness by counting rows still `PENDING`, and a
 * `REJECTED` row is not `PENDING`, so it silently stopped blocking instead
 * of stopping the chain.
 *
 * `APPROVED` completes the change order only once every required row reads
 * `APPROVED`. Short of that, the return is `null` — not `"UNDER_REVIEW"` —
 * when the change order is already `UNDER_REVIEW`: `CO_LEGAL_TRANSITIONS`
 * deliberately has no status-to-itself edge, and `null` is the caller's
 * signal to update the approval row without writing a status transition at
 * all. Only a decision landing while the change order is still `SUBMITTED`
 * or `MORE_INFO` genuinely moves it, to `UNDER_REVIEW`.
 */
export function nextChangeOrderStatus(
  currentStatus: ChangeOrderStatus,
  decision: "APPROVED" | "REJECTED" | "MORE_INFO",
  approvalsAfterThisDecision: ApprovalRow[]
): ChangeOrderStatus | null {
  if (decision === "REJECTED") return "REJECTED";
  if (decision === "MORE_INFO") return "MORE_INFO";

  const stillPending = approvalsAfterThisDecision.some((s) => s.required && s.decision === "PENDING");
  if (!stillPending) return "APPROVED";
  return currentStatus === "UNDER_REVIEW" ? null : "UNDER_REVIEW";
}

/** The change-order statuses a `PENDING` approval row is valid to be decided in. */
export const CO_STATUSES_AWAITING_DECISION: ChangeOrderStatus[] = ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO"];

/**
 * Approval rows still due, in the order they're due — the stage(s) to
 * notify next after a decision that didn't complete or reject the chain.
 * More than one row can share the lowest order, so more than one stage can
 * be "next" at once.
 */
export function nextDueApprovals(approvals: ApprovalRow[]): ApprovalRow[] {
  const pending = approvals.filter((s) => s.required && s.decision === "PENDING");
  if (!pending.length) return [];
  const minOrder = Math.min(...pending.map((s) => s.order));
  return pending.filter((s) => s.order === minOrder);
}
