// Job workflow rules.
//
// The lifecycle reconstructed from The Bridge's manual (BRIDGE_ALIGNMENT_PLAN.md
// §1.3 and §5), enforced server-side. Follows the pattern established by
// lib/workflow/changeOrder.ts: one module owning the legal transitions, the
// permission each needs, and what the UI may offer — so the server and the
// screen can never disagree.

import { PERMISSIONS, type PermissionKey } from "@/lib/rbac";
import type { JobStatus } from "@/lib/enums";

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
  QUOTE_SENT: ["CLIENT_ACCEPTED", "EXPIRED", "CANCELLED_QUOTE"],
  EXPIRED: ["CLIENT_ACCEPTED", "CANCELLED_QUOTE"],
  CLIENT_ACCEPTED: ["ACCEPTED", "CANCELLED_QUOTE"],
  ACCEPTED: ["YARD_COMPLETED", "CANCELLED_WORKS"],
  YARD_COMPLETED: ["WORKS_ACCEPTED", "MINOR_DEFICIENCY"],
  MINOR_DEFICIENCY: ["WORKS_ACCEPTED", "CANCELLED_WORKS"],
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

export function assertTransitionJob(from: JobStatus, to: JobStatus) {
  if (!canTransitionJob(from, to)) {
    throw new Error(`Illegal transition ${from} → ${to}`);
  }
}

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
 * Legal edges that the generic transition action must never accept, however
 * the UI is driven — not merely edges the UI declines to render a button
 * for. Two different reasons put a status here:
 *
 * - `CLIENT_ACCEPTED` needs the acceptance ceremony's confirmation code and
 *   quote fingerprint (`jobs/[id]/accept/actions.ts`), not a plain status
 *   write. Before this list was consulted by both the button filter and
 *   `applyTransition` (`lib/workflow/applyTransition.ts`), it was consulted
 *   only by the former — `transitionJob` would accept `CLIENT_ACCEPTED`
 *   directly from anyone holding `JOB_ACCEPT`, skipping the ceremony
 *   entirely. See C2 in AUDIT_REPORT.md and G1.3/G2.3 in ACTION_PLAN.md.
 * - `EXPIRED` is reached by the clock, not by anyone pressing a button
 *   (nothing currently runs that clock — see G3.9 — but the status still
 *   should never be one a person sets by calling the generic action).
 *
 * This was `NOT_OFFERED`, read only by `jobActions()` below. Renamed and
 * exported so the server enforces exactly what the screen offers, rather
 * than the two silently drifting apart — the thing this file's own header
 * comment already claimed before it was true.
 */
export const JOB_GENERIC_UNREACHABLE: JobStatus[] = ["EXPIRED", "CLIENT_ACCEPTED"];

export function jobActions(from: JobStatus): JobAction[] {
  return (JOB_LEGAL_TRANSITIONS[from] ?? [])
    .filter((to) => !JOB_GENERIC_UNREACHABLE.includes(to))
    .map((to) => ({ to, ...ACTIONS[to] }));
}
