-- DropIndex
DROP INDEX "Job_projectId_status_idx";

-- CreateIndex
CREATE INDEX "Approval_projectId_idx" ON "Approval"("projectId");

-- CreateIndex
CREATE INDEX "Approval_requesterId_idx" ON "Approval"("requesterId");

-- CreateIndex
CREATE INDEX "Approval_approverId_idx" ON "Approval"("approverId");

-- CreateIndex
CREATE INDEX "Attachment_changeOrderId_idx" ON "Attachment"("changeOrderId");

-- CreateIndex
CREATE INDEX "Attachment_crewRequestId_idx" ON "Attachment"("crewRequestId");

-- CreateIndex
CREATE INDEX "Attachment_uploaderId_idx" ON "Attachment"("uploaderId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "Budget_projectId_idx" ON "Budget"("projectId");

-- CreateIndex
CREATE INDEX "Budget_categoryId_idx" ON "Budget"("categoryId");

-- CreateIndex
CREATE INDEX "BudgetCategory_parentId_idx" ON "BudgetCategory"("parentId");

-- CreateIndex
CREATE INDEX "ChangeOrder_projectId_status_idx" ON "ChangeOrder"("projectId", "status");

-- CreateIndex
CREATE INDEX "ChangeOrder_archivedAt_createdAt_idx" ON "ChangeOrder"("archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeOrder_vesselAreaId_idx" ON "ChangeOrder"("vesselAreaId");

-- CreateIndex
CREATE INDEX "ChangeOrder_createdById_idx" ON "ChangeOrder"("createdById");

-- CreateIndex
CREATE INDEX "ChangeOrder_updatedById_idx" ON "ChangeOrder"("updatedById");

-- CreateIndex
CREATE INDEX "ChangeOrderApproval_changeOrderId_decision_idx" ON "ChangeOrderApproval"("changeOrderId", "decision");

-- CreateIndex
CREATE INDEX "ChangeOrderApproval_decision_stage_idx" ON "ChangeOrderApproval"("decision", "stage");

-- CreateIndex
CREATE INDEX "ChangeOrderApproval_decidedById_idx" ON "ChangeOrderApproval"("decidedById");

-- CreateIndex
CREATE INDEX "ChangeOrderHistory_changeOrderId_idx" ON "ChangeOrderHistory"("changeOrderId");

-- CreateIndex
CREATE INDEX "ChangeOrderHistory_actorId_idx" ON "ChangeOrderHistory"("actorId");

-- CreateIndex
CREATE INDEX "Comment_changeOrderId_idx" ON "Comment"("changeOrderId");

-- CreateIndex
CREATE INDEX "Comment_crewRequestId_idx" ON "Comment"("crewRequestId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "CrewRequest_projectId_status_idx" ON "CrewRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "CrewRequest_dueDate_idx" ON "CrewRequest"("dueDate");

-- CreateIndex
CREATE INDEX "CrewRequest_vesselAreaId_idx" ON "CrewRequest"("vesselAreaId");

-- CreateIndex
CREATE INDEX "CrewRequest_linkedChangeOrderId_idx" ON "CrewRequest"("linkedChangeOrderId");

-- CreateIndex
CREATE INDEX "CrewRequest_assignedToId_idx" ON "CrewRequest"("assignedToId");

-- CreateIndex
CREATE INDEX "CrewRequest_requestedById_idx" ON "CrewRequest"("requestedById");

-- CreateIndex
CREATE INDEX "CrewRequest_createdById_idx" ON "CrewRequest"("createdById");

-- CreateIndex
CREATE INDEX "CrewRequest_updatedById_idx" ON "CrewRequest"("updatedById");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- CreateIndex
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");

-- CreateIndex
CREATE INDEX "Drawing_projectId_idx" ON "Drawing"("projectId");

-- CreateIndex
CREATE INDEX "Drawing_vesselAreaId_idx" ON "Drawing"("vesselAreaId");

-- CreateIndex
CREATE INDEX "DrawingRevision_drawingId_idx" ON "DrawingRevision"("drawingId");

-- CreateIndex
CREATE INDEX "InventoryItem_projectId_idx" ON "InventoryItem"("projectId");

-- CreateIndex
CREATE INDEX "InventoryItem_supplierId_idx" ON "InventoryItem"("supplierId");

-- CreateIndex
CREATE INDEX "Invoice_supplierId_idx" ON "Invoice"("supplierId");

-- CreateIndex
CREATE INDEX "Invoice_poId_idx" ON "Invoice"("poId");

-- CreateIndex
CREATE INDEX "Job_projectId_archivedAt_status_idx" ON "Job"("projectId", "archivedAt", "status");

-- CreateIndex
CREATE INDEX "Job_sectionId_idx" ON "Job"("sectionId");

-- CreateIndex
CREATE INDEX "Job_linkedChangeOrderId_idx" ON "Job"("linkedChangeOrderId");

-- CreateIndex
CREATE INDEX "Job_clientAcceptedById_idx" ON "Job"("clientAcceptedById");

-- CreateIndex
CREATE INDEX "Job_yardAcceptedById_idx" ON "Job"("yardAcceptedById");

-- CreateIndex
CREATE INDEX "Job_designatedAuthoriserId_idx" ON "Job"("designatedAuthoriserId");

-- CreateIndex
CREATE INDEX "Job_createdById_idx" ON "Job"("createdById");

-- CreateIndex
CREATE INDEX "Job_updatedById_idx" ON "Job"("updatedById");

-- CreateIndex
CREATE INDEX "JobFavourite_jobId_idx" ON "JobFavourite"("jobId");

-- CreateIndex
CREATE INDEX "JobHistory_actorId_idx" ON "JobHistory"("actorId");

-- CreateIndex
CREATE INDEX "LogisticsItem_projectId_idx" ON "LogisticsItem"("projectId");

-- CreateIndex
CREATE INDEX "LogisticsItem_responsibleId_idx" ON "LogisticsItem"("responsibleId");

-- CreateIndex
CREATE INDEX "LogisticsItem_supplierId_idx" ON "LogisticsItem"("supplierId");

-- CreateIndex
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");

-- CreateIndex
CREATE INDEX "MeetingAction_meetingId_idx" ON "MeetingAction"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAction_ownerId_idx" ON "MeetingAction"("ownerId");

-- CreateIndex
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "Project_vesselId_idx" ON "Project"("vesselId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_projectId_idx" ON "PurchaseOrder"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_costCodeId_idx" ON "PurchaseOrder"("costCodeId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_createdById_idx" ON "PurchaseOrder"("createdById");

-- CreateIndex
CREATE INDEX "Risk_projectId_idx" ON "Risk"("projectId");

-- CreateIndex
CREATE INDEX "Risk_ownerId_idx" ON "Risk"("ownerId");

-- CreateIndex
CREATE INDEX "ScheduleTask_projectId_idx" ON "ScheduleTask"("projectId");

-- CreateIndex
CREATE INDEX "ScheduleTask_ownerId_idx" ON "ScheduleTask"("ownerId");

-- CreateIndex
CREATE INDEX "ScheduleTask_dependsOnId_idx" ON "ScheduleTask"("dependsOnId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_activeProjectId_idx" ON "Session"("activeProjectId");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "UserRole_vesselId_idx" ON "UserRole"("vesselId");

-- CreateIndex
CREATE INDEX "UserRole_projectId_idx" ON "UserRole"("projectId");

-- CreateIndex
CREATE INDEX "UserRole_departmentId_idx" ON "UserRole"("departmentId");

-- CreateIndex
CREATE INDEX "VesselArea_vesselId_idx" ON "VesselArea"("vesselId");

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_vesselAreaId_fkey" FOREIGN KEY ("vesselAreaId") REFERENCES "VesselArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderApproval" ADD CONSTRAINT "ChangeOrderApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderHistory" ADD CONSTRAINT "ChangeOrderHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_vesselAreaId_fkey" FOREIGN KEY ("vesselAreaId") REFERENCES "VesselArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRequest" ADD CONSTRAINT "CrewRequest_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsItem" ADD CONSTRAINT "LogisticsItem_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsItem" ADD CONSTRAINT "LogisticsItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_vesselAreaId_fkey" FOREIGN KEY ("vesselAreaId") REFERENCES "VesselArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_clientAcceptedById_fkey" FOREIGN KEY ("clientAcceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_yardAcceptedById_fkey" FOREIGN KEY ("yardAcceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_designatedAuthoriserId_fkey" FOREIGN KEY ("designatedAuthoriserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobHistory" ADD CONSTRAINT "JobHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcceptanceChallenge" ADD CONSTRAINT "AcceptanceChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFavourite" ADD CONSTRAINT "JobFavourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
