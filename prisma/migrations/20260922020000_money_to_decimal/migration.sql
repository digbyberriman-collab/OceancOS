-- ACTION_PLAN.md G3.2, closing AUDIT_REPORT.md's [SCHEMA] finding on money
-- stored as double precision: 21 monetary columns move from Float
-- (Postgres double precision) to Decimal(14,2) — Decimal(14,3) for
-- JobLine.quantity, which can be fractional. Each ALTER uses an explicit
-- `USING round(col::numeric, s)` rather than a bare type change, so the
-- migration itself rounds to the target scale instead of leaving that to
-- whatever the driver's default cast does.

ALTER TABLE "Approval" ALTER COLUMN "costImpact" SET DATA TYPE DECIMAL(14,2) USING round("costImpact"::numeric, 2);

ALTER TABLE "Budget"
  ALTER COLUMN "originalAmount" SET DATA TYPE DECIMAL(14,2) USING round("originalAmount"::numeric, 2),
  ALTER COLUMN "approvedChanges" SET DATA TYPE DECIMAL(14,2) USING round("approvedChanges"::numeric, 2),
  ALTER COLUMN "pendingChanges" SET DATA TYPE DECIMAL(14,2) USING round("pendingChanges"::numeric, 2),
  ALTER COLUMN "committed" SET DATA TYPE DECIMAL(14,2) USING round("committed"::numeric, 2),
  ALTER COLUMN "actual" SET DATA TYPE DECIMAL(14,2) USING round("actual"::numeric, 2),
  ALTER COLUMN "forecastFinal" SET DATA TYPE DECIMAL(14,2) USING round("forecastFinal"::numeric, 2);

ALTER TABLE "ChangeOrder"
  ALTER COLUMN "estimatedCost" SET DATA TYPE DECIMAL(14,2) USING round("estimatedCost"::numeric, 2),
  ALTER COLUMN "approvedCost" SET DATA TYPE DECIMAL(14,2) USING round("approvedCost"::numeric, 2);

ALTER TABLE "Contractor" ALTER COLUMN "contractValue" SET DATA TYPE DECIMAL(14,2) USING round("contractValue"::numeric, 2);

ALTER TABLE "CrewRequest" ALTER COLUMN "costImpact" SET DATA TYPE DECIMAL(14,2) USING round("costImpact"::numeric, 2);

ALTER TABLE "InventoryItem" ALTER COLUMN "replacementCost" SET DATA TYPE DECIMAL(14,2) USING round("replacementCost"::numeric, 2);

ALTER TABLE "Invoice" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

ALTER TABLE "Job" ALTER COLUMN "total" SET DATA TYPE DECIMAL(14,2) USING round("total"::numeric, 2);

ALTER TABLE "JobLine"
  ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3) USING round("quantity"::numeric, 3),
  ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,2) USING round("unitPrice"::numeric, 2),
  ALTER COLUMN "total" SET DATA TYPE DECIMAL(14,2) USING round("total"::numeric, 2);

ALTER TABLE "JobVariation" ALTER COLUMN "priceAdjustment" SET DATA TYPE DECIMAL(14,2) USING round("priceAdjustment"::numeric, 2);

ALTER TABLE "LogisticsItem" ALTER COLUMN "cost" SET DATA TYPE DECIMAL(14,2) USING round("cost"::numeric, 2);

ALTER TABLE "PurchaseOrder" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2) USING round("amount"::numeric, 2);

ALTER TABLE "Risk" ALTER COLUMN "costImpact" SET DATA TYPE DECIMAL(14,2) USING round("costImpact"::numeric, 2);
