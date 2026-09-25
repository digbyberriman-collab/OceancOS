-- ACTION_PLAN.md G3.1, closing AUDIT_REPORT.md's [SCHEMA] finding on
-- unconstrained status/type/category columns: the database defines zero
-- CHECK constraints, so every state machine in the system is a free-text
-- column whose legal values live only in a trailing schema comment or in
-- src/lib/enums.ts, enforced (inconsistently) per call site rather than by
-- the database. This adds a CHECK to every such column this pass could
-- source a confident value list for, taken from (in order of preference)
-- the column's own schema comment, a canonical list already used in
-- application code (src/lib/enums.ts, NotifyKind in src/lib/notifications.ts),
-- or, failing both, the literal values prisma/seed.ts writes.
--
-- Several models below (Approval, Milestone, LogisticsItem, Document,
-- MeetingAction) have no create/update call site anywhere in the
-- application today — confirmed while writing this migration, logged as a
-- new finding in audit/findings-phase5.md rather than fixed here. Their
-- status-shaped columns have never held anything but the schema default, so
-- their CHECK constraints are correspondingly narrow (the default only).
-- Approval.stage has no default and is never written at all — no value
-- exists to build a CHECK from, so it is left unconstrained; the finding
-- covers it too.

ALTER TABLE "Project" ADD CONSTRAINT "Project_type_check" CHECK ("type" IN ('REFIT', 'NEW_BUILD', 'CONVERSION'));
ALTER TABLE "Project" ADD CONSTRAINT "Project_status_check" CHECK ("status" IN ('ACTIVE'));

ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED'));
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_priority_check" CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

ALTER TABLE "ChangeOrderApproval" ADD CONSTRAINT "ChangeOrderApproval_stage_check" CHECK ("stage" IN ('CAPTAIN', 'OWNERS_REP', 'YARD', 'FINANCE', 'TECH_MANAGER', 'CLASS', 'FLAG'));
ALTER TABLE "ChangeOrderApproval" ADD CONSTRAINT "ChangeOrderApproval_decision_check" CHECK ("decision" IN ('PENDING', 'APPROVED', 'REJECTED', 'MORE_INFO'));

ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_category_check" CHECK ("category" IN ('DEFECT', 'OPERATIONAL', 'SAFETY', 'INTERIOR', 'ENGINEERING', 'DECK', 'IT', 'PROCUREMENT', 'ACCOMMODATION', 'ACCESS', 'CLEANING'));
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_priority_check" CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_status_check" CHECK ("status" IN ('NEW', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_APPROVAL', 'COMPLETED', 'REJECTED', 'CLOSED'));

-- Approval: read-only in the app today (findMany/count only). status has a
-- default and is included for completeness; stage has none and is skipped.
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_status_check" CHECK ("status" IN ('PENDING'));

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'CLOSED'));

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_status_check" CHECK ("status" IN ('RECEIVED', 'APPROVED', 'REJECTED', 'PAID'));

ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_status_check" CHECK ("status" IN ('PLANNED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'));
-- No comment on riskLevel; matches the LOW|MEDIUM|HIGH|CRITICAL scale every
-- other risk/priority column in this schema uses.
ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_riskLevel_check" CHECK ("riskLevel" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_type_check" CHECK ("type" IN ('YARD_PERIOD', 'SEA_TRIAL', 'HAT', 'SAT', 'CLASS_INSPECTION', 'FLAG_INSPECTION', 'DELIVERY', 'CUSTOM'));
-- Read-only in the app today; see the note at the top of this file.
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_status_check" CHECK ("status" IN ('PENDING'));

