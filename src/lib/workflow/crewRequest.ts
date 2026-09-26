// Crew-request workflow rules.
//
// Follows the pattern established by lib/workflow/changeOrder.ts and
// lib/jobs/workflow.ts: one module owning the legal transitions and the
// permission each requires, consulted by both the UI and applyTransition so
// the server and the screen cannot disagree. Before this file existed, the
// legal-transition map and the permission checks lived separately inside
// crew-requests/actions.ts, and only partially agreed with each other —
// four of the nine transitions required no permission at all, and
// assignCrewRequest bypassed the map entirely (C6 in AUDIT_REPORT.md).

import { PERMISSIONS, type PermissionKey } from "@/lib/rbac";
import type { CrewRequestStatus } from "@/lib/enums";

/**
 * Every transition the server accepts, keyed by current status. Unchanged
 * from the map that used to live in crew-requests/actions.ts — the gap was
 * never in which edges are legal, only in which ones were checked.
 */
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

export const CR_TERMINAL_STATUSES: CrewRequestStatus[] = ["CLOSED"];

export function canTransitionCrewRequest(from: CrewRequestStatus, to: CrewRequestStatus): boolean {
  return CR_LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransitionCrewRequest(from: CrewRequestStatus, to: CrewRequestStatus) {
  if (!canTransitionCrewRequest(from, to)) {
    throw new Error(`Illegal transition ${from} → ${to}`);
  }
}

/**
 * Permission required to move a crew request into each status.
 *
 * A `Record` over every `CrewRequestStatus` rather than an if/else chain: the
 * type checker rejects this file if a status is ever added to
 * `CREW_REQUEST_STATUSES` without a matching entry here, so the gap that let
 * IN_PROGRESS/BLOCKED/AWAITING_APPROVAL/REJECTED through with no check at
 * all (not even CR_VIEW) cannot recur silently.
 *
 * REJECTED and the in-flight statuses take CR_TRIAGE rather than a new
 * permission key: every role that holds CR_ASSIGN already holds CR_TRIAGE
 * (see ROLE_PERMISSIONS in rbac.ts), so gating the day-to-day progression of
 * a request behind CR_TRIAGE admits exactly the roles that already run a
 * request's lifecycle — nobody who could not already triage or assign it.
 * NEW is reachable only via the REJECTED → NEW "Reopen" edge, gated the same
 * way as the rejection it undoes.
 */
export const CR_TRANSITION_PERMISSION: Record<CrewRequestStatus, PermissionKey> = {
  NEW: PERMISSIONS.CR_TRIAGE,
  TRIAGED: PERMISSIONS.CR_TRIAGE,
  ASSIGNED: PERMISSIONS.CR_TRIAGE,
  IN_PROGRESS: PERMISSIONS.CR_TRIAGE,
  BLOCKED: PERMISSIONS.CR_TRIAGE,
  AWAITING_APPROVAL: PERMISSIONS.CR_TRIAGE,
  COMPLETED: PERMISSIONS.CR_COMPLETE,
  REJECTED: PERMISSIONS.CR_TRIAGE,
  CLOSED: PERMISSIONS.CR_COMPLETE,
};

/**
 * Nothing here is reached only through a separate ceremony the way Job's
 * CLIENT_ACCEPTED or ChangeOrder's APPROVED/REJECTED/MORE_INFO are — a crew
 * request has no decision chain of its own. Exported so applyTransition can
 * still key a `Record<TransitionEntity, ...>` uniformly across all three
 * entities.
 */
export const CR_GENERIC_UNREACHABLE: CrewRequestStatus[] = [];

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
  REJECTED: "Reject",
  CLOSED: "Close",
  NEW: "Reopen",
};

export function crewRequestActions(from: CrewRequestStatus): CrewRequestAction[] {
  return (CR_LEGAL_TRANSITIONS[from] ?? []).map((to) => {
    let label = ACTION_LABELS[to] ?? to.replace(/_/g, " ");
    if (from === "BLOCKED" && to === "IN_PROGRESS") label = "Resume Work";
    if (from === "AWAITING_APPROVAL" && to === "IN_PROGRESS") label = "Back to Work";
    return {
      to,
      label,
      permission: CR_TRANSITION_PERMISSION[to],
      tone: to === "REJECTED" ? ("danger" as const) : ("primary" as const),
    };
  });
}
