-- Yard history: each vessel's historical yard periods, their scope and evidence.
--
-- A historical yard period is a COMPLETED Project with a YardPeriodRecord
-- beside it, holding what the source published — dates as labels at the
-- precision published, the yard as published, the planning cost band kept
-- apart from any project money. ProjectScopeItem holds its scope of work by
-- discipline (not as Jobs, which are priced quotes with a lifecycle), and
-- YardPeriodEvidence the sources, conflicts and excluded claims behind it.
-- VesselDataGap.projectId pins a gap to the period it is about.

-- AlterTable
ALTER TABLE "VesselDataGap" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "YardPeriodRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "importKey" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'IMPORT',
    "nameAtPeriod" TEXT,
    "periodType" TEXT NOT NULL,
    "startLabel" TEXT NOT NULL,
    "endLabel" TEXT NOT NULL,
    "precisionLabel" TEXT,
    "approximate" BOOLEAN NOT NULL DEFAULT false,
    "sortStart" DATE,
    "sortEnd" DATE,
    "yardText" TEXT,
    "cityText" TEXT,
    "countryText" TEXT,
    "scopeSummary" TEXT,
    "contractorsText" TEXT,
    "reportedCostText" TEXT,
    "costBandLabel" TEXT,
    "costBandLow" DECIMAL(14,2),
    "costBandHigh" DECIMAL(14,2),
    "costBandOpenEnded" BOOLEAN NOT NULL DEFAULT false,
    "costBandCurrency" TEXT,
    "costBandBasis" TEXT,
    "confidence" TEXT,
    "notes" TEXT,
    "registerEdition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "YardPeriodRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectScopeItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL DEFAULT 'IMPORT',
    "fingerprint" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ProjectScopeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YardPeriodEvidence" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "sourceQuality" TEXT,
    "confidence" TEXT,
    "issue" TEXT,
    "qualification" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'IMPORT',
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "YardPeriodEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "YardPeriodRecord_projectId_key" ON "YardPeriodRecord"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "YardPeriodRecord_importKey_key" ON "YardPeriodRecord"("importKey");

-- CreateIndex
CREATE INDEX "YardPeriodRecord_sortStart_idx" ON "YardPeriodRecord"("sortStart");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectScopeItem_fingerprint_key" ON "ProjectScopeItem"("fingerprint");

-- CreateIndex
CREATE INDEX "ProjectScopeItem_projectId_discipline_idx" ON "ProjectScopeItem"("projectId", "discipline");

-- CreateIndex
CREATE UNIQUE INDEX "YardPeriodEvidence_fingerprint_key" ON "YardPeriodEvidence"("fingerprint");

-- CreateIndex
CREATE INDEX "YardPeriodEvidence_projectId_idx" ON "YardPeriodEvidence"("projectId");

-- CreateIndex
CREATE INDEX "YardPeriodEvidence_vesselId_idx" ON "YardPeriodEvidence"("vesselId");

-- CreateIndex
CREATE INDEX "VesselDataGap_projectId_idx" ON "VesselDataGap"("projectId");

-- AddForeignKey
ALTER TABLE "VesselDataGap" ADD CONSTRAINT "VesselDataGap_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YardPeriodRecord" ADD CONSTRAINT "YardPeriodRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScopeItem" ADD CONSTRAINT "ProjectScopeItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YardPeriodEvidence" ADD CONSTRAINT "YardPeriodEvidence_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YardPeriodEvidence" ADD CONSTRAINT "YardPeriodEvidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YardPeriodEvidence" ADD CONSTRAINT "YardPeriodEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "VesselSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECK constraints, as for every other state column (ACTION_PLAN.md G3.1).
ALTER TABLE "YardPeriodRecord" ADD CONSTRAINT "YardPeriodRecord_origin_check" CHECK ("origin" IN ('IMPORT', 'MANUAL'));
ALTER TABLE "YardPeriodRecord" ADD CONSTRAINT "YardPeriodRecord_confidence_check" CHECK ("confidence" IN ('HIGH', 'MEDIUM', 'LOW'));
ALTER TABLE "YardPeriodRecord" ADD CONSTRAINT "YardPeriodRecord_costBand_check" CHECK ("costBandLow" IS NULL OR "costBandHigh" IS NULL OR "costBandLow" <= "costBandHigh");
ALTER TABLE "ProjectScopeItem" ADD CONSTRAINT "ProjectScopeItem_discipline_check" CHECK ("discipline" IN ('STRUCTURE_HULL_PAINT', 'MECHANICAL_PROPULSION', 'ELECTRICAL_AVIT_NAV', 'INTERIOR_GUEST', 'DECK_TENDER_MISSION', 'SURVEY_CLASS_COMPLIANCE', 'GENERAL'));
ALTER TABLE "ProjectScopeItem" ADD CONSTRAINT "ProjectScopeItem_origin_check" CHECK ("origin" IN ('IMPORT', 'MANUAL'));
ALTER TABLE "YardPeriodEvidence" ADD CONSTRAINT "YardPeriodEvidence_kind_check" CHECK ("kind" IN ('SOURCE', 'CONFLICT', 'EXCLUDED'));
ALTER TABLE "YardPeriodEvidence" ADD CONSTRAINT "YardPeriodEvidence_confidence_check" CHECK ("confidence" IN ('HIGH', 'MEDIUM', 'LOW'));
ALTER TABLE "YardPeriodEvidence" ADD CONSTRAINT "YardPeriodEvidence_origin_check" CHECK ("origin" IN ('IMPORT', 'MANUAL'));
