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
  // priorities
  LOW: "muted",
  MEDIUM: "info",
  HIGH: "warn",
  CRITICAL: "bad",
};
