"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, hasPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { ApprovalDecisionSchema, ChangeOrderCreateSchema, ChangeOrderStatusSchema } from "@/lib/validators";
import { nextSequence } from "@/lib/sequence";
import type { ChangeOrderStatus, CoApprovalStage } from "@/lib/enums";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { applyTransition } from "@/lib/workflow/transition";
import { getActiveProject, requireProjectAccess, usersWithPermissionOnProject } from "@/lib/project";
import {
  CO_STAGE_PERMISSION as STAGE_PERMISSION,
  CO_STATUSES_AWAITING_DECISION,
  assertTransitionChangeOrder,
  canDecideApproval,
  nextChangeOrderStatus,
  nextDueApprovals,
  permissionForTransition,
  type ApprovalRow,
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
  const number = await nextSequence("CO");
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

/**
 * Amend a change order while it is DRAFT or MORE_INFO.
 *
 * "Request more information" and "Revise" (REJECTED/MORE_INFO → DRAFT) both
 * existed as transitions with no way to actually act on them — the title,
 * description, cost estimate and every other field were frozen from
 * creation, so an approver's question could only be answered with a
 * free-text comment (ACTION_PLAN.md G3.9). This is that missing edit.
 */
export async function updateChangeOrder(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CO_EDIT);

  const id = String(formData.get("id") ?? "");
  const co = await prisma.changeOrder.findUnique({ where: { id } });
  if (!co) throw notFound("That change order");

  await requireProjectAccess(user.id, co.projectId);

  if (co.status !== "DRAFT" && co.status !== "MORE_INFO") {
    throw conflict(
      `This change order is now ${co.status.replace(/_/g, " ").toLowerCase()}, so it can no longer be edited.`
    );
  }

  const parsed = ChangeOrderCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw invalid(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const data = parsed.data;

  const normalise = (v: unknown): unknown => (v instanceof Prisma.Decimal ? v.toNumber() : v ?? null);
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
    (key) => normalise(data[key]) !== normalise((co as unknown as Record<string, unknown>)[key])
  );

  await prisma.$transaction(async (tx) => {
    await tx.changeOrder.update({ where: { id }, data: { ...data, updatedById: user.id } });
    if (changed.length) {
      await tx.changeOrderHistory.create({
        data: {
          changeOrderId: id,
          actorId: user.id,
          event: "EDITED",
          details: `Changed: ${changed.join(", ")}`,
        },
      });
    }
  });

  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "ChangeOrder",
    resourceId: id,
    details: { changed },
  });

  revalidatePath(`/change-orders/${id}`);
  redirect(`/change-orders/${id}`);
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

    // "Revise" (REJECTED → DRAFT, or MORE_INFO → DRAFT) used to leave every
    // approval row exactly as the prior decision left it — a rejecting
    // stage stayed REJECTED forever, permanently unable to block a
    // resubmission from completing the chain without them. A revision is a
    // fresh review: reset every row to PENDING so it is genuinely
    // re-decided, whichever status the change order is revised from.
    if ((co.status === "REJECTED" || co.status === "MORE_INFO") && target === "DRAFT") {
      await tx.changeOrderApproval.updateMany({
        where: { changeOrderId: id },
        data: { decision: "PENDING", decidedById: null, decidedAt: null, comment: null },
      });
    }

    // "Resume review" (MORE_INFO → UNDER_REVIEW) answers the question without
    // restarting the chain: the stages that already approved keep their
    // decision, and the stage that asked goes back to PENDING so it can
    // actually decide. Left at MORE_INFO it could never be decided again
    // (canDecideApproval only takes PENDING rows) and would block the chain
    // for good.
    if (co.status === "MORE_INFO" && target === "UNDER_REVIEW") {
      await tx.changeOrderApproval.updateMany({
        where: { changeOrderId: id, decision: "MORE_INFO" },
        data: { decision: "PENDING", decidedById: null, decidedAt: null },
      });
    }
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

/**
 * Decide one stage of a change order's approval chain.
 *
 * The money path. Rewritten for G2.2 — this used to be five unvalidated,
 * untransacted, unordered writes that let a rejected change order become
 * APPROVED (C7), wrote status outside the legal-transition map (C8), never
 * validated the decision value (C9), and had no project check at all (part
 * of C5). See AUDIT_REPORT.md §3 and the module doc on
 * lib/workflow/changeOrder.ts's approval-decision helpers, which carry the
 * actual decision logic and its own unit tests.
 */
