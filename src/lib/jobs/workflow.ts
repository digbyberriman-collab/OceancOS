// Job workflow rules.
//
// The lifecycle reconstructed from The Bridge's manual (BRIDGE_ALIGNMENT_PLAN.md
// §1.3 and §5), enforced server-side. Follows the pattern established by
// lib/workflow/changeOrder.ts: one module owning the legal transitions, the
// permission each needs, and what the UI may offer — so the server and the
// screen can never disagree.

import { PERMISSIONS, type PermissionKey } from "@/lib/rbac";
import { JOB_STATUS_LABELS, type JobStatus } from "@/lib/enums";
import { conflict } from "@/lib/errors";

export const JOB_TERMINAL_STATUSES: JobStatus[] = [
  "CANCELLED_QUOTE",
  "CANCELLED_WORKS",
  "CLOSED",
];

/**
 * Every transition the server accepts.
 *
 * EXPIRED is a labelling state, not a dead end: The Bridge lets an expired
 * quote still be signed, leaving the yard to decide whether to countersign.
 */
export const JOB_LEGAL_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  NEW_REQUEST: ["QUOTE_SENT", "CANCELLED_QUOTE"],
  // QUOTE_SENT → QUOTE_SENT and EXPIRED → QUOTE_SENT ("Revise quote",
  // ACTION_PLAN.md G3.9): without these, a mispriced or lapsed quote had no
  // way back except cancel-and-recreate under a new job code, which loses
  // the thread, the attachments and the history of the original.
  QUOTE_SENT: ["QUOTE_SENT", "CLIENT_ACCEPTED", "EXPIRED", "CANCELLED_QUOTE"],
  EXPIRED: ["QUOTE_SENT", "CLIENT_ACCEPTED", "CANCELLED_QUOTE"],
  CLIENT_ACCEPTED: ["ACCEPTED", "CANCELLED_QUOTE"],
  ACCEPTED: ["YARD_COMPLETED", "CANCELLED_WORKS"],
  YARD_COMPLETED: ["WORKS_ACCEPTED", "MINOR_DEFICIENCY"],
  // MINOR_DEFICIENCY → YARD_COMPLETED ("Deficiency rectified") is the yard's
  // only way to hand rectified work back — without it, a deficiency was a
  // dead end: accept the works with the defect outstanding, or cancel works
  // already done.
  MINOR_DEFICIENCY: ["YARD_COMPLETED", "WORKS_ACCEPTED", "CANCELLED_WORKS"],
  WORKS_ACCEPTED: ["CLOSED"],
  CANCELLED_QUOTE: [],
  CANCELLED_WORKS: [],
  CLOSED: [],
};

