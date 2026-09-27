-- A project can now be planned or completed, and can be fictional.
--
-- Project_status_check allowed only 'ACTIVE' because nothing ever wrote the
-- column (ACTION_PLAN.md G3.1). Historical yard periods are COMPLETED, and a
-- booked but not yet started period is PLANNED; only COMPLETED refuses new
-- work (src/lib/projectStatus.ts).
--
-- isDemo marks the fictional walkthrough data so projectScope() can keep it
-- out of real vessels' lists and totals, and every view can say what it is.
-- VesselArea.isDemo does the same for the demo project's areas, which live on
-- a real vessel's area list.

ALTER TABLE "Project" DROP CONSTRAINT "Project_status_check";
ALTER TABLE "Project" ADD CONSTRAINT "Project_status_check" CHECK ("status" IN ('ACTIVE', 'PLANNED', 'COMPLETED'));

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "VesselArea" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Project_vesselId_status_idx" ON "Project"("vesselId", "status");

-- CreateIndex
CREATE INDEX "Project_isDemo_idx" ON "Project"("isDemo");
