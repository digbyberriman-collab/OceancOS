"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, hasPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { getActiveProject, listProjectsForUser } from "@/lib/project";
import { groupCodeOf, isValidJobCode, nextCodeInGroup, normaliseJobCode } from "@/lib/jobs/codes";
import {
  JOB_TRANSITION_PERMISSION,
  assertTransitionJob,
  expiryFrom,
} from "@/lib/jobs/workflow";
import type { JobStatus } from "@/lib/enums";
import { CONTRACT_TYPES, PRICING_BASES } from "@/lib/enums";

/** Load a job and confirm the caller may reach its project. */
async function loadJob(userId: string, jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { project: true },
  });
  if (!job) throw new Error("Job not found");

  const projects = await listProjectsForUser(userId);
  if (!projects.some((p) => p.id === job.projectId)) {
    throw new Error("Forbidden: no access to that project");
  }
  return job;
}

const RequestSchema = z.object({
  clientRef: z.string().max(64).optional().nullable(),
  title: z.string().min(3).max(200),
  description: z.string().min(10, "Describe the work in enough detail for the yard to price it."),
  designatedAuthoriserId: z.string().min(1, "Choose who may authorise this quote."),
  sectionId: z.string().optional().nullable(),
  linkedChangeOrderId: z.string().optional().nullable(),
});

/**
 * Raise a request with the yard.
 *
 * The vessel does not set a price or a code group's number — the yard does when
 * it prices the work — so the request carries only what the yard needs to quote.
 */
export async function createJobRequest(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.JOB_REQUEST);

  const project = await getActiveProject(user.id);
  if (!project) throw new Error("No active project");

  const parsed = RequestSchema.safeParse({
    clientRef: formData.get("clientRef") || null,
    title: formData.get("title"),
    description: formData.get("description"),
    designatedAuthoriserId: formData.get("designatedAuthoriserId"),
    sectionId: formData.get("sectionId") || null,
    linkedChangeOrderId: formData.get("linkedChangeOrderId") || null,
  });
  if (!parsed.success) {
    redirect(`/jobs/new?err=${encodeURIComponent(parsed.error.errors[0].message)}`);
  }
  const data = parsed.data;

  // The authoriser must actually hold the accept permission, or the quote
  // would arrive addressed to someone who cannot sign it.
  const authoriser = await prisma.user.findUnique({
    where: { id: data.designatedAuthoriserId },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  const canAccept = authoriser?.roles.some((r) =>
    r.role.permissions.some((p) => p.permission.key === PERMISSIONS.JOB_ACCEPT)
  );
  if (!authoriser || !canAccept) {
    redirect(`/jobs/new?err=${encodeURIComponent("That person cannot authorise quotes.")}`);
  }

  // A request has no yard code yet, so it takes a placeholder in the section's
  // request group, which the yard replaces when it issues the quote.
  const section = data.sectionId
    ? await prisma.jobSection.findUnique({ where: { id: data.sectionId } })
    : null;
  const letter = section?.letter ?? "R";
  const groupCode = `${letter}.0000`;
  const siblings = await prisma.job.findMany({
    where: { projectId: project.id, groupCode },
    select: { code: true },
  });
  const code = nextCodeInGroup(groupCode, siblings.map((s) => s.code));

  const job = await prisma.job.create({
    data: {
      projectId: project.id,
      sectionId: section?.id ?? null,
      code,
      groupCode,
      clientRef: data.clientRef,
      title: data.title,
      description: data.description,
      status: "NEW_REQUEST",
      currency: project.currency,
      requestedAt: new Date(),
      designatedAuthoriserId: data.designatedAuthoriserId,
      linkedChangeOrderId: data.linkedChangeOrderId,
      createdById: user.id,
      updatedById: user.id,
      history: { create: { actorId: user.id, event: "CREATED", toStatus: "NEW_REQUEST" } },
    },
  });

  await attachUploads(formData, job.id, user.id, "Job");

  await recordAudit({
    actorId: user.id,
    action: "CREATE",
    resource: "Job",
    resourceId: job.id,
    details: { code, title: data.title, projectId: project.id },
  });

  // The yard needs to know there is something to price.
  const yardUsers = await prisma.user.findMany({
    where: {
      active: true,
      roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.JOB_ISSUE_QUOTE } } } } } },
    },
    select: { id: true },
  });
  await notify({
    userIds: yardUsers.map((u) => u.id),
    kind: "ASSIGNED",
    priority: "MEDIUM",
    title: `New quote request ${code}: ${data.title}`,
    resource: "Job",
    resourceId: job.id,
  });

  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

const LineSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
  unit: z.string().min(1).max(12),
  unitPrice: z.coerce.number(),
});

/**
 * Price a request and send the quote.
 *
 * The yard sets the real job code here, because until the work is scoped it
 * does not belong to a group.
 */
