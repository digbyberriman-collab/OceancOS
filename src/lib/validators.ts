import { z } from "zod";
import {
  CHANGE_ORDER_STATUSES,
  CREW_REQUEST_CATEGORIES,
  CREW_REQUEST_STATUSES,
  PRIORITIES,
} from "./enums";

/**
 * `""` becomes `null` before the rest of the schema runs.
 *
 * `Object.fromEntries(formData)` hands every untouched optional field —
 * an `<input type="date">`, an unselected `<option value="">` — through as
 * the empty string, never `undefined`. `optional()` only short-circuits on
 * `undefined`, so `""` used to reach `z.coerce.date()` (Invalid Date, the
 * whole request rejected — C13) or a bare `z.string()` (stored as `""`
 * instead of `NULL`, and a foreign-key column raised P2003 outright on an
 * unselected relation). Wrap every optional field below in this so blank
 * means absent, the way the form already presents it. See G2.8 in
 * ACTION_PLAN.md.
 */
const blankToNull = (v: unknown) => (v === "" ? null : v);

// projectId is deliberately not a field here: it comes from the caller's
// active project (getActiveProject), never from the submitted form. See
// G2.1 in ACTION_PLAN.md / C4 in AUDIT_REPORT.md.
export const ChangeOrderCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(5),
  reason: z.string().min(3),
  departmentCode: z.preprocess(blankToNull, z.string().nullable().optional()),
  vesselAreaId: z.preprocess(blankToNull, z.string().nullable().optional()),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  estimatedCost: z.coerce.number().nonnegative().default(0),
  scheduleImpactDays: z.coerce.number().int().default(0),
  riskImpact: z.preprocess(blankToNull, z.string().nullable().optional()),
  technicalImpact: z.preprocess(blankToNull, z.string().nullable().optional()),
  needsClassReview: z.coerce.boolean().default(false),
  needsFlagReview: z.coerce.boolean().default(false),
});
export type ChangeOrderCreateInput = z.infer<typeof ChangeOrderCreateSchema>;

export const ChangeOrderStatusSchema = z.enum(CHANGE_ORDER_STATUSES);

// projectId is deliberately not a field here — see the note on
// ChangeOrderCreateSchema above.
export const CrewRequestCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(3),
  category: z.enum(CREW_REQUEST_CATEGORIES),
  departmentCode: z.preprocess(blankToNull, z.string().nullable().optional()),
  vesselAreaId: z.preprocess(blankToNull, z.string().nullable().optional()),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  assignedToId: z.preprocess(blankToNull, z.string().nullable().optional()),
  dueDate: z.preprocess(blankToNull, z.coerce.date().nullable().optional()),
  costImpact: z.coerce.number().nonnegative().default(0),
  scheduleImpactDays: z.coerce.number().int().default(0),
  safetyImpact: z.preprocess(blankToNull, z.string().nullable().optional()),
  linkedChangeOrderId: z.preprocess(blankToNull, z.string().nullable().optional()),
});
export type CrewRequestCreateInput = z.infer<typeof CrewRequestCreateSchema>;

export const CrewRequestStatusSchema = z.enum(CREW_REQUEST_STATUSES);

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ApprovalDecisionSchema = z.object({
  approvalId: z.string().min(1).optional(),
  changeOrderApprovalId: z.string().min(1).optional(),
  decision: z.enum(["APPROVED", "REJECTED", "MORE_INFO", "DELEGATED"]),
  comment: z.string().optional().nullable(),
});
