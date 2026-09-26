// Single source of truth for enums used across UI + DB.

export const ROLE_KEYS = [
  "OWNER",
  "OWNERS_REP",
  "PROJECT_MANAGER",
  "CAPTAIN",
  "CHIEF_OFFICER",
  "CHIEF_ENGINEER",
  "PURSER",
  "HOD",
  "CREW",
  "YARD_PM",
  "YARD_TRADE_LEAD",
  "CONTRACTOR",
  "SUPPLIER",
  "FINANCE",
  "TECH_MANAGER",
  "CLASS_SURVEYOR",
  "FLAG_SURVEYOR",
  "AUDITOR",
  "GUEST",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * Roles whose unscoped assignment is deliberate: staff on the owner's side who
 * work across the whole fleet, not one vessel or yard period. Everyone else —
 * vessel crew tied to one ship, yard and external parties engaged per project —
 * must be scoped explicitly by `projectId` or `vesselId` on their `UserRole`.
 *
 * This is a product decision, not a technical one (see G1.4 in
 * ACTION_PLAN.md / C16 in AUDIT_REPORT_ADDENDUM.md). Consulted by
 * `lib/project.ts` (which roles an unscoped assignment grants every project
 * to) and `prisma/seed.ts` (which seeded accounts are left unscoped).
 */
export const PLATFORM_WIDE_ROLES: ReadonlySet<RoleKey> = new Set<RoleKey>(["OWNER", "OWNERS_REP"]);

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CHANGE_ORDER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFO",
  "APPROVED",
  "REJECTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
] as const;
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number];

export const CO_APPROVAL_STAGES = [
  "CAPTAIN",
  "OWNERS_REP",
  "YARD",
  "FINANCE",
  "TECH_MANAGER",
  "CLASS",
  "FLAG",
] as const;
export type CoApprovalStage = (typeof CO_APPROVAL_STAGES)[number];

export const CREW_REQUEST_STATUSES = [
  "NEW",
  "TRIAGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "BLOCKED",
  "AWAITING_APPROVAL",
  "COMPLETED",
  "REJECTED",
  "CLOSED",
] as const;
export type CrewRequestStatus = (typeof CREW_REQUEST_STATUSES)[number];

export const CREW_REQUEST_CATEGORIES = [
  "DEFECT",
  "OPERATIONAL",
  "SAFETY",
  "INTERIOR",
  "ENGINEERING",
  "DECK",
  "IT",
  "PROCUREMENT",
  "ACCOMMODATION",
  "ACCESS",
  "CLEANING",
] as const;

// ---- Jobs & quotes ----

export const JOB_STATUSES = [
  "NEW_REQUEST",
  "QUOTE_SENT",
  "EXPIRED",
  "CLIENT_ACCEPTED",
  "ACCEPTED",
  "YARD_COMPLETED",
  "MINOR_DEFICIENCY",
  "WORKS_ACCEPTED",
  "CANCELLED_QUOTE",
  "CANCELLED_WORKS",
  "CLOSED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const CONTRACT_TYPES = [
  "CONTRACT",
  "VARIATION_CERTIFICATE",
  "SERVICES",
  "PURCHASE",
] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const PRICING_BASES = ["FIXED", "ESTIMATED", "TIME_AND_MATERIALS"] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

export const VARIATION_DUE_TO = [
  "OWNER_REQUEST",
  "YARD_FINDING",
  "CLASS_REQUIREMENT",
  "SURVEY_FINDING",
  "OTHER",
] as const;

export const VARIATION_AFFECTING = [
  "WORKS_SPECIFICATION",
  "DELIVERY_DATE",
  "CONTRACT_PRICE",
  "OTHER",
] as const;

/** Human labels for the statuses, since the raw keys read badly in a UI. */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  NEW_REQUEST: "New request",
  QUOTE_SENT: "Quote sent",
  EXPIRED: "Expired",
  CLIENT_ACCEPTED: "Client accepted",
  ACCEPTED: "Accepted",
  YARD_COMPLETED: "Yard completed",
  MINOR_DEFICIENCY: "Minor deficiency",
  WORKS_ACCEPTED: "Works accepted",
  CANCELLED_QUOTE: "Cancelled quote",
  CANCELLED_WORKS: "Cancelled works",
  CLOSED: "Closed",
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  CONTRACT: "Contract",
  VARIATION_CERTIFICATE: "Variation certificate",
  SERVICES: "Services",
  PURCHASE: "Purchase",
};

export const PRICING_BASIS_LABELS: Record<PricingBasis, string> = {
  FIXED: "Fixed",
  ESTIMATED: "Estimated",
  TIME_AND_MATERIALS: "Time & materials",
};

export const APPROVAL_RESOURCES = [
  "CHANGE_ORDER",
  "CREW_REQUEST",
  "PURCHASE_ORDER",
  "DRAWING",
  "BUDGET_CHANGE",
  "SCHEDULE_CHANGE",
  "ACCESS",
  "SUBSTITUTION",
  "VARIATION",
  "FINAL_ACCEPTANCE",
] as const;

export const DEPARTMENTS = [
  "DECK",
  "ENGINEERING",
  "INTERIOR",
  "GALLEY",
  "IT_AV",
  "BRIDGE",
  "MEDICAL",
  "PROCUREMENT",
  "OWNER_OFFICE",
  "FINANCE",
  "YARD",
  "CLASS_FLAG",
] as const;

export const PROJECT_TYPES = ["REFIT", "NEW_BUILD", "CONVERSION"] as const;

/** Labels for status keys that read badly raw. StatusBadge consults this. */
export const STATUS_LABELS: Record<string, string> = { ...JOB_STATUS_LABELS };

export const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "muted"> = {
  // shared
  DRAFT: "muted",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  MORE_INFO: "warn",
  APPROVED: "ok",
  REJECTED: "bad",
  IN_PROGRESS: "info",
  COMPLETED: "ok",
  CLOSED: "muted",
  CANCELLED: "muted",
  // crew req
  NEW: "info",
  TRIAGED: "info",
  ASSIGNED: "info",
  BLOCKED: "bad",
  AWAITING_APPROVAL: "warn",
  // risks
  OPEN: "warn",
  MITIGATED: "ok",
  ACCEPTED: "info",
  ESCALATED: "bad",
  // jobs
  NEW_REQUEST: "info",
  QUOTE_SENT: "warn",
  CLIENT_ACCEPTED: "info",
  YARD_COMPLETED: "info",
  MINOR_DEFICIENCY: "warn",
  WORKS_ACCEPTED: "ok",
  EXPIRED: "bad",
  CANCELLED_QUOTE: "muted",
  CANCELLED_WORKS: "muted",
  // priorities
  LOW: "muted",
  MEDIUM: "info",
  HIGH: "warn",
  CRITICAL: "bad",
};
