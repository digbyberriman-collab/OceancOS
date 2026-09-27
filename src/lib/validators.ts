import { z } from "zod";
import {
  CHANGE_ORDER_STATUSES,
  CREW_REQUEST_CATEGORIES,
  CREW_REQUEST_STATUSES,
  PRIORITIES,
} from "./enums";

/**
 * Wraps an optional field so an untouched or cleared HTML form control —
 * which posts "", never absent — is treated as "not provided" rather than
 * as the literal string "". Without this, a blank optional text field
 * stores "" where NULL belongs, and a blank relation select (e.g. an
 * unselected "linked change order") stores "" where a real id is expected,
 * which the foreign key rejects outright instead of the field validating as
 * unset. See AUDIT_REPORT.md C13/C14 and ACTION_PLAN.md G2.8.
 */
function blankToNull<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" ? null : v), schema);
}

// projectId is deliberately not a field here: it comes from getActiveProject()
// server-side, never from the submitted form. See AUDIT_REPORT.md's
// [TENANCY] — "projectId is taken from the client form" and ACTION_PLAN.md
// G2.1.
export const ChangeOrderCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(5),
  reason: z.string().min(3),
  departmentCode: blankToNull(z.string().optional().nullable()),
  vesselAreaId: blankToNull(z.string().optional().nullable()),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  estimatedCost: z.coerce.number().nonnegative().default(0),
  scheduleImpactDays: z.coerce.number().int().default(0),
  riskImpact: blankToNull(z.string().optional().nullable()),
  technicalImpact: blankToNull(z.string().optional().nullable()),
  needsClassReview: z.coerce.boolean().default(false),
  needsFlagReview: z.coerce.boolean().default(false),
});
export type ChangeOrderCreateInput = z.infer<typeof ChangeOrderCreateSchema>;

export const ChangeOrderStatusSchema = z.enum(CHANGE_ORDER_STATUSES);

// projectId is deliberately not a field here either — same reasoning as
// ChangeOrderCreateSchema above.
export const CrewRequestCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(3),
  category: z.enum(CREW_REQUEST_CATEGORIES),
  departmentCode: blankToNull(z.string().optional().nullable()),
  vesselAreaId: blankToNull(z.string().optional().nullable()),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  assignedToId: blankToNull(z.string().optional().nullable()),
  dueDate: blankToNull(z.coerce.date().optional().nullable()),
  costImpact: z.coerce.number().nonnegative().default(0),
  scheduleImpactDays: z.coerce.number().int().default(0),
  safetyImpact: blankToNull(z.string().optional().nullable()),
  linkedChangeOrderId: blankToNull(z.string().optional().nullable()),
});
export type CrewRequestCreateInput = z.infer<typeof CrewRequestCreateSchema>;

export const CrewRequestStatusSchema = z.enum(CREW_REQUEST_STATUSES);

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Previously unused — decideChangeOrderApproval cast the raw form value
// instead of parsing it. Also previously offered `changeOrderApprovalId`
// (dead: the form only ever posts `approvalId`) and `DELEGATED` (dead: no
// code path handles it, and ChangeOrderApproval.decision's schema comment
// listing it was aspirational, not enforced). See AUDIT_REPORT.md G2.2.
export const ApprovalDecisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED", "MORE_INFO"]),
  comment: blankToNull(z.string().optional().nullable()),
});