export async function issueQuote(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.JOB_ISSUE_QUOTE);

  const jobId = String(formData.get("jobId") ?? "");
  const job = await loadJob(user.id, jobId);

  const back = (message: string) =>
    redirect(`/jobs/${jobId}/quote?err=${encodeURIComponent(message)}`);

  const code = normaliseJobCode(String(formData.get("code") ?? ""));
  if (!isValidJobCode(code)) {
    back("That job code is not in the yard's format, for example D.0130.05.");
  }
  if (code !== job.code) {
    const clash = await prisma.job.findUnique({
      where: { projectId_code: { projectId: job.projectId, code } },
    });
    if (clash) back(`Code ${code} is already used on this project.`);
  }

  const contractType = String(formData.get("contractType") ?? "");
  const pricingBasis = String(formData.get("pricingBasis") ?? "");
  if (!CONTRACT_TYPES.includes(contractType as never)) back("Choose a contract type.");
  if (!PRICING_BASES.includes(pricingBasis as never)) back("Choose a pricing basis.");

  const validityDays = Number(formData.get("validityDays") ?? 0) || null;

  // Lines arrive as parallel arrays from the repeating fieldset.
  const descriptions = formData.getAll("lineDescription").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const units = formData.getAll("lineUnit").map(String);
  const prices = formData.getAll("lineUnitPrice").map(String);

  const lines = descriptions
    .map((description, i) => ({
      description: description.trim(),
      quantity: quantities[i],
      unit: units[i] || "UN",
      unitPrice: prices[i],
    }))
    .filter((line) => line.description.length > 0)
    .map((line, sort) => {
      const parsed = LineSchema.safeParse(line);
      if (!parsed.success) back(`Line ${sort + 1} is incomplete.`);
      const value = parsed.success ? parsed.data : null!;
      return {
        sort,
        description: value.description,
        quantity: value.quantity,
        unit: value.unit,
        unitPrice: value.unitPrice,
        // Held rather than derived on read, so an accepted quote keeps the
        // figure it was accepted at.
        total: Math.round(value.quantity * value.unitPrice * 100) / 100,
      };
    });

  if (!lines.length) back("A quote needs at least one line.");

  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const now = new Date();
  const expiresAt = expiryFrom(now, validityDays);

  const exclusions = String(formData.get("exclusions") ?? "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  const notes = String(formData.get("notes") ?? "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  assertTransitionJob(job.status as JobStatus, "QUOTE_SENT");

  await prisma.$transaction([
    prisma.jobLine.deleteMany({ where: { jobId } }),
    prisma.jobNote.deleteMany({ where: { jobId } }),
    prisma.job.update({
      where: { id: jobId },
      data: {
        code,
        groupCode: groupCodeOf(code),
        contractType,
        pricingBasis,
        exceptionFlag: formData.get("exceptionFlag") === "on",
        status: "QUOTE_SENT",
        total,
        validityDays,
        quoteDeliveredAt: now,
        expiresAt,
        updatedById: user.id,
        lines: { create: lines },
        notes: {
          create: [
            ...exclusions.map((text, sort) => ({ kind: "EXCLUSION", sort, text })),
            ...notes.map((text, sort) => ({ kind: "NOTE", sort, text })),
          ],
        },
      },
    }),
    prisma.jobHistory.create({
      data: {
        jobId,
        actorId: user.id,
        event: "QUOTED",
        fromStatus: job.status,
        toStatus: "QUOTE_SENT",
        details: { total, validityDays },
      },
    }),
    prisma.comment.create({
      data: {
        authorId: user.id,
        resource: "Job",
        resourceId: jobId,
        jobId,
        kind: "SYSTEM",
        body: `Quote delivered: ${total.toFixed(2)} ${job.currency}${
          validityDays ? `, valid ${validityDays} days` : ""
        }.`,
      },
    }),
  ]);

  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Job",
    resourceId: jobId,
    details: { event: "QUOTED", code, total, validityDays },
  });

  if (job.designatedAuthoriserId) {
    await notify({
      userIds: [job.designatedAuthoriserId],
      kind: "APPROVAL_REQUIRED",
      priority: "HIGH",
      title: `Quote ready to authorise: ${code} — ${job.title}`,
      resource: "Job",
      resourceId: jobId,
    });
  }

  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

