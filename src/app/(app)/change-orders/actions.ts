"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, hasPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { ChangeOrderCreateSchema, ChangeOrderStatusSchema } from "@/lib/validators";
import { nextSequence } from "@/lib/utils";
import type { CoApprovalStage } from "@/lib/enums";

const STAGE_PERMISSION: Record<CoApprovalStage, string> = {
  CAPTAIN: PERMISSIONS.CO_APPROVE_CAPTAIN,
  OWNERS_REP: PERMISSIONS.CO_APPROVE_OWNERS_REP,
  YARD: PERMISSIONS.CO_APPROVE_YARD,
  FINANCE: PERMISSIONS.CO_APPROVE_FINANCE,
  TECH_MANAGER: PERMISSIONS.CO_APPROVE_TECH,
  CLASS: PERMISSIONS.CO_APPROVE_CLASS,
  FLAG: PERMISSIONS.CO_APPROVE_FLAG,
};

function defaultApprovalStages(opts: { needsClass: boolean; needsFlag: boolean }): CoApprovalStage[] {
  const stages: CoApprovalStage[] = ["CAPTAIN", "TECH_MANAGER", "YARD", "OWNERS_REP", "FINANCE"];
  if (opts.needsClass) stages.push("CLASS");
  if (opts.needsFlag) stages.push("FLAG");
  return stages;
}

export async function createChangeOrder(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CO_CREATE);

  const parsed = ChangeOrderCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error("Invalid change order: " + parsed.error.errors.map((e) => e.message).join(", "));
  }
  const data = parsed.data;
  const number = await nextSequence("CO", () => prisma.changeOrder.count());
  const stages = defaultApprovalStages({ needsClass: data.needsClassReview, needsFlag: data.needsFlagReview });

  const co = await prisma.changeOrder.create({
    data: {
      ...data,
      number,
      createdById: user.id,
      updatedById: user.id,
      approvals: {
        create: stages.map((stage, idx) => ({ stage, order: idx, required: true })),
      },
      history: {
        create: { actorId: user.id, event: "CREATED", toStatus: "DRAFT" },
      },
    },
  });
  await recordAudit({
    actorId: user.id,
    action: "CREATE",
    resource: "ChangeOrder",
    resourceId: co.id,
    details: { number, title: data.title, estimatedCost: data.estimatedCost },
  });
  revalidatePath("/change-orders");
  redirect(`/change-orders/${co.id}`);
}

export async function transitionChangeOrder(id: string, toStatus: string, comment?: string) {
  const user = await requireUser();
  const co = await prisma.changeOrder.findUnique({ where: { id } });
  if (!co) throw new Error("Change order not found");

  const target = ChangeOrderStatusSchema.parse(toStatus);
  // Permission: who can move it where
  if (target === "SUBMITTED") assertPermission(user, PERMISSIONS.CO_SUBMIT);
  else if (target === "CANCELLED") assertPermission(user, PERMISSIONS.CO_CANCEL);
  else assertPermission(user, PERMISSIONS.CO_EDIT);

  // Legal transitions
  const legal: Record<string, string[]> = {
    DRAFT: ["SUBMITTED", "CANCELLED"],
    SUBMITTED: ["UNDER_REVIEW", "MORE_INFO", "CANCELLED"],
    UNDER_REVIEW: ["MORE_INFO", "APPROVED", "REJECTED"],
    MORE_INFO: ["UNDER_REVIEW", "CANCELLED"],
    APPROVED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: ["CLOSED"],
    CLOSED: [],
    REJECTED: ["DRAFT"],
    CANCELLED: [],
  };
  if (!legal[co.status]?.includes(target)) {
    throw new Error(`Illegal transition ${co.status} → ${target}`);
  }

  await prisma.$transaction([
    prisma.changeOrder.update({
      where: { id },
      data: { status: target, updatedById: user.id },
    }),
    prisma.changeOrderHistory.create({
      data: {
        changeOrderId: id,
        actorId: user.id,
        event: "STATUS",
        fromStatus: co.status,
        toStatus: target,
        details: comment,
      },
    }),
  ]);

  await recordAudit({
    actorId: user.id,
    action: "STATUS",
    resource: "ChangeOrder",
    resourceId: id,
    details: { from: co.status, to: target, comment },
  });

  // Notify creator on status change away from DRAFT
  if (co.createdById !== user.id) {
    await notify({
      userIds: [co.createdById],
      kind: "STATUS_CHANGE",
      title: `Change order ${co.number} → ${target.replace(/_/g, " ")}`,
      resource: "ChangeOrder",
      resourceId: id,
    });
  }

  // When submitted, notify all approvers for the first stage
  if (target === "UNDER_REVIEW" || target === "SUBMITTED") {
    const firstPending = await prisma.changeOrderApproval.findFirst({
      where: { changeOrderId: id, decision: "PENDING" },
      orderBy: { order: "asc" },
    });
    if (firstPending) {
      const permKey = STAGE_PERMISSION[firstPending.stage as CoApprovalStage];
      const approvers = await prisma.user.findMany({
        where: {
          active: true,
          roles: { some: { role: { permissions: { some: { permission: { key: permKey } } } } } },
        },
        select: { id: true },
      });
      await notify({
        userIds: approvers.map((u) => u.id),
        kind: "APPROVAL_REQUIRED",
        priority: "HIGH",
        title: `Approval required: ${co.number} (${firstPending.stage})`,
        resource: "ChangeOrder",
        resourceId: id,
      });
    }
  }

  revalidatePath(`/change-orders/${id}`);
  revalidatePath("/change-orders");
  revalidatePath("/approvals");
}

