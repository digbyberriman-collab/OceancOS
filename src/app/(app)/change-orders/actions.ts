"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, hasPermission, PERMISSIONS } from "@/lib/rbac";
import { getActiveProject, requireProjectAccess, usersReachingProject } from "@/lib/project";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { ApprovalDecisionSchema, ChangeOrderCreateSchema, ChangeOrderStatusSchema } from "@/lib/validators";
import { nextSequence } from "@/lib/utils";
import type { ChangeOrderStatus, CoApprovalStage } from "@/lib/enums";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import {
  CO_STAGE_PERMISSION as STAGE_PERMISSION,
  permissionForTransition,
} from "@/lib/workflow/changeOrder";
import { applyTransition } from "@/lib/workflow/applyTransition";

function defaultApprovalStages(opts: { needsClass: boolean; needsFlag: boolean }): CoApprovalStage[] {
  const stages: CoApprovalStage[] = ["CAPTAIN", "TECH_MANAGER", "YARD", "OWNERS_REP", "FINANCE"];
  if (opts.needsClass) stages.push("CLASS");
  if (opts.needsFlag) stages.push("FLAG");
  return stages;
}

export async function createChangeOrder(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CO_CREATE);

  // The project comes from the caller's active project, never the form —
  // the project <select> this used to read from listed every project in
  // the database, unfiltered by what the caller could reach (C4).
  const project = await getActiveProject(user.id);
  if (!project) throw invalid("Choose a project before creating a change order.");

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
  const co = await prisma.changeOrder.findUnique({ where: { id } });
  if (!co) throw notFound("That change order");

  const target = ChangeOrderStatusSchema.parse(toStatus);

  // applyTransition asserts the permission and the legal move (and refuses
  // APPROVED / REJECTED / MORE_INFO outright — only decideChangeOrderApproval
  // may reach them, see CO_GENERIC_UNREACHABLE), and checks project access.
  await prisma.$transaction(async (tx) => {
    await applyTransition({
      entity: "ChangeOrder",
      id,
      projectId: co.projectId,
      from: co.status,
      to: target,
      actor: user,
      permission: permissionForTransition(target),
      data: { updatedById: user.id },
      db: tx,
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
      const approvers = await prisma.user.findMany({
        where: {
          active: true,
          roles: { some: { role: { permissions: { some: { permission: { key: permKey } } } } } },
        },
        select: { id: true },
      });
      const recipients = await usersReachingProject(approvers.map((u) => u.id), co.projectId);
      await notify({
        userIds: recipients,
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

/**
 * Decide one stage of a change order's approval chain.
 *
 * This is the money path, rewritten rather than patched (G2.2 in
 * ACTION_PLAN.md): the decision is validated against a schema instead of
 * cast from a raw string (C9); a rejected stage terminates the chain
 * outright instead of merely dropping out of a "remaining" count a later
 * stage's approval could still complete (C7); the stage `order` column,
 * stored on every approval row since it was created and never once read,
 * now gates which stage may be decided next (C8); the status write goes
 * through `applyTransition` (C5's project check, plus the same atomic
 * conditional write every other transition gets); and all five writes -
 * the approval, the history row, and the change order's own status - land
 * in one transaction (C10).
 */
export async function decideChangeOrderApproval(formData: FormData) {
  const user = await requireUser();

  const parsed = ApprovalDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error.errors.map((e) => e.message).join(", "));
  const approvalId = parsed.data.approvalId ?? parsed.data.changeOrderApprovalId;
  if (!approvalId) throw invalid("No approval was specified.");
  if (parsed.data.decision === "DELEGATED") throw invalid("Delegating a decision is not supported yet.");
  const decision = parsed.data.decision;
  const comment = parsed.data.comment || null;

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
  await requireProjectAccess(user, approval.changeOrder.projectId);

  if (approval.decision !== "PENDING") {
    throw conflict("This stage was already decided.");
  }
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(approval.changeOrder.status)) {
    throw conflict(
      `This change order is ${approval.changeOrder.status.replace(/_/g, " ").toLowerCase()} and cannot be decided right now.`
    );
  }

  // The stage order is stored and was never read: a later stage could be
  // decided before an earlier, still-pending required one. Refuse unless
  // this is the lowest-order required stage still PENDING.
  const stages = await prisma.changeOrderApproval.findMany({
    where: { changeOrderId: approval.changeOrderId },
    orderBy: { order: "asc" },
  });
  const nextDue = stages.find((s) => s.required && s.decision === "PENDING");
  if (!nextDue || nextDue.id !== approval.id) {
    throw conflict("An earlier approval stage is still pending and must be decided first.");
  }

  const { newStatus, fullyApproved } = await prisma.$transaction(async (tx) => {
    // Conditional on the approval still being PENDING, mirroring
    // applyTransition's own guard against two concurrent decisions.
    const updated = await tx.changeOrderApproval.updateMany({
      where: { id: approval.id, decision: "PENDING" },
      data: { decision, decidedById: user.id, decidedAt: new Date(), comment },
    });
    if (updated.count !== 1) throw conflict();

    await tx.changeOrderHistory.create({
      data: {
        changeOrderId: approval.changeOrderId,
        actorId: user.id,
        event: "APPROVAL",
        details: `${approval.stage}: ${decision}${comment ? " — " + comment : ""}`,
      },
    });

    // A REJECTED stage terminates the chain. It must not merely stop
    // counting toward "remaining" - the bug that let a later stage's
    // APPROVED still drive the change order to APPROVED once every OTHER
    // required stage had cleared, overriding the rejection (C7).
    let newStatus: ChangeOrderStatus;
    let fullyApproved = false;
    if (decision === "REJECTED") {
      newStatus = "REJECTED";
    } else if (decision === "MORE_INFO") {
      newStatus = "MORE_INFO";
    } else {
      const remaining = await tx.changeOrderApproval.count({
        where: { changeOrderId: approval.changeOrderId, decision: "PENDING", required: true },
      });
      fullyApproved = remaining === 0;
      newStatus = fullyApproved ? "APPROVED" : "UNDER_REVIEW";
    }

    if (newStatus !== approval.changeOrder.status) {
      await applyTransition({
        entity: "ChangeOrder",
        id: approval.changeOrderId,
        projectId: approval.changeOrder.projectId,
        from: approval.changeOrder.status,
        to: newStatus,
        actor: user,
        permission: permKey,
        data: fullyApproved ? { approvedCost: approval.changeOrder.estimatedCost } : undefined,
        db: tx,
        viaCeremony: true,
      });
    }

    return { newStatus, fullyApproved };
  });

  await recordAudit({
    actorId: user.id,
    action: decision === "APPROVED" ? "APPROVE" : decision === "REJECTED" ? "REJECT" : "STATUS",
    resource: "ChangeOrderApproval",
    resourceId: approval.id,
    details: { stage: approval.stage, comment },
  });

  // Notify on every outcome, not only full approval: a rejection or a
  // request for more information previously told nobody at all, and
  // advancing to the next stage never told that stage's approvers it was
  // now their turn (workflow-logic [CHANGE ORDERS]).
  const coLabel = `${approval.changeOrder.number} — ${approval.changeOrder.title}`;
  if (decision === "REJECTED") {
    await notify({
      userIds: [approval.changeOrder.createdById],
      kind: "STATUS_CHANGE",
      priority: "HIGH",
      title: `Rejected at ${approval.stage.replace(/_/g, " ")}: ${coLabel}`,
      resource: "ChangeOrder",
      resourceId: approval.changeOrderId,
    });
  } else if (decision === "MORE_INFO") {
    await notify({
      userIds: [approval.changeOrder.createdById],
      kind: "STATUS_CHANGE",
      title: `More information requested at ${approval.stage.replace(/_/g, " ")}: ${coLabel}`,
      resource: "ChangeOrder",
      resourceId: approval.changeOrderId,
    });
  } else if (fullyApproved) {
    await notify({
      userIds: [approval.changeOrder.createdById],
      kind: "STATUS_CHANGE",
      priority: "HIGH",
      title: `Fully approved: ${coLabel}`,
      resource: "ChangeOrder",
      resourceId: approval.changeOrderId,
    });
  } else {
    const nextStage = await prisma.changeOrderApproval.findFirst({
      where: { changeOrderId: approval.changeOrderId, decision: "PENDING", required: true },
      orderBy: { order: "asc" },
    });
    if (nextStage) {
      const nextPermKey = STAGE_PERMISSION[nextStage.stage as CoApprovalStage];
      const candidates = await prisma.user.findMany({
        where: {
          active: true,
          roles: { some: { role: { permissions: { some: { permission: { key: nextPermKey } } } } } },
        },
        select: { id: true },
      });
      const recipients = await usersReachingProject(
        candidates.map((u) => u.id),
        approval.changeOrder.projectId
      );
      await notify({
        userIds: recipients,
        kind: "APPROVAL_REQUIRED",
        priority: "HIGH",
        title: `Approval required: ${approval.changeOrder.number} (${nextStage.stage})`,
        resource: "ChangeOrder",
        resourceId: approval.changeOrderId,
      });
    }
  }

  revalidatePath(`/change-orders/${approval.changeOrderId}`);
  revalidatePath("/approvals");
}

export async function addChangeOrderComment(formData: FormData) {
  const user = await requireUser();
  // A server action is reachable directly, with no render-time check at
  // all — the detail page gating the comment form behind CO_VIEW never
  // stopped a crafted request from posting here. Both this and
  // addCrewRequestComment (crew-requests/actions.ts) took no permission,
  // no parent lookup, and no project-access check at all, so an orphan
  // comment could be written against an id that names no real change order
  // (G2.12; auth-security's C5 "…and addChangeOrderComment").
  assertPermission(user, PERMISSIONS.CO_VIEW);
  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;

  const co = await prisma.changeOrder.findUnique({ where: { id }, select: { projectId: true } });
  if (!co) throw notFound("That change order");
  await requireProjectAccess(user, co.projectId);

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
