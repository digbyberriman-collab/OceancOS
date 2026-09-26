-- AlterTable
ALTER TABLE "Vessel" ADD COLUMN     "beam" DOUBLE PRECISION,
ADD COLUMN     "builder" TEXT,
ADD COLUMN     "builderUrl" TEXT,
ADD COLUMN     "callSign" TEXT,
ADD COLUMN     "classNotation" TEXT,
ADD COLUMN     "classSociety" TEXT,
ADD COLUMN     "crew" INTEGER,
ADD COLUMN     "cruiseSpeed" DOUBLE PRECISION,
ADD COLUMN     "databaseUrl" TEXT,
ADD COLUMN     "deadweight" DOUBLE PRECISION,
ADD COLUMN     "dimensionsBasis" TEXT,
ADD COLUMN     "dimensionsNote" TEXT,
ADD COLUMN     "displacement" DOUBLE PRECISION,
ADD COLUMN     "draft" DOUBLE PRECISION,
ADD COLUMN     "exteriorDesigner" TEXT,
ADD COLUMN     "features" TEXT,
ADD COLUMN     "formerNames" TEXT,
ADD COLUMN     "freshWaterCapacity" INTEGER,
ADD COLUMN     "fuelCapacity" INTEGER,
ADD COLUMN     "generators" TEXT,
ADD COLUMN     "grossTonnage" INTEGER,
ADD COLUMN     "guestCabins" INTEGER,
ADD COLUMN     "guests" INTEGER,
ADD COLUMN     "hullMaterial" TEXT,
ADD COLUMN     "identityNote" TEXT,
ADD COLUMN     "identitySupplementUrl" TEXT,
ADD COLUMN     "interiorDesigner" TEXT,
ADD COLUMN     "lastRefitYear" INTEGER,
ADD COLUMN     "mainMachinery" TEXT,
ADD COLUMN     "maxPersonsOnBoard" INTEGER,
ADD COLUMN     "maxSailSpeed" DOUBLE PRECISION,
ADD COLUMN     "maxSpeed" DOUBLE PRECISION,
ADD COLUMN     "mmsi" TEXT,
ADD COLUMN     "navalArchitect" TEXT,
ADD COLUMN     "netTonnage" INTEGER,
ADD COLUMN     "officialNumber" TEXT,
ADD COLUMN     "particularsCheckedOn" TIMESTAMP(3),
ADD COLUMN     "portOfRegistry" TEXT,
ADD COLUMN     "propulsion" TEXT,
ADD COLUMN     "rangeNm" INTEGER,
ADD COLUMN     "sailArea" DOUBLE PRECISION,
ADD COLUMN     "superstructureMaterial" TEXT,
ADD COLUMN     "technicalNote" TEXT,
ADD COLUMN     "tonnageBasis" TEXT,
ADD COLUMN     "updatedById" TEXT,
ADD COLUMN     "verification" TEXT NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "vesselType" TEXT,
ADD COLUMN     "yardNumber" TEXT,
ADD COLUMN     "yardNumberBasis" TEXT,
ADD COLUMN     "yardNumberNote" TEXT;

-- CreateTable
CREATE TABLE "VesselSource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "publisher" TEXT,
    "sourceType" TEXT,
    "scope" TEXT,
    "fieldsSupported" TEXT,
    "url" TEXT,
    "accessedOn" TIMESTAMP(3),
    "limitations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VesselSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselObservation" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "fieldKey" TEXT,
    "fieldLabel" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "basis" TEXT,
    "qualification" TEXT,
    "sourceCode" TEXT,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "observedOn" TIMESTAMP(3),
    "origin" TEXT NOT NULL DEFAULT 'IMPORT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "VesselObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselDataGap" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT,
    "scope" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "treatment" TEXT,
    "evidenceNeeded" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reference" TEXT,
    "resolutionNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "VesselDataGap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VesselSource_code_key" ON "VesselSource"("code");

-- CreateIndex
CREATE UNIQUE INDEX "VesselObservation_fingerprint_key" ON "VesselObservation"("fingerprint");

-- CreateIndex
CREATE INDEX "VesselObservation_vesselId_fieldKey_idx" ON "VesselObservation"("vesselId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "VesselDataGap_fingerprint_key" ON "VesselDataGap"("fingerprint");

-- CreateIndex
CREATE INDEX "VesselDataGap_vesselId_status_idx" ON "VesselDataGap"("vesselId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_yardNumber_key" ON "Vessel"("yardNumber");

-- A blank IMO is "not known", not a value: clear any before IMO becomes unique.
UPDATE "Vessel" SET "imo" = NULL WHERE btrim("imo") = '';

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_imo_key" ON "Vessel"("imo");

-- AddForeignKey
ALTER TABLE "VesselObservation" ADD CONSTRAINT "VesselObservation_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VesselObservation" ADD CONSTRAINT "VesselObservation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "VesselSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VesselDataGap" ADD CONSTRAINT "VesselDataGap_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