ALTER TABLE "LogisticsItem" ADD CONSTRAINT "LogisticsItem_type_check" CHECK ("type" IN ('CREW_TRAVEL', 'CONTRACTOR_TRAVEL', 'YARD_ACCESS', 'DELIVERY', 'SHIPMENT', 'CUSTOMS', 'COURIER', 'ACCOMMODATION', 'TRANSPORT', 'CRANE', 'DOCK', 'TUG', 'PILOT', 'LINESMEN', 'BUNKERING', 'WASTE', 'PROVISIONING', 'GUEST'));
-- Read-only in the app today; see the note at the top of this file.
ALTER TABLE "LogisticsItem" ADD CONSTRAINT "LogisticsItem_status_check" CHECK ("status" IN ('PLANNED'));

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_category_check" CHECK ("category" IN ('EQUIPMENT', 'SPARE', 'CRITICAL_SPARE', 'TOOL', 'CONSUMABLE', 'LSA', 'FFE', 'AV_IT', 'ENGINEERING', 'DECK', 'INTERIOR', 'GALLEY', 'MEDICAL', 'DIVE', 'SAFETY'));
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_status_check" CHECK ("status" IN ('OK', 'LOW', 'REORDER', 'MISSING', 'FAULTY', 'RETIRED'));

ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'COMMENTS', 'REVISED', 'APPROVED', 'APPROVED_W_COMMENTS', 'REJECTED', 'SUPERSEDED', 'ARCHIVED'));

ALTER TABLE "Document" ADD CONSTRAINT "Document_type_check" CHECK ("type" IN ('CONTRACT', 'SPEC', 'DRAWING', 'CERT', 'CLASS', 'FLAG', 'MANUAL', 'WARRANTY', 'QUOTE', 'INVOICE', 'PO', 'RA', 'MS', 'MINUTES', 'REPORT', 'OTHER'));
-- Read-only in the app today; see the note at the top of this file.
ALTER TABLE "Document" ADD CONSTRAINT "Document_approvalStatus_check" CHECK ("approvalStatus" IN ('DRAFT'));

ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_type_check" CHECK ("type" IN ('OWNERS', 'YARD', 'TECH', 'INTERIOR', 'CLASS_FLAG', 'FINANCE', 'HOD', 'CONTRACTOR'));

-- Read-only in the app today; see the note at the top of this file.
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_status_check" CHECK ("status" IN ('OPEN'));

-- Write path is seed-only (three fixture rows) — category reflects the
-- values the seed uses plus the schema default, not an invented full list.
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_category_check" CHECK ("category" IN ('GENERAL', 'SUPPLY_CHAIN', 'REGULATORY', 'SCHEDULE'));
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_status_check" CHECK ("status" IN ('OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED', 'ESCALATED'));

-- Matches NotifyKind in src/lib/notifications.ts.
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_kind_check" CHECK ("kind" IN ('ASSIGNED', 'APPROVAL_REQUIRED', 'APPROVAL_OVERDUE', 'COMMENT', 'STATUS_CHANGE', 'BUDGET_EXCEEDED', 'SCHEDULE_DELAYED', 'DOC_EXPIRING', 'INVENTORY_LOW', 'CONTRACTOR_DOC_EXPIRED', 'CLASS_FLAG_DEADLINE', 'RISK_ESCALATED'));
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_priority_check" CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_kind_check" CHECK ("kind" IN ('MESSAGE', 'MINUTE', 'SYSTEM'));

ALTER TABLE "Job" ADD CONSTRAINT "Job_contractType_check" CHECK ("contractType" IN ('CONTRACT', 'VARIATION_CERTIFICATE', 'SERVICES', 'PURCHASE'));
ALTER TABLE "Job" ADD CONSTRAINT "Job_pricingBasis_check" CHECK ("pricingBasis" IN ('FIXED', 'ESTIMATED', 'TIME_AND_MATERIALS'));
ALTER TABLE "Job" ADD CONSTRAINT "Job_status_check" CHECK ("status" IN ('NEW_REQUEST', 'QUOTE_SENT', 'CLIENT_ACCEPTED', 'ACCEPTED', 'EXPIRED', 'CANCELLED_QUOTE', 'CANCELLED_WORKS', 'YARD_COMPLETED', 'MINOR_DEFICIENCY', 'WORKS_ACCEPTED', 'CLOSED'));

ALTER TABLE "JobNote" ADD CONSTRAINT "JobNote_kind_check" CHECK ("kind" IN ('EXCLUSION', 'NOTE'));

ALTER TABLE "AcceptanceChallenge" ADD CONSTRAINT "AcceptanceChallenge_channel_check" CHECK ("channel" IN ('EMAIL', 'SMS'));
