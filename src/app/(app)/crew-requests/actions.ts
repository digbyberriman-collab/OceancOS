"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { CrewRequestCreateSchema, CrewRequestStatusSchema } from "@/lib/validators";
import { nextSequence } from "@/lib/sequence";
import { invalid, notFound } from "@/lib/errors";
import { applyTransition } from "@/lib/workflow/transition";
import { getActiveProject, requireProjectAccess } from "@/lib/project";
import {
  CR_TRANSITION_PERMISSION,
  assertTransitionCrewRequest,
} from "@/lib/workflow/crewRequest";
import type { CrewRequestStatus } from "@/lib/enums";

export async function createCrewRequest(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CR_CREATE);

  // The project comes from the caller's active project, never from the
  // submitted form — see the note on CrewRequestCreateSchema.
  const project = await getActiveProject(user.id);
  if (!project) throw invalid("Choose a project before raising a crew request.");

  const parsed = CrewRequestCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw invalid(parsed.error.errors.map((e) => e.message).join(", "));
  const data = parsed.data;
  const number = await nextSequence("REQ");
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

  // Previously missing entirely — see the identical note on
  // transitionChangeOrder.
  await requireProjectAccess(user.id, cr.projectId);

  const target = CrewRequestStatusSchema.parse(toStatus);

  // An exhaustive map, not an if/else chain a target can fall through
  // unchecked — the shape of C6. See lib/workflow/crewRequest.ts.
  assertPermission(user, CR_TRANSITION_PERMISSION[target]);
  assertTransitionCrewRequest(cr.status as CrewRequestStatus, target);

  // Conditional on the status this function read — see applyTransition.
  await applyTransition(prisma.crewRequest, {
    id,
    from: cr.status,
    to: target,
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

/**
 * Change who owns a crew request.
 *
 * Deliberately never touches `status` — it used to jump straight to
 * ASSIGNED (or TRIAGED, clearing the assignee) with no check that the move
 * was legal from wherever the request actually was, bypassing the map
 * `transitionCrewRequest` obeys entirely. `CLOSED` is declared terminal in
 * that map; this could still reopen it, silently, with no history row and
 * an audit entry that recorded only the new assignee, not the status jump.
 * (AUDIT_REPORT.md: "Assigning bypasses the transition map and reopens
 * closed requests.") The audit's own "better" fix, taken here: assignment
 * changes who owns the request; an explicit transition — through
 * transitionCrewRequest, which does obey the map — changes what state it's
 * in. The two are independent now, so there is nothing left to bypass.
 */
export async function assignCrewRequest(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CR_ASSIGN);
  const id = String(formData.get("id"));

  // CR_ASSIGN is a role permission, not proof this request is one the
  // caller's role scope reaches — without this, a project-scoped user could
  // assign any crew request platform-wide by id.
  const cr = await prisma.crewRequest.findUnique({ where: { id }, select: { projectId: true } });
  if (!cr) throw notFound("That crew request");
  await requireProjectAccess(user.id, cr.projectId);

  const assignedToId = String(formData.get("assignedToId") || "") || null;
  await prisma.crewRequest.update({
    where: { id },
    data: { assignedToId, updatedById: user.id },
  });
  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "CrewRequest",
    resourceId: id,
    details: { assignedToId },
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
  assertPermission(user, PERMISSIONS.CR_VIEW);

  const id = String(formData.get("id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!id) return;
  // A `required` textarea is satisfied by a single space, which used to
  // trim to "" and silently no-op — no error, no revalidate, the box still
  // showing what was typed with no way to tell whether it posted
  // (ACTION_PLAN.md G3.6, forms-validation's [VALIDATION-MESSAGES]).
  if (!body) throw invalid("Write something before posting.");

  // Same situation as addChangeOrderComment — see the note there.
  const cr = await prisma.crewRequest.findUnique({ where: { id }, select: { projectId: true } });
  if (!cr) throw notFound("That crew request");
  await requireProjectAccess(user.id, cr.projectId);

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
