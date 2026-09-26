"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { getActiveProject, requireProjectAccess } from "@/lib/project";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { CrewRequestCreateSchema, CrewRequestStatusSchema } from "@/lib/validators";
import { nextSequence } from "@/lib/utils";
import { conflict, invalid, notFound } from "@/lib/errors";
import { applyTransition } from "@/lib/workflow/applyTransition";
import { CR_TRANSITION_PERMISSION } from "@/lib/workflow/crewRequest";
import type { CrewRequestStatus } from "@/lib/enums";

export async function createCrewRequest(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CR_CREATE);

  // The project comes from the caller's active project, never the form —
  // see the matching note on createChangeOrder.
  const project = await getActiveProject(user.id);
  if (!project) throw invalid("Choose a project before creating a crew request.");

  const parsed = CrewRequestCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error.errors.map((e) => e.message).join(", "));
  const data = parsed.data;
  const number = await nextSequence("REQ", () => prisma.crewRequest.count());
  const cr = await prisma.crewRequest.create({
    data: {
      ...data,
      projectId: project.id,
      number,
      requestedById: user.id,
      createdById: user.id,
      updatedById: user.id,
      status: data.assignedToId ? "ASSIGNED" : "NEW",
    },
  });
  await recordAudit({
    actorId: user.id,
    action: "CREATE",
    resource: "CrewRequest",
    resourceId: cr.id,
    details: { number, title: data.title, category: data.category, priority: data.priority },
  });
  if (data.assignedToId) {
    await notify({
      userIds: [data.assignedToId],
      kind: "ASSIGNED",
      priority: data.priority === "CRITICAL" ? "CRITICAL" : "MEDIUM",
      title: `Assigned: ${cr.number} ${data.title}`,
      resource: "CrewRequest",
      resourceId: cr.id,
    });
  }
  revalidatePath("/crew-requests");
  redirect(`/crew-requests/${cr.id}`);
}

export async function transitionCrewRequest(id: string, toStatus: string, comment?: string) {
  const user = await requireUser();
  const cr = await prisma.crewRequest.findUnique({ where: { id } });
  if (!cr) throw notFound("That crew request");
  const target = CrewRequestStatusSchema.parse(toStatus);
  const from = cr.status as CrewRequestStatus;

  // Legality, permission and project-access all run inside applyTransition
  // now (G2.4). Before this, IN_PROGRESS/BLOCKED/AWAITING_APPROVAL/REJECTED
  // fell through with no permission check at all — not even CR_VIEW — and
  // nothing here checked the actor could reach the request's project (C6).
  await applyTransition({
    entity: "CrewRequest",
    id,
    projectId: cr.projectId,
    from,
    to: target,
    actor: user,
    permission: CR_TRANSITION_PERMISSION[target],
    data: { updatedById: user.id },
  });

  await recordAudit({
    actorId: user.id,
    action: "STATUS",
    resource: "CrewRequest",
    resourceId: id,
    details: { from: cr.status, to: target, comment },
  });
  if (cr.requestedById !== user.id) {
    await notify({
      userIds: [cr.requestedById],
      kind: "STATUS_CHANGE",
      title: `${cr.number} → ${target.replace(/_/g, " ")}`,
      resource: "CrewRequest",
      resourceId: id,
    });
  }
  revalidatePath(`/crew-requests/${id}`);
  revalidatePath("/crew-requests");
}

export async function assignCrewRequest(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CR_ASSIGN);
  const id = String(formData.get("id"));
  const assignedToId = String(formData.get("assignedToId") || "") || null;

  const cr = await prisma.crewRequest.findUnique({ where: { id } });
  if (!cr) throw notFound("That crew request");
  await requireProjectAccess(user, cr.projectId);

  // Assignment used to write `status` directly, bypassing the transition
  // map entirely: assigning someone to a CLOSED or COMPLETED request forced
  // it straight back to ASSIGNED, and clearing the assignee on any request
  // forced it to TRIAGED, including from terminal states, with no audit
  // trail of the status move at all (workflow-logic's "Assigning bypasses
  // the transition map and reopens closed requests"). Now the status only
  // ever moves along the two edges assignment can legally cause — NEW/
  // TRIAGED to ASSIGNED when someone is assigned, ASSIGNED back to TRIAGED
  // when cleared — and that move goes through applyTransition's own
  // legality/permission/project-access/atomic-write path. Assigning while
  // in any other status (IN_PROGRESS, COMPLETED, CLOSED, REJECTED, ...)
  // changes only the assignee.
  let nextStatus = cr.status as CrewRequestStatus;
  if (assignedToId && (cr.status === "NEW" || cr.status === "TRIAGED")) {
    nextStatus = "ASSIGNED";
  } else if (!assignedToId && cr.status === "ASSIGNED") {
    nextStatus = "TRIAGED";
  }

  if (nextStatus !== cr.status) {
    await applyTransition({
      entity: "CrewRequest",
      id,
      projectId: cr.projectId,
      from: cr.status as CrewRequestStatus,
      to: nextStatus,
      actor: user,
      permission: CR_TRANSITION_PERMISSION[nextStatus],
      data: { assignedToId, updatedById: user.id },
    });
  } else {
    const result = await prisma.crewRequest.updateMany({
      where: { id, status: cr.status },
      data: { assignedToId, updatedById: user.id },
    });
    if (result.count !== 1) throw conflict();
  }

  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "CrewRequest",
    resourceId: id,
    details: { assignedToId, statusFrom: cr.status, statusTo: nextStatus },
  });
  if (assignedToId) {
    await notify({
      userIds: [assignedToId],
      kind: "ASSIGNED",
      title: `Assigned to you`,
      resource: "CrewRequest",
      resourceId: id,
    });
  }
  revalidatePath(`/crew-requests/${id}`);
}

export async function addCrewRequestComment(formData: FormData) {
  const user = await requireUser();
  // Same gap as addChangeOrderComment (G2.12; auth-security's C6 "all four
  // crew-request actions"): the page gates the comment form behind
  // CR_VIEW, but the action itself is reachable directly with no
  // permission, parent-existence, or project-access check at all.
  assertPermission(user, PERMISSIONS.CR_VIEW);
  const id = String(formData.get("id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;

  const cr = await prisma.crewRequest.findUnique({ where: { id }, select: { projectId: true } });
  if (!cr) throw notFound("That crew request");
  await requireProjectAccess(user, cr.projectId);

  await prisma.comment.create({
    data: {
      authorId: user.id,
      body,
      resource: "CrewRequest",
      resourceId: id,
      crewRequestId: id,
    },
  });
  await recordAudit({ actorId: user.id, action: "COMMENT", resource: "CrewRequest", resourceId: id });
  revalidatePath(`/crew-requests/${id}`);
}
