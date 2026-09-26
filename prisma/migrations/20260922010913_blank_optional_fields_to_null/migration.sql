-- Data cleanup for ACTION_PLAN.md G2.8 (AUDIT_REPORT.md C13/C14): before the
-- server actions validated optional fields with a blankToNull preprocessor,
-- an untouched or cleared form control posted "" and that literal empty
-- string was written to columns where NULL belongs. This backfills any rows
-- already carrying "" on the affected optional columns. No schema change.

UPDATE "ChangeOrder" SET "departmentCode" = NULL WHERE "departmentCode" = '';
UPDATE "ChangeOrder" SET "vesselAreaId" = NULL WHERE "vesselAreaId" = '';
UPDATE "ChangeOrder" SET "riskImpact" = NULL WHERE "riskImpact" = '';
UPDATE "ChangeOrder" SET "technicalImpact" = NULL WHERE "technicalImpact" = '';

UPDATE "CrewRequest" SET "departmentCode" = NULL WHERE "departmentCode" = '';
UPDATE "CrewRequest" SET "vesselAreaId" = NULL WHERE "vesselAreaId" = '';
UPDATE "CrewRequest" SET "assignedToId" = NULL WHERE "assignedToId" = '';
UPDATE "CrewRequest" SET "safetyImpact" = NULL WHERE "safetyImpact" = '';
UPDATE "CrewRequest" SET "linkedChangeOrderId" = NULL WHERE "linkedChangeOrderId" = '';

UPDATE "ChangeOrderApproval" SET "comment" = NULL WHERE "comment" = '';
