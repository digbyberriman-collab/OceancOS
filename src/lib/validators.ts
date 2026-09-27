import { z } from "zod";
import {
  CHANGE_ORDER_STATUSES,
  CONFIDENCE_LEVELS,
  CREW_REQUEST_CATEGORIES,
  CREW_REQUEST_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  SCOPE_DISCIPLINES,
} from "./enums";
import { parseCostBand } from "./yardPeriods/cost";
import { parsePeriodLabel, periodBounds } from "./yardPeriods/period";

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

// ---------- Projects and their yard history ----------

export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);

/** Optional free text: trimmed, blank becomes null, capped. */
function optionalText(max: number) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : v),
    z.string().max(max).optional().nullable(),
  );
}

function parses(parse: (v: string) => unknown) {
  return (v: string) => {
    try {
      parse(v);
      return true;
    } catch {
      return false;
    }
  };
}

const PERIOD_LABEL_HINT =
  'Write the date as the source gives it: a year ("2019"), a quarter ("2012-Q2"), a month ("2013-09") or a ' +
  'season ("2017-Spring"), with " approx." if approximate, or "Date unverified".';

const periodLabel = z
  .string()
  .trim()
  .min(1, PERIOD_LABEL_HINT)
  .max(40)
  .refine(parses(parsePeriodLabel), PERIOD_LABEL_HINT);

/**
 * A historical yard period's published record. Dates stay labels at the
 * precision the source gave, and a planning band must read as one, so the
 * record can be ordered and never shows a precision nobody published.
 */
export const YardPeriodRecordSchema = z
  .object({
    periodType: z.string().trim().min(2, "Say what kind of yard period this was.").max(120),
    startLabel: periodLabel,
    endLabel: periodLabel,
    precisionLabel: optionalText(60),
    nameAtPeriod: optionalText(120),
    yardText: optionalText(160),
    cityText: optionalText(120),
    countryText: optionalText(120),
    scopeSummary: optionalText(4000),
    contractorsText: optionalText(1000),
    reportedCostText: optionalText(120),
    costBandLabel: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() || null : v),
      z
        .string()
        .refine(
          parses(parseCostBand),
          'Write a planning band as "€0.5m–€2m", or "€30m–€70m+" for an open upper end.',
        )
        .optional()
        .nullable(),
    ),
    costBandBasis: optionalText(1000),
    confidence: z.preprocess(
      (v) => (v === "" ? null : v),
      z.enum(CONFIDENCE_LEVELS).optional().nullable(),
    ),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (!parses(parsePeriodLabel)(v.startLabel) || !parses(parsePeriodLabel)(v.endLabel)) return;
    try {
      periodBounds(v.startLabel, v.endLabel);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endLabel"],
        message: "The period ends before it starts.",
      });
    }
  });
export type YardPeriodRecordInput = z.infer<typeof YardPeriodRecordSchema>;

/** One line of a yard period's scope of work. */
export const ScopeItemSchema = z.object({
  discipline: z.enum(SCOPE_DISCIPLINES, {
    errorMap: () => ({ message: "Choose a discipline from the list." }),
  }),
  description: z.string().trim().min(3, "Describe the work in a few words.").max(500),
});
