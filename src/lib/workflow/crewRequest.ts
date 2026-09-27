// Crew-request workflow rules.
//
// Single source of truth for: which status transitions are legal, which
// permission each needs, and which transitions the UI offers — following
// the same pattern as lib/workflow/changeOrder.ts and lib/jobs/workflow.ts.
//
// This did not exist before G2.4 of ACTION_PLAN.md. The legal-transition
// map lived only inline in transitionCrewRequest, duplicated (and allowed
// to drift) in the detail page's own static `transitions` object, and the
// per-status permission was an if/else chain that covered four of the nine
// targets — AUDIT_REPORT.md's Critical C6: any signed-in user, GUEST
// included, could move IN_PROGRESS, BLOCKED, AWAITING_APPROVAL or REJECTED
// with no permission check at all.

import { PERMISSIONS, type PermissionKey } from "@/lib/rbac";
import type { CrewRequestStatus } from "@/lib/enums";
import { conflict } from "@/lib/errors";

/** Every transition the server will accept, keyed by current status. */
export const CR_LEGAL_TRANSITIONS: Record<CrewRequestStatus, CrewRequestStatus[]> = {
  NEW: ["TRIAGED", "ASSIGNED", "REJECTED"],
  TRIAGED: ["ASSIGNED", "REJECTED"],
  ASSIGNED: ["IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "REJECTED"],
  IN_PROGRESS: ["BLOCKED", "AWAITING_APPROVAL", "COMPLETED"],
  BLOCKED: ["IN_PROGRESS", "REJECTED"],
  AWAITING_APPROVAL: ["IN_PROGRESS", "COMPLETED", "REJECTED"],
  COMPLETED: ["CLOSED"],
  REJECTED: ["NEW"],
  CLOSED: [],
};

/** Terminal — nothing moves out of a closed request. */
export const CR_TERMINAL_STATUSES: CrewRequestStatus[] = ["CLOSED"];

export function canTransitionCrewRequest(from: CrewRequestStatus, to: CrewRequestStatus): boolean {
  return CR_LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * `ActionError`, not a bare `Error` (ACTION_PLAN.md G3.6, AUDIT_REPORT.md
 * T3's "two incompatible failure conventions"). Reached only when the
 * request moved between render and click — someone else acted first, or a
 * double-submit landed after the first one already succeeded.
 */
export function assertTransitionCrewRequest(from: CrewRequestStatus, to: CrewRequestStatus) {
  if (!canTransitionCrewRequest(from, to)) {
    const label = (s: CrewRequestStatus) => s.replace(/_/g, " ").toLowerCase();
    throw conflict(
      `This request is now ${label(from)}, so it can no longer move to ${label(to)}. Reload to see its current state.`
    );
  }
}

/**
 * Permission required to move a request into a status.
 *
 * An exhaustive map over every status, not an if/else chain a new target
 * can fall through unchecked — the shape of the original defect. Everything
 * that isn't a completion is gated on CR_TRIAGE, including the five targets
 * that previously had no check at all (IN_PROGRESS, BLOCKED,
 * AWAITING_APPROVAL, REJECTED, and NEW as the "Reopen" target).
 *
 * The assignee actually doing the work — CREW, typically — holds none of
 * CR_TRIAGE, CR_ASSIGN or CR_COMPLETE, so this closes the gap without a
 * workaround: CREW cannot report their own progress on IN_PROGRESS/BLOCKED
 * through this path either. A dedicated permission for "the assignee may
 * move their own assigned request" (the audit's suggested `CR_UPDATE`)
 * would be the more precise fix, but deciding which roles hold a new
 * permission is a grant decision, not this pass's to make unilaterally —
 * the same reasoning ACTION_PLAN.md's G3.12 applies to suppliers.
 */
export const CR_TRANSITION_PERMISSION: Record<CrewRequestStatus, PermissionKey> = {
  NEW: PERMISSIONS.CR_TRIAGE,
  TRIAGED: PERMISSIONS.CR_TRIAGE,
  ASSIGNED: PERMISSIONS.CR_TRIAGE,
  IN_PROGRESS: PERMISSIONS.CR_TRIAGE,
  BLOCKED: PERMISSIONS.CR_TRIAGE,
  AWAITING_APPROVAL: PERMISSIONS.CR_TRIAGE,
  REJECTED: PERMISSIONS.CR_TRIAGE,
  COMPLETED: PERMISSIONS.CR_COMPLETE,
  CLOSED: PERMISSIONS.CR_COMPLETE,
};

export type CrewRequestAction = {
  to: CrewRequestStatus;
  label: string;
  permission: PermissionKey;
  tone: "primary" | "danger";
};

const ACTION_LABELS: Partial<Record<CrewRequestStatus, string>> = {
  TRIAGED: "Triage",
  ASSIGNED: "Mark Assigned",
  IN_PROGRESS: "Start Work",
  BLOCKED: "Mark Blocked",
  AWAITING_APPROVAL: "Await Approval",
  COMPLETED: "Complete",
  CLOSED: "Close",
  REJECTED: "Reject",
  NEW: "Reopen",
};

/**
 * Transitions offered as buttons on the detail page, filtered by the
 * caller's permission — the page used to render every button from a static
 * map with no `hasPermission` filter at all, so a viewer with no crew-
 * request permission whatsoever still saw a live "Reject" button.
 */
export function crewRequestActions(from: CrewRequestStatus): CrewRequestAction[] {
  return (CR_LEGAL_TRANSITIONS[from] ?? []).map((to) => ({
    to,
    label:
      from === "IN_PROGRESS" && to === "BLOCKED"
        ? "Mark Blocked"
        : from === "BLOCKED" && to === "IN_PROGRESS"
          ? "Resume Work"
          : from === "AWAITING_APPROVAL" && to === "IN_PROGRESS"
            ? "Back to Work"
            : (ACTION_LABELS[to] ?? to.replace(/_/g, " ")),
    permission: CR_TRANSITION_PERMISSION[to],
    tone: to === "REJECTED" ? ("danger" as const) : ("primary" as const),
  }));
}
