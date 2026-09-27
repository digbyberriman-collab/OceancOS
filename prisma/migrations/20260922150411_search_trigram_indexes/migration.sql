-- ACTION_PLAN.md G4.6, closing performance [QUERY]'s "Global search runs
-- seven leading-wildcard ILIKE scans across seven unindexed tables" —
-- `contains`/`mode: "insensitive"` compiles to `column ILIKE '%term%'`, and
-- a leading wildcard can never use a plain B-tree index, so every one of
-- these was an unavoidable sequential scan (confirmed against the live dev
-- database: pg_trgm was not installed). GIN trigram indexes are the fix
-- that actually works for a leading wildcard, unlike a B-tree.
--
-- Covers every column the global search page (src/app/(app)/search/page.tsx)
-- and the jobs list's own search (src/lib/jobs/views.ts's jobWhere) filter
-- on with `contains`.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "ChangeOrder_title_trgm_idx" ON "ChangeOrder" USING gin ("title" gin_trgm_ops);
CREATE INDEX "ChangeOrder_number_trgm_idx" ON "ChangeOrder" USING gin ("number" gin_trgm_ops);
CREATE INDEX "ChangeOrder_description_trgm_idx" ON "ChangeOrder" USING gin ("description" gin_trgm_ops);

CREATE INDEX "CrewRequest_title_trgm_idx" ON "CrewRequest" USING gin ("title" gin_trgm_ops);
CREATE INDEX "CrewRequest_number_trgm_idx" ON "CrewRequest" USING gin ("number" gin_trgm_ops);
CREATE INDEX "CrewRequest_description_trgm_idx" ON "CrewRequest" USING gin ("description" gin_trgm_ops);

CREATE INDEX "Drawing_title_trgm_idx" ON "Drawing" USING gin ("title" gin_trgm_ops);
CREATE INDEX "Drawing_number_trgm_idx" ON "Drawing" USING gin ("number" gin_trgm_ops);

CREATE INDEX "Document_name_trgm_idx" ON "Document" USING gin ("name" gin_trgm_ops);

CREATE INDEX "Supplier_name_trgm_idx" ON "Supplier" USING gin ("name" gin_trgm_ops);

CREATE INDEX "Contractor_name_trgm_idx" ON "Contractor" USING gin ("name" gin_trgm_ops);

CREATE INDEX "InventoryItem_name_trgm_idx" ON "InventoryItem" USING gin ("name" gin_trgm_ops);
CREATE INDEX "InventoryItem_serial_trgm_idx" ON "InventoryItem" USING gin ("serial" gin_trgm_ops);

-- The jobs list's own search (lib/jobs/views.ts's jobWhere), same shape.
CREATE INDEX "Job_code_trgm_idx" ON "Job" USING gin ("code" gin_trgm_ops);
CREATE INDEX "Job_title_trgm_idx" ON "Job" USING gin ("title" gin_trgm_ops);
CREATE INDEX "Job_description_trgm_idx" ON "Job" USING gin ("description" gin_trgm_ops);
CREATE INDEX "Job_clientRef_trgm_idx" ON "Job" USING gin ("clientRef" gin_trgm_ops);
