import { z } from "zod";
import {
  CHANGE_ORDER_STATUSES,
  CREW_REQUEST_CATEGORIES,
  CREW_REQUEST_STATUSES,
  PRIORITIES,
} from "./enums";

export const ChangeOrderCreateSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3).max(200),
  description: z.string().min(5),
  reason: z.string().min(3),
  departmentCode: z.string().optional().nullable(),
  vesselAreaId: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  estimatedCost: z.coerce.number().nonnegative().default(0),
  scheduleImpactDays: z.coerce.number().int().default(0),
  riskImpact: z.string().optional().nullable(),
  technicalImpact: z.string().optional().nullable(),
  needsClassReview: z.coerce.boolean().default(false),
  needsFlagReview: z.coerce.boolean().default(false),
});
export type ChangeOrderCreateInput = z.infer<typeof ChangeOrderCreateSchema>;

export const ChangeOrderStatusSchema = z.enum(CHANGE_ORDER_STATUSES);

export const CrewRequestCreateSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(3).max(200),
  description: z.string().min(3),
  category: z.enum(CREW_REQUEST_CATEGORIES),
  departmentCode: z.string().optional().nullable(),
  vesselAreaId: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  assignedToId: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  costImpact: z.coerce.number().nonnegative().default(0),
  scheduleImpactDays: z.coerce.number().int().default(0),
  safetyImpact: z.string().optional().nullable(),
  linkedChangeOrderId: z.string().optional().nullable(),
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