export async function decideChangeOrderApproval(formData: FormData) {
  const user = await requireUser();

  const parsed = ApprovalDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw invalid(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const { approvalId, decision, comment } = parsed.data;

  const approval = await prisma.changeOrderApproval.findUnique({
    where: { id: approvalId },
    include: { changeOrder: { include: { project: { select: { id: true, vesselId: true } } } } },
  });
  if (!approval) throw notFound("That approval");
  const co = approval.changeOrder;

  await requireProjectAccess(user.id, co.projectId);

  const permKey = STAGE_PERMISSION[approval.stage as CoApprovalStage];
  if (!hasPermission(user, permKey as any)) {
    // The stage is named because the user can already see it on the page; the
    // permission key is not, because it would describe the permission model.
    throw forbidden(`You cannot decide the ${approval.stage} approval.`);
  }

  if (!CO_STATUSES_AWAITING_DECISION.includes(co.status as ChangeOrderStatus)) {
    throw conflict(
      `This change order is ${co.status.replace(/_/g, " ").toLowerCase()} and is not awaiting a decision.`
    );
  }

  const siblings: ApprovalRow[] = await prisma.changeOrderApproval.findMany({
    where: { changeOrderId: co.id },
    select: { id: true, stage: true, decision: true, required: true, order: true },
  });
  const current = siblings.find((s) => s.id === approvalId);
  if (!current) throw notFound("That approval");
  if (!canDecideApproval(current, siblings)) {
    throw conflict(
      current.decision !== "PENDING"
        ? "This approval has already been decided."
        : "An earlier stage in the chain has not decided yet."
    );
  }

  const updatedSiblings = siblings.map((s) => (s.id === approvalId ? { ...s, decision } : s));
  const nextStatus = nextChangeOrderStatus(co.status as ChangeOrderStatus, decision, updatedSiblings);
  if (nextStatus) assertTransitionChangeOrder(co.status as ChangeOrderStatus, nextStatus);

  // One transaction: the approval row, the history entry and — when the
  // decision moves the change order — the status write and approvedCost all
  // commit together or not at all (C10; previously five separate writes).
  await prisma.$transaction(async (tx) => {
    await tx.changeOrderApproval.update({
      where: { id: approvalId },
      data: { decision, decidedById: user.id, decidedAt: new Date(), comment },
    });

    await tx.changeOrderHistory.create({
      data: {
        changeOrderId: co.id,
        actorId: user.id,
        event: "APPROVAL",
        fromStatus: co.status,
        toStatus: nextStatus ?? co.status,
        details: `${approval.stage}: ${decision}${comment ? " — " + comment : ""}`,
      },
    });

    if (nextStatus) {
      const data: Record<string, unknown> = { updatedById: user.id };
      if (nextStatus === "APPROVED") {
        // Read fresh, inside the transaction, rather than the snapshot this
        // function loaded at the start — estimatedCost could have been
        // edited in the gap between then and this write landing.
        const fresh = await tx.changeOrder.findUniqueOrThrow({
          where: { id: co.id },
          select: { estimatedCost: true },
        });
        data.approvedCost = fresh.estimatedCost;
      }
      await applyTransition(tx.changeOrder, { id: co.id, from: co.status, to: nextStatus, data });
    }
  });

  await recordAudit({
    actorId: user.id,
    action: decision === "APPROVED" ? "APPROVE" : decision === "REJECTED" ? "REJECT" : "STATUS",
    resource: "ChangeOrderApproval",
    resourceId: approvalId,
    details: { stage: approval.stage, comment, coStatusAfter: nextStatus ?? co.status },
  });

  // Notify on every decision that moves something, not only the one that
  // happens to complete the chain — the chain notified nobody after the
  // first stage before this, and a rejection notified nobody at all.
  if (nextStatus === "REJECTED" || nextStatus === "MORE_INFO") {
    await notify({
      userIds: [co.createdById],
      kind: "STATUS_CHANGE",
      priority: "HIGH",
      title: `Change order ${co.number} ${nextStatus === "REJECTED" ? "rejected" : "needs more information"} — ${approval.stage}`,
      resource: "ChangeOrder",
      resourceId: co.id,
    });
  } else if (nextStatus === "APPROVED") {
    await notify({
      userIds: [co.createdById],
      kind: "STATUS_CHANGE",
      priority: "HIGH",
      title: `Change order ${co.number} fully approved`,
      resource: "ChangeOrder",
      resourceId: co.id,
    });
  } else {
    // Chain not settled — tell whichever stage(s) are next in line. More
    // than one can share the lowest order.
    for (const stage of nextDueApprovals(updatedSiblings)) {
      const approverIds = await usersWithPermissionOnProject(
        co.project,
        STAGE_PERMISSION[stage.stage as CoApprovalStage]
      );
      await notify({
        userIds: approverIds,
        kind: "APPROVAL_REQUIRED",
        priority: "HIGH",
        title: `Approval required: ${co.number} (${stage.stage})`,
        resource: "ChangeOrder",
        resourceId: co.id,
      });
    }
  }

  revalidatePath(`/change-orders/${co.id}`);
  revalidatePath("/approvals");
}

export async function addChangeOrderComment(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CO_VIEW);

  const id = String(formData.get("id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!id) return;
  // A `required` textarea is satisfied by a single space, which used to
  // trim to "" and silently no-op — no error, no revalidate, the box still
  // showing what was typed with no way to tell whether it posted
  // (ACTION_PLAN.md G3.6, forms-validation's [VALIDATION-MESSAGES]).
  if (!body) throw invalid("Write something before posting.");

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
