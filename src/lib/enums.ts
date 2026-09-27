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

/**
 * A project's place in its life. ACTIVE and PLANNED take new work; a COMPLETED
 * project is the record of a yard period that has finished. The order is the
 * order projects are listed in.
 */
export const PROJECT_STATUSES = ["ACTIVE", "PLANNED", "COMPLETED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  PLANNED: "Planned",
  COMPLETED: "Completed",
};

/** How far a vessel's particulars have been checked against its certificates. */
export const VESSEL_VERIFICATION = ["UNVERIFIED", "PUBLIC_SOURCE", "CERTIFICATE_VERIFIED"] as const;
export const VESSEL_VERIFICATION_LABELS: Record<(typeof VESSEL_VERIFICATION)[number], string> = {
  UNVERIFIED: "Unverified",
  PUBLIC_SOURCE: "Public source · not certificate-verified",
  CERTIFICATE_VERIFIED: "Certificate-verified",
};

/**
 * The disciplines a yard period's scope of work is grouped by — the column
 * families of the yard-period register, plus GENERAL for work that spans
 * them (a contractor's hours on a whole rebuild).
 */
export const SCOPE_DISCIPLINES = [
  "STRUCTURE_HULL_PAINT",
  "MECHANICAL_PROPULSION",
  "ELECTRICAL_AVIT_NAV",
  "INTERIOR_GUEST",
  "DECK_TENDER_MISSION",
  "SURVEY_CLASS_COMPLIANCE",
  "GENERAL",
] as const;
export type ScopeDiscipline = (typeof SCOPE_DISCIPLINES)[number];
export const SCOPE_DISCIPLINE_LABELS: Record<ScopeDiscipline, string> = {
  STRUCTURE_HULL_PAINT: "Structure, hull & paint",
  MECHANICAL_PROPULSION: "Mechanical & propulsion",
  ELECTRICAL_AVIT_NAV: "Electrical, AV/IT & navigation",
  INTERIOR_GUEST: "Interior & guest areas",
  DECK_TENDER_MISSION: "Deck, tenders & mission equipment",
  SURVEY_CLASS_COMPLIANCE: "Survey, class & compliance",
  GENERAL: "General",
};

/**
 * How far a published yard period can be relied on. High: the yard, a
 * contractor or an official source, or corroborated. Medium: a reputable
 * broker, database or trade source. Low: incomplete secondary evidence.
 */
export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  HIGH: "High confidence",
  MEDIUM: "Medium confidence",
  LOW: "Low confidence",
};

/** What a piece of yard-history evidence is. */
export const YARD_EVIDENCE_KINDS = ["SOURCE", "CONFLICT", "EXCLUDED"] as const;
export type YardEvidenceKind = (typeof YARD_EVIDENCE_KINDS)[number];

export const DATA_GAP_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
export const DATA_GAP_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

/** Labels for status keys that read badly raw. StatusBadge consults this. */
export const STATUS_LABELS: Record<string, string> = { ...JOB_STATUS_LABELS, ...PROJECT_STATUS_LABELS };

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
  // projects (COMPLETED is shared above)
  ACTIVE: "info",
  PLANNED: "muted",
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
