"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, hasPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { CrewRequestCreateSchema, CrewRequestStatusSchema } from "@/lib/validators";
import { nextSequence } from "@/lib/utils";

export async function createCrewRequest(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.CR_CREATE);
  const parsed = CrewRequestCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid request: " + parsed.error.errors.map((e) => e.message).join(", "));
  const data = parsed.data;
  const number = await nextSequence("REQ", () => prisma.crewRequest.count());
  const cr = await prisma.crewRequest.create({
    data: {
      ...data,
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
  if (!cr) throw new Error("Crew request not found");
  const target = CrewRequestStatusSchema.parse(toStatus);

  // permission rules
  if (target === "TRIAGED" || target === "ASSIGNED") assertPermission(user, PERMISSIONS.CR_TRIAGE);
  else if (target === "COMPLETED" || target === "CLOSED") assertPermission(user, PERMISSIONS.CR_COMPLETE);

  const legal: Record<string, string[]> = {
    NEW: ["TRIAGED", "ASSIGNED", "REJECTED"],
    TRIAGED: ["ASSIGNED", "REJECTED"],
    ASSIGNED: ["IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "REJECTED"],
    IN_PROGRESS: ["BLOCKED", "AWAITING_APPROVAL", "COMPLETED"],
    BLOCKED: ["IN_PROGRESS", "REJECTED"],
    AWAITING_APPROVAL: ["IN_PROGRESS", "COMPLETED", "REJECTED"],
    COMPLETED: ["CLOSED"],
    REJECTED: ["NEW"],
    CLOSED: [],
  };
  if (!legal[cr.status]?.includes(target)) {
    throw new Error(`Illegal transition ${cr.status} → ${target}`);
  }

  await prisma.crewRequest.update({
    where: { id },
    data: { status: target, updatedById: user.id },
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
  await prisma.crewRequest.update({
    where: { id },
    data: { assignedToId, status: assignedToId ? "ASSIGNED" : "TRIAGED", updatedById: user.id },
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
  const id = String(formData.get("id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!id || !body) return;
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
