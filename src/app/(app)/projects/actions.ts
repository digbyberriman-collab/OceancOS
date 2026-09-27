"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { invalid, notFound } from "@/lib/errors";
import { setFormFlash } from "@/lib/formFlash";
import { requireProjectAccess, storeActiveProject } from "@/lib/project";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { ScopeItemSchema, YardPeriodRecordSchema } from "@/lib/validators";
import { parseCostBand } from "@/lib/yardPeriods/cost";
import { identifiedPlace } from "@/lib/yardPeriods/importRegister";
import { periodBounds } from "@/lib/yardPeriods/period";

/**
 * Make a project the one being worked in and go to its dashboard — the way
 * into a historical yard period, which the header switcher does not list.
 */
export async function openProjectAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) redirect("/projects");
  // Refuses a project the user cannot reach.
  await storeActiveProject(user.id, projectId);
  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Session",
    resourceId: user.id,
    details: { activeProjectId: projectId },
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ---------- A historical yard period's record ----------

export type YardPeriodFormFlash = {
  error: string;
  values: Record<string, string>;
};

const RECORD_FIELDS = [
  "periodType",
  "startLabel",
  "endLabel",
  "precisionLabel",
  "nameAtPeriod",
  "yardText",
  "cityText",
  "countryText",
  "scopeSummary",
  "contractorsText",
  "reportedCostText",
  "costBandLabel",
  "costBandBasis",
  "confidence",
  "notes",
] as const;

/** A project the caller may edit, with its record. */
async function editableRecord(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { yardPeriod: true },
  });
  if (!project?.yardPeriod) throw notFound("That yard period");
  return { project, record: project.yardPeriod };
}

/**
 * Correct or fill in a historical yard period's record — from owner or
 * manager records, a class survey, a yard invoice — keeping its dates at the
 * precision the evidence gives. A later import of the register only fills
 * what is still blank, so a correction made here stays.
 */
export async function updateYardPeriodAction(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.PROJ_EDIT);
  const id = String(formData.get("projectId") ?? "");
  const { project, record } = await editableRecord(user.id, id);

  const values = Object.fromEntries(RECORD_FIELDS.map((k) => [k, String(formData.get(k) ?? "")]));
  const back = (error: string): never => {
    setFormFlash(`yard-period-${id}`, { error, values } satisfies YardPeriodFormFlash);
    redirect(`/projects/${id}/edit`);
  };

  const parsed = YardPeriodRecordSchema.safeParse(values);
  if (!parsed.success) back(parsed.error.errors[0].message);
  const data = parsed.data!;

  const { sortStart, sortEnd, approximate } = periodBounds(data.startLabel, data.endLabel);
  const band = parseCostBand(data.costBandLabel);
  const next = {
    ...data,
    confidence: data.confidence ?? null,
    sortStart,
    sortEnd,
    approximate,
    costBandLabel: band?.label ?? null,
    costBandLow: band?.low ?? null,
    costBandHigh: band?.high ?? null,
    costBandOpenEnded: band?.openEnded ?? false,
    costBandCurrency: band?.currency ?? null,
  };
  const changed = RECORD_FIELDS.filter((k) => (record[k] ?? null) !== (next[k] ?? null));

  await prisma.$transaction([
    prisma.yardPeriodRecord.update({
      where: { id: record.id },
      data: { ...next, updatedById: user.id },
    }),
    // The project's own name and yard follow the record: the period type,
    // and the yard only where the evidence actually names one.
    prisma.project.update({
      where: { id },
      data: { name: data.periodType, yardName: identifiedPlace(data.yardText ?? null) },
    }),
  ]);
  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "YardPeriodRecord",
    resourceId: record.id,
    details: { projectId: id, code: project.code, changed },
  });

  revalidatePath(`/projects/${id}`);
  revalidatePath(`/vessels/${project.vesselId}`);
  redirect(`/projects/${id}?saved=record`);
}

// ---------- Scope lines ----------

async function editableScope(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true },
  });
  if (!project) throw notFound("That project");
  return project;
}

export async function addScopeItemAction(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.PROJ_EDIT);
  const projectId = String(formData.get("projectId") ?? "");
  await editableScope(user.id, projectId);

  const values = {
    discipline: String(formData.get("discipline") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
  const parsed = ScopeItemSchema.safeParse(values);
  if (!parsed.success) {
    setFormFlash(`scope-${projectId}`, {
      error: parsed.error.errors[0].message,
      values,
    } satisfies YardPeriodFormFlash);
    redirect(`/projects/${projectId}/edit#scope`);
  }

  const last = await prisma.projectScopeItem.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });
  const item = await prisma.projectScopeItem.create({
    data: {
      projectId,
      ...parsed.data,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
      origin: "MANUAL",
      createdById: user.id,
    },
  });
  await recordAudit({
    actorId: user.id,
    action: "CREATE",
    resource: "ProjectScopeItem",
    resourceId: item.id,
    details: { projectId, ...parsed.data },
  });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/edit#scope`);
}

/** The scope line, checked to belong to a project the caller may edit. */
async function editableScopeItem(userId: string, itemId: string) {
  const item = await prisma.projectScopeItem.findUnique({ where: { id: itemId } });
  if (!item) throw notFound("That scope line");
  await editableScope(userId, item.projectId);
  return item;
}

/** File a scope line under another discipline. It keeps its place, and a re-import does not add it again. */
export async function reclassifyScopeItemAction(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.PROJ_EDIT);
  const item = await editableScopeItem(user.id, String(formData.get("itemId") ?? ""));
  const discipline = ScopeItemSchema.shape.discipline.safeParse(
    String(formData.get("discipline") ?? ""),
  );
  if (!discipline.success) throw invalid("Choose a discipline from the list.");
  if (discipline.data !== item.discipline) {
    await prisma.projectScopeItem.update({
      where: { id: item.id },
      data: { discipline: discipline.data },
    });
    await recordAudit({
      actorId: user.id,
      action: "UPDATE",
      resource: "ProjectScopeItem",
      resourceId: item.id,
      details: { projectId: item.projectId, from: item.discipline, to: discipline.data },
    });
  }
  revalidatePath(`/projects/${item.projectId}`);
  redirect(`/projects/${item.projectId}/edit#scope`);
}

/** Take a scope line off the record. Hidden, not deleted, so a re-import does not bring it back. */
export async function removeScopeItemAction(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.PROJ_EDIT);
  const item = await editableScopeItem(user.id, String(formData.get("itemId") ?? ""));
  if (!item.archivedAt) {
    await prisma.projectScopeItem.update({
      where: { id: item.id },
      data: { archivedAt: new Date() },
    });
    await recordAudit({
      actorId: user.id,
      action: "DELETE",
      resource: "ProjectScopeItem",
      resourceId: item.id,
      // Hidden rather than erased, so the audit trail and a re-import agree.
      details: { projectId: item.projectId, description: item.description, hidden: true },
    });
  }
  revalidatePath(`/projects/${item.projectId}`);
  redirect(`/projects/${item.projectId}/edit#scope`);
}
