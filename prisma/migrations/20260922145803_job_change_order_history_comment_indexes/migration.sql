-- DropIndex
DROP INDEX "Attachment_jobId_idx";

-- DropIndex
DROP INDEX "ChangeOrderHistory_changeOrderId_idx";

-- DropIndex
DROP INDEX "Comment_changeOrderId_idx";

-- DropIndex
DROP INDEX "Comment_crewRequestId_idx";

-- DropIndex
DROP INDEX "Comment_jobId_idx";

-- DropIndex
DROP INDEX "JobHistory_jobId_idx";

-- CreateIndex
CREATE INDEX "Attachment_jobId_createdAt_idx" ON "Attachment"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeOrderHistory_changeOrderId_createdAt_idx" ON "ChangeOrderHistory"("changeOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_jobId_createdAt_idx" ON "Comment"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_changeOrderId_createdAt_idx" ON "Comment"("changeOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_crewRequestId_createdAt_idx" ON "Comment"("crewRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "JobHistory_jobId_createdAt_idx" ON "JobHistory"("jobId", "createdAt");
