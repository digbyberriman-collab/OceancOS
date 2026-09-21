-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "jobId" TEXT;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MESSAGE';

-- CreateTable
CREATE TABLE "JobSection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionId" TEXT,
    "code" TEXT NOT NULL,
    "groupCode" TEXT,
    "clientRef" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contractType" TEXT NOT NULL DEFAULT 'VARIATION_CERTIFICATE',
    "pricingBasis" TEXT NOT NULL DEFAULT 'FIXED',
    "exceptionFlag" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NEW_REQUEST',
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3),
    "quoteDeliveredAt" TIMESTAMP(3),
    "validityDays" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "clientAcceptedAt" TIMESTAMP(3),
    "clientAcceptedById" TEXT,
    "yardAcceptedAt" TIMESTAMP(3),
    "yardAcceptedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "yardCompletedAt" TIMESTAMP(3),
    "worksAcceptedAt" TIMESTAMP(3),
    "warrantyMonths" INTEGER,
    "designatedAuthoriserId" TEXT,
    "linkedChangeOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLine" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "JobLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobNote" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,

    CONSTRAINT "JobNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobVariation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "dueTo" TEXT,
    "affecting" TEXT,
    "deliveryAdjustment" TEXT,
    "priceAdjustment" DOUBLE PRECISION,
    "invoicingTerms" JSONB,

    CONSTRAINT "JobVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobHistory" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "actorId" TEXT,
    "event" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFavourite" (
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFavourite_pkey" PRIMARY KEY ("userId","jobId")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSection_projectId_letter_key" ON "JobSection"("projectId", "letter");

-- CreateIndex
CREATE INDEX "Job_projectId_status_idx" ON "Job"("projectId", "status");

-- CreateIndex
CREATE INDEX "Job_projectId_groupCode_idx" ON "Job"("projectId", "groupCode");

-- CreateIndex
CREATE UNIQUE INDEX "Job_projectId_code_key" ON "Job"("projectId", "code");

-- CreateIndex
CREATE INDEX "JobLine_jobId_idx" ON "JobLine"("jobId");

-- CreateIndex
CREATE INDEX "JobNote_jobId_kind_idx" ON "JobNote"("jobId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "JobVariation_jobId_key" ON "JobVariation"("jobId");

-- CreateIndex
CREATE INDEX "JobHistory_jobId_idx" ON "JobHistory"("jobId");

-- CreateIndex
CREATE INDEX "Attachment_jobId_idx" ON "Attachment"("jobId");

-- CreateIndex
CREATE INDEX "Comment_jobId_idx" ON "Comment"("jobId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSection" ADD CONSTRAINT "JobSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "JobSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_linkedChangeOrderId_fkey" FOREIGN KEY ("linkedChangeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLine" ADD CONSTRAINT "JobLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobNote" ADD CONSTRAINT "JobNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobVariation" ADD CONSTRAINT "JobVariation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobHistory" ADD CONSTRAINT "JobHistory_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFavourite" ADD CONSTRAINT "JobFavourite_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