/** Permission required to move a job into a status. */
export const JOB_TRANSITION_PERMISSION: Record<JobStatus, PermissionKey> = {
  NEW_REQUEST: PERMISSIONS.JOB_REQUEST,
  QUOTE_SENT: PERMISSIONS.JOB_ISSUE_QUOTE,
  EXPIRED: PERMISSIONS.JOB_ISSUE_QUOTE,
  CLIENT_ACCEPTED: PERMISSIONS.JOB_ACCEPT,
  ACCEPTED: PERMISSIONS.JOB_COUNTERSIGN,
  CANCELLED_QUOTE: PERMISSIONS.JOB_CANCEL,
  CANCELLED_WORKS: PERMISSIONS.JOB_CANCEL,
  YARD_COMPLETED: PERMISSIONS.JOB_COMPLETE,
  WORKS_ACCEPTED: PERMISSIONS.JOB_WORKS_ACCEPT,
  MINOR_DEFICIENCY: PERMISSIONS.JOB_DEFICIENCY,
  CLOSED: PERMISSIONS.JOB_ISSUE_QUOTE,
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * `ActionError`, not a bare `Error` (ACTION_PLAN.md G3.6, AUDIT_REPORT.md
 * T3's "two incompatible failure conventions"). A caller hits this only when
 * the job moved between the page being rendered and the button being
 * clicked — someone else acted first, or a double-submit landed after the
 * first one already succeeded — so `conflict()` names it for what it is
 * rather than leaving the boundary's generic "something went wrong" for a
 * situation the message can actually explain.
 */
export function assertTransitionJob(from: JobStatus, to: JobStatus) {
  if (!canTransitionJob(from, to)) {
    throw conflict(
      `This job is now ${JOB_STATUS_LABELS[from] ?? from}, so it can no longer move to ${JOB_STATUS_LABELS[to] ?? to}. Reload to see its current state.`
    );
  }
}

/**
 * Transitions that must never be reached through the plain transitionJob
 * action, however legal the edge and however permitted the caller —
 * because reaching them any other way skips a ceremony this module cannot
 * see: a confirmation code, a fingerprint check, an audit record of who
 * signed and from where.
 *
 * Before this, the only thing keeping `CLIENT_ACCEPTED` out of reach was
 * `NOT_OFFERED` below — a UI-layer filter this file's own header comment
 * claimed made the server and the screen unable to disagree, while
 * transitionJob never actually checked it. AUDIT_REPORT.md's Critical C2:
 * any holder of job.accept could post `to=CLIENT_ACCEPTED` directly and
 * commit the vessel to a quote's full value with no code, no change-order
 * gate, and no fingerprint proving the price wasn't altered — and the
 * resulting record was unsigned, since transitionJob never set
 * clientAcceptedAt/clientAcceptedById either.
 *
 * This list is deliberately not `NOT_OFFERED`: that one also hides
 * `EXPIRED`, but for an unrelated reason (nobody manually presses a button
 * for the clock to do its job) — merging the two would smuggle a UI
 * decision into a security control, or vice versa.
 */
export const JOB_TRANSITIONS_REQUIRING_CEREMONY: JobStatus[] = ["CLIENT_ACCEPTED"];

/** Statuses counted as money the client has committed to. */
export const JOB_ACCEPTED_STATUSES: JobStatus[] = [
  "ACCEPTED",
  "YARD_COMPLETED",
  "MINOR_DEFICIENCY",
  "WORKS_ACCEPTED",
  "CLOSED",
];

/** Statuses counted as money still on the table. */
export const JOB_PENDING_STATUSES: JobStatus[] = ["NEW_REQUEST", "QUOTE_SENT", "EXPIRED"];

export const JOB_CANCELLED_STATUSES: JobStatus[] = ["CANCELLED_QUOTE", "CANCELLED_WORKS"];

/**
 * Whether a quote has passed its validity.
 *
 * Expiry is a label rather than a barrier: an expired quote can still be
 * accepted, and the yard then decides whether to countersign it.
 */
export function isExpired(
  job: { status: string; expiresAt?: Date | null },
  now: Date = new Date()
): boolean {
  if (job.status !== "QUOTE_SENT" && job.status !== "EXPIRED") return false;
  if (!job.expiresAt) return false;
  return job.expiresAt.getTime() <= now.getTime();
}

/** Days left on a quote's validity. Negative once it has lapsed. */
export function daysUntilExpiry(
  expiresAt: Date | null | undefined,
  now: Date = new Date()
): number | null {
  if (!expiresAt) return null;
  return Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/** When a quote issued now would lapse. */
export function expiryFrom(deliveredAt: Date, validityDays: number | null | undefined): Date | null {
  if (!validityDays || validityDays <= 0) return null;
  return new Date(deliveredAt.getTime() + validityDays * 24 * 60 * 60 * 1000);
}

export type JobAction = {
  to: JobStatus;
  label: string;
  permission: PermissionKey;
  tone: "primary" | "danger" | "default";
  /** Shown to the client rather than the yard. */
  side: "client" | "yard";
};

const ACTIONS: Record<JobStatus, Omit<JobAction, "to">> = {
  NEW_REQUEST: { label: "Reopen request", permission: PERMISSIONS.JOB_REQUEST, tone: "default", side: "client" },
  QUOTE_SENT: { label: "Send quote", permission: PERMISSIONS.JOB_ISSUE_QUOTE, tone: "primary", side: "yard" },
  EXPIRED: { label: "Mark expired", permission: PERMISSIONS.JOB_ISSUE_QUOTE, tone: "default", side: "yard" },
  CLIENT_ACCEPTED: { label: "Accept", permission: PERMISSIONS.JOB_ACCEPT, tone: "primary", side: "client" },
  ACCEPTED: { label: "Countersign", permission: PERMISSIONS.JOB_COUNTERSIGN, tone: "primary", side: "yard" },
  CANCELLED_QUOTE: { label: "Cancel quote", permission: PERMISSIONS.JOB_CANCEL, tone: "danger", side: "client" },
  CANCELLED_WORKS: { label: "Cancel works", permission: PERMISSIONS.JOB_CANCEL, tone: "danger", side: "client" },
  YARD_COMPLETED: { label: "Mark completed", permission: PERMISSIONS.JOB_COMPLETE, tone: "primary", side: "yard" },
  WORKS_ACCEPTED: { label: "Works accepted", permission: PERMISSIONS.JOB_WORKS_ACCEPT, tone: "primary", side: "client" },
  MINOR_DEFICIENCY: { label: "Report minor deficiency", permission: PERMISSIONS.JOB_DEFICIENCY, tone: "default", side: "client" },
  CLOSED: { label: "Close", permission: PERMISSIONS.JOB_ISSUE_QUOTE, tone: "default", side: "yard" },
};

/**
 * Transitions offered as buttons.
 *
 * EXPIRED is excluded: it is reached by the clock, not by anyone pressing a
 * button. Accept is excluded here too because it runs through the two-step
 * confirmation and emailed code in Phase 2 rather than a plain transition.
 * QUOTE_SENT is excluded because issuing or revising a quote needs the full
 * line-item form at /jobs/[id]/quote, not a bare status flip — that form is
 * offered separately, keyed off `canQuote` rather than this list.
 */
const NOT_OFFERED: JobStatus[] = ["EXPIRED", "CLIENT_ACCEPTED", "QUOTE_SENT"];

/**
 * Per-edge label overrides, for the one target status two different sources
 * mean something different by: YARD_COMPLETED said from ACCEPTED is "the
 * yard finished the work", said from MINOR_DEFICIENCY it is "the yard fixed
 * what was flagged" — worth a different label even though it's the same
 * permission and the same target status.
 */
function actionLabel(from: JobStatus, to: JobStatus): string {
  if (from === "MINOR_DEFICIENCY" && to === "YARD_COMPLETED") return "Deficiency rectified";
  return ACTIONS[to].label;
}

export function jobActions(from: JobStatus): JobAction[] {
  return (JOB_LEGAL_TRANSITIONS[from] ?? [])
    .filter((to) => !NOT_OFFERED.includes(to))
    .map((to) => ({ to, ...ACTIONS[to], label: actionLabel(from, to) }));
}

/** The audience side of a plain status transition — see `transitionJob`. */
export function jobActionSide(to: JobStatus): "client" | "yard" {
  return ACTIONS[to].side;
}
