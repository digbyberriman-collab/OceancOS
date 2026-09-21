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
import type { ChangeOrderStatus, CoApprovalStage } from "@/lib/enums";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { applyTransition } from "@/lib/workflow/transition";
import { getActiveProject, requireProjectAccess, usersWithPermissionOnProject } from "@/lib/project";
import {
  CO_STAGE_PERMISSION as STAGE_PERMISSION,
  assertTransitionChangeOrder,
  permissionForTransition,
} from "@/lib/workflow/changeOrder";

function defaultApprovalStages(opts: { needsClass: boolean; needsFlag: boolean }): CoApprovalStage[] {
  const stages: CoApprovalStage[] = ["CAPTAIN", "TECH_MANAGER", "YARD", "OWNERS_REP", "FINANCE"];
  if (opts.needsClass) stages.push("CLASS");
  if (opts.needsFlag) stages.push("FLAG");
  return stages;
}

export async function createChangeOrder(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CO_CREATE);

  // The project comes from the caller's active project, never from the
  // submitted form — see the note on ChangeOrderCreateSchema.
  const project = await getActiveProject(user.id);
  if (!project) throw invalid("Choose a project before raising a change order.");

  const parsed = ChangeOrderCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw invalid(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const data = parsed.data;
  const number = await nextSequence("CO", () => prisma.changeOrder.count());
  const stages = defaultApprovalStages({ needsClass: data.needsClassReview, needsFlag: data.needsFlagReview });

  const co = await prisma.changeOrder.create({
    data: {
      ...data,
      projectId: project.id,
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
  const co = await prisma.changeOrder.findUnique({
    where: { id },
    include: { project: { select: { id: true, vesselId: true } } },
  });
  if (!co) throw notFound("That change order");

  // permissionForTransition checks *what the role may do*, not *whether this
  // project is one the caller can reach* — this was previously missing
  // entirely (AUDIT_REPORT.md C5: "no record-level or project-level check").
  await requireProjectAccess(user.id, co.projectId);

  const target = ChangeOrderStatusSchema.parse(toStatus);
  // Who can move it where — see lib/workflow/changeOrder.ts
  assertPermission(user, permissionForTransition(target));
  assertTransitionChangeOrder(co.status as ChangeOrderStatus, target);

  // Conditional on the status this function read (see applyTransition); the
  // interactive transaction rolls the history row back with it if someone
  // else moved this change order first.
  await prisma.$transaction(async (tx) => {
    await applyTransition(tx.changeOrder, {
      id,
      from: co.status,
      to: target,
      data: { updatedById: user.id },
    });
    await tx.changeOrderHistory.create({
      data: {
        changeOrderId: id,
        actorId: user.id,
        event: "STATUS",
        fromStatus: co.status,
        toStatus: target,
        details: comment,
      },
    });
  });

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
      // Only the approvers on this project — see the note on
      // usersWithPermissionOnProject in lib/project.ts.
      const approverIds = await usersWithPermissionOnProject(co.project, permKey);
      await notify({
        userIds: approverIds,
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
  if (!approval) throw notFound("That approval");
  const permKey = STAGE_PERMISSION[approval.stage as CoApprovalStage];
  if (!hasPermission(user, permKey as any)) {
    // The stage is named because the user can already see it on the page; the
    // permission key is not, because it would describe the permission model.
    throw forbidden(`You cannot decide the ${approval.stage} approval.`);
  }

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
  assertPermission(user, PERMISSIONS.CO_VIEW);

  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;

  // No CO_COMMENT permission key exists — CO_VIEW plus project access is
  // the check available without inventing one (a role-grant decision, not
  // this pass's to make; see ACTION_PLAN.md G3.12 for the same situation on
  // suppliers). Previously: no permission check, no existence check, no
  // project check at all — any signed-in user, including GUEST, could post
  // into any project's change order by id.
  const co = await prisma.changeOrder.findUnique({ where: { id }, select: { projectId: true } });
  if (!co) throw notFound("That change order");
  await requireProjectAccess(user.id, co.projectId);

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