/** A plain status move. Accepting is not done here: it runs through Phase 2. */
export async function transitionJob(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  const to = String(formData.get("to") ?? "") as JobStatus;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const job = await loadJob(user.id, jobId);

  assertPermission(user, JOB_TRANSITION_PERMISSION[to]);
  assertTransitionJob(job.status as JobStatus, to);

  const now = new Date();
  const extra: Record<string, unknown> = { status: to, updatedById: user.id };

  if (to === "ACCEPTED") {
    extra.yardAcceptedAt = now;
    extra.yardAcceptedById = user.id;
  }
  if (to === "YARD_COMPLETED") {
    extra.yardCompletedAt = now;
    extra.progressPct = 100;
  }
  if (to === "WORKS_ACCEPTED") {
    extra.worksAcceptedAt = now;
    extra.warrantyMonths = job.warrantyMonths ?? 12;
  }
  if (to === "CANCELLED_QUOTE" || to === "CANCELLED_WORKS") {
    extra.cancelledAt = now;
    extra.cancelReason = reason;
  }

  await prisma.$transaction([
    prisma.job.update({ where: { id: jobId }, data: extra }),
    prisma.jobHistory.create({
      data: {
        jobId,
        actorId: user.id,
        event: to,
        fromStatus: job.status,
        toStatus: to,
        details: reason ? { reason } : undefined,
      },
    }),
    prisma.comment.create({
      data: {
        authorId: user.id,
        resource: "Job",
        resourceId: jobId,
        jobId,
        kind: "SYSTEM",
        body: systemMessage(to, reason),
      },
    }),
  ]);

  await recordAudit({
    actorId: user.id,
    action: "STATUS",
    resource: "Job",
    resourceId: jobId,
    details: { from: job.status, to, reason },
  });

  const watchers = [job.createdById, job.designatedAuthoriserId].filter(
    (id): id is string => !!id && id !== user.id
  );
  if (watchers.length) {
    await notify({
      userIds: Array.from(new Set(watchers)),
      kind: "STATUS_CHANGE",
      title: `${job.code} — ${systemMessage(to, null)}`,
      resource: "Job",
      resourceId: jobId,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

function systemMessage(to: JobStatus, reason: string | null): string {
  const base: Record<string, string> = {
    QUOTE_SENT: "Quote delivered.",
    CLIENT_ACCEPTED: "Client accepted the quote.",
    ACCEPTED: "Yard countersigned. Works authorised.",
    YARD_COMPLETED: "Yard reported the works complete.",
    WORKS_ACCEPTED: "Works accepted by the client. Warranty starts now.",
    MINOR_DEFICIENCY: "Client reported a minor deficiency.",
    CANCELLED_QUOTE: "Quote cancelled.",
    CANCELLED_WORKS: "Works cancelled.",
    CLOSED: "Job closed.",
    EXPIRED: "Quote validity lapsed.",
    NEW_REQUEST: "Request reopened.",
  };
  const message = base[to] ?? `Status changed to ${to}.`;
  return reason ? `${message} ${reason}` : message;
}

/** Yard-reported completion. */
export async function setJobProgress(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.JOB_PROGRESS);

  const jobId = String(formData.get("jobId") ?? "");
  const job = await loadJob(user.id, jobId);

  const raw = Number(formData.get("progressPct") ?? 0);
  const progressPct = Math.min(100, Math.max(0, Math.round(raw)));

  await prisma.job.update({ where: { id: jobId }, data: { progressPct, updatedById: user.id } });
  await prisma.jobHistory.create({
    data: {
      jobId,
      actorId: user.id,
      event: "PROGRESS",
      details: { from: job.progressPct, to: progressPct },
    },
  });
  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Job",
    resourceId: jobId,
    details: { progressPct },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

/** Post a message or a minute on the job thread. */
export async function addJobComment(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.JOB_COMMENT);

  const jobId = String(formData.get("jobId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const asMinute = formData.get("kind") === "MINUTE";

  await loadJob(user.id, jobId);
  if (!body) return;

  if (asMinute) assertPermission(user, PERMISSIONS.MINUTES_RECORD);

  const comment = await prisma.comment.create({
    data: {
      authorId: user.id,
      resource: "Job",
      resourceId: jobId,
      jobId,
      kind: asMinute ? "MINUTE" : "MESSAGE",
      body,
    },
  });

  await attachUploads(formData, jobId, user.id, "Job", comment.id);

  await recordAudit({
    actorId: user.id,
    action: "COMMENT",
    resource: "Job",
    resourceId: jobId,
    details: { kind: asMinute ? "MINUTE" : "MESSAGE" },
  });

  revalidatePath(`/jobs/${jobId}`);
}

/** Star a job for this user only. */
export async function toggleJobFavourite(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  await loadJob(user.id, jobId);

  const existing = await prisma.jobFavourite.findUnique({
    where: { userId_jobId: { userId: user.id, jobId } },
  });

  if (existing) {
    await prisma.jobFavourite.delete({ where: { userId_jobId: { userId: user.id, jobId } } });
  } else {
    await prisma.jobFavourite.create({ data: { userId: user.id, jobId } });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

/**
 * Record uploads that the browser already sent to storage.
 *
 * FileDrop posts one hidden field per completed upload, so the server stores
 * metadata rather than bytes.
 */
async function attachUploads(
  formData: FormData,
  resourceId: string,
  uploaderId: string,
  resource: string,
  commentId?: string
) {
  const entries = formData.getAll("attachments").map(String).filter(Boolean);
  if (!entries.length) return;

  const rows = entries
    .map((entry) => {
      try {
        return JSON.parse(entry) as {
          key: string;
          filename: string;
          contentType: string;
          size: number;
        };
      } catch {
        return null;
      }
    })
    .filter((row): row is NonNullable<typeof row> => !!row && typeof row.key === "string");

  if (!rows.length) return;

  await prisma.attachment.createMany({
    data: rows.map((row) => ({
      uploaderId,
      filename: row.filename,
      mimetype: row.contentType,
      size: row.size,
      storageKey: row.key,
      resource,
      resourceId,
      jobId: resource === "Job" ? resourceId : null,
      commentId: commentId ?? null,
    })),
  });
}