export async function decideChangeOrderApproval(formData: FormData) {
  const user = await requireUser();
  const approvalId = String(formData.get("approvalId") ?? "");
  const decision = String(formData.get("decision") ?? "") as "APPROVED" | "REJECTED" | "MORE_INFO";
  const comment = (formData.get("comment") as string) || null;
  const approval = await prisma.changeOrderApproval.findUnique({
    where: { id: approvalId },
    include: { changeOrder: true },
  });
  if (!approval) throw new Error("Approval not found");
  const permKey = STAGE_PERMISSION[approval.stage as CoApprovalStage];
  if (!hasPermission(user, permKey as any)) throw new Error(`Forbidden: ${approval.stage} approval requires ${permKey}`);

  await prisma.changeOrderApproval.update({
    where: { id: approvalId },
    data: {
      decision,
      decidedById: user.id,
      decidedAt: new Date(),
      comment,
    },
  });

  await prisma.changeOrderHistory.create({
    data: {
      changeOrderId: approval.changeOrderId,
      actorId: user.id,
      event: "APPROVAL",
      details: `${approval.stage}: ${decision}${comment ? " — " + comment : ""}`,
    },
  });

  await recordAudit({
    actorId: user.id,
    action: decision === "APPROVED" ? "APPROVE" : decision === "REJECTED" ? "REJECT" : "STATUS",
    resource: "ChangeOrderApproval",
    resourceId: approvalId,
    details: { stage: approval.stage, comment },
  });

  // If rejected → mark change order REJECTED. If more_info → MORE_INFO. If all approved → APPROVED.
  if (decision === "REJECTED") {
    await prisma.changeOrder.update({ where: { id: approval.changeOrderId }, data: { status: "REJECTED" } });
  } else if (decision === "MORE_INFO") {
    await prisma.changeOrder.update({ where: { id: approval.changeOrderId }, data: { status: "MORE_INFO" } });
  } else {
    const remaining = await prisma.changeOrderApproval.count({
      where: { changeOrderId: approval.changeOrderId, decision: "PENDING", required: true },
    });
    if (remaining === 0) {
      await prisma.changeOrder.update({
        where: { id: approval.changeOrderId },
        data: { status: "APPROVED", approvedCost: approval.changeOrder.estimatedCost },
      });
      await notify({
        userIds: [approval.changeOrder.createdById],
        kind: "STATUS_CHANGE",
        priority: "HIGH",
        title: `Change order ${approval.changeOrder.number} fully approved`,
        resource: "ChangeOrder",
        resourceId: approval.changeOrderId,
      });
    } else {
      await prisma.changeOrder.update({
        where: { id: approval.changeOrderId },
        data: { status: "UNDER_REVIEW" },
      });
    }
  }

  revalidatePath(`/change-orders/${approval.changeOrderId}`);
  revalidatePath("/approvals");
}

export async function addChangeOrderComment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;
  await prisma.comment.create({
    data: {
      authorId: user.id,
      body,
      resource: "ChangeOrder",
      resourceId: id,
      changeOrderId: id,
    },
  });
  await recordAudit({ actorId: user.id, action: "COMMENT", resource: "ChangeOrder", resourceId: id });
  revalidatePath(`/change-orders/${id}`);
}
