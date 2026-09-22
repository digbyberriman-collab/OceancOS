"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { getActiveProject, listProjectsForUser, usersWithPermissionOnProject } from "@/lib/project";
import { groupCodeOf, isValidJobCode, nextCodeInGroup, normaliseJobCode } from "@/lib/jobs/codes";
import {
  JOB_TRANSITION_PERMISSION,
  JOB_TRANSITIONS_REQUIRING_CEREMONY,
  assertTransitionJob,
  expiryFrom,
  jobActionSide,
} from "@/lib/jobs/workflow";
import type { JobStatus } from "@/lib/enums";
import { CONTRACT_TYPES, PRICING_BASES } from "@/lib/enums";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { applyTransition } from "@/lib/workflow/transition";
import { setFormFlash } from "@/lib/formFlash";
import type { UploadedFile } from "@/components/ui/FileDrop";
import { toNumber } from "@/lib/utils";

/** Load a job and confirm the caller may reach its project. */
async function loadJob(userId: string, jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { project: true },
  });
  if (!job) throw notFound("That job");

  const projects = await listProjectsForUser(userId);
  if (!projects.some((p) => p.id === job.projectId)) {
    throw forbidden("That job belongs to a project you cannot reach.");
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

export type JobRequestFlash = {
  error: string;
  values: {
    clientRef: string;
    title: string;
    description: string;
    designatedAuthoriserId: string;
    sectionId: string;
    linkedChangeOrderId: string;
  };
  /** So FileDrop can re-hydrate rather than orphan what was already
   * uploaded to storage before this failure — ACTION_PLAN.md G3.6. */
  attachments: UploadedFile[];
};

/** The repeating hidden `attachments` field FileDrop posts, parsed back out. */
function parseAttachments(formData: FormData): UploadedFile[] {
  return formData
    .getAll("attachments")
    .map(String)
    .map((entry) => {
      try {
        return JSON.parse(entry) as UploadedFile;
      } catch {
        return null;
      }
    })
    .filter((f): f is UploadedFile => !!f && typeof f.key === "string");
}

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
  if (!project) throw invalid("Choose a project before creating a job.");

  const rawValues: JobRequestFlash["values"] = {
    clientRef: String(formData.get("clientRef") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    designatedAuthoriserId: String(formData.get("designatedAuthoriserId") ?? ""),
    sectionId: String(formData.get("sectionId") ?? ""),
    linkedChangeOrderId: String(formData.get("linkedChangeOrderId") ?? ""),
  };
  const back = (error: string): never => {
    setFormFlash("jobRequest", {
      error,
      values: rawValues,
      attachments: parseAttachments(formData),
    } satisfies JobRequestFlash);
    redirect("/jobs/new");
  };

  const parsed = RequestSchema.safeParse({
    clientRef: formData.get("clientRef") || null,
    title: formData.get("title"),
    description: formData.get("description"),
    designatedAuthoriserId: formData.get("designatedAuthoriserId"),
    sectionId: formData.get("sectionId") || null,
    linkedChangeOrderId: formData.get("linkedChangeOrderId") || null,
  });
  if (!parsed.success) back(parsed.error.errors[0].message);
  const data = parsed.data!;

  // The authoriser must actually hold the accept permission, or the quote
  // would arrive addressed to someone who cannot sign it.
  const authoriser = await prisma.user.findUnique({
    where: { id: data.designatedAuthoriserId },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  const canAccept = authoriser?.roles.some((r) =>
    r.role.permissions.some((p) => p.permission.key === PERMISSIONS.JOB_ACCEPT)
  );
  if (!authoriser || !canAccept) back("That person cannot authorise quotes.");

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

  // The yard needs to know there is something to price — only the yard on
  // this project, not every yard PM on the platform (AUDIT_REPORT.md's
  // [NOTIFICATIONS] — recipient lookups were global).
  const yardUserIds = await usersWithPermissionOnProject(project, PERMISSIONS.JOB_ISSUE_QUOTE);
  await notify({
    userIds: yardUserIds,
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

export type IssueQuoteFlash = {
  error: string;
  values: {
    code: string;
    contractType: string;
    pricingBasis: string;
    validityDays: string;
    exceptionFlag: boolean;
    exclusions: string;
    notes: string;
    lines: { description: string; quantity: string; unit: string; unitPrice: string }[];
  };
};

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

  // Lines arrive as parallel arrays from the repeating fieldset. Read once,
  // up front, so both `back()` (preserving exactly what was on screen,
  // blank rows included) and the parsing below work from the same values.
  const descriptions = formData.getAll("lineDescription").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const units = formData.getAll("lineUnit").map(String);
  const prices = formData.getAll("lineUnitPrice").map(String);

  const back = (error: string): never => {
    setFormFlash(`quote-${jobId}`, {
      error,
      values: {
        code: String(formData.get("code") ?? ""),
        contractType: String(formData.get("contractType") ?? ""),
        pricingBasis: String(formData.get("pricingBasis") ?? ""),
        validityDays: String(formData.get("validityDays") ?? ""),
        exceptionFlag: formData.get("exceptionFlag") === "on",
        exclusions: String(formData.get("exclusions") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        lines: descriptions.map((description, i) => ({
          description,
          quantity: quantities[i] ?? "",
          unit: units[i] ?? "",
          unitPrice: prices[i] ?? "",
        })),
      },
    } satisfies IssueQuoteFlash);
    redirect(`/jobs/${jobId}/quote`);
  };

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

  // `row` carries the 1-based position the yard actually sees (Line 1…6)
  // through the filter, rather than being assigned after it — the previous
  // version numbered the *filtered* list, so a bad line past any blank rows
  // cited a number matching nothing on screen (forms-validation's
  // "Quote line errors cite the wrong row number").
  const lines = descriptions
    .map((description, i) => ({
      row: i + 1,
      description: description.trim(),
      quantity: quantities[i],
      unit: units[i] || "UN",
      unitPrice: prices[i],
    }))
    .filter((line) => line.description.length > 0)
    .map((line) => {
      const parsed = LineSchema.safeParse(line);
      if (!parsed.success) back(`Line ${line.row} is incomplete.`);
      const value = parsed.data!;
      return {
        sort: line.row - 1,
        description: value.description,
        quantity: value.quantity,
        unit: value.unit,
        unitPrice: value.unitPrice,
        // Held rather than derived on read, so an accepted quote keeps the
        // figure it was accepted at. Computed with Prisma.Decimal, not `*`
        // and `Math.round`, per ACTION_PLAN.md G3.2 — the previous version
        // rounded each line's product but summed the rounded floats, so the
        // stored job total could disagree with the sum of its own lines.
        total: new Prisma.Decimal(value.quantity).times(value.unitPrice).toDecimalPlaces(2),
      };
    });

  if (!lines.length) back("A quote needs at least one line.");

  const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
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

  // A revision (QUOTE_SENT/EXPIRED → QUOTE_SENT, ACTION_PLAN.md G3.9)
  // deletes and recreates every line and note below, same as a first
  // issue — so the superseded figures are snapshotted onto the history
  // row first. Read outside the transaction: this is a nice-to-have audit
  // trail, not a value the transition's own correctness depends on.
  const isRevision = job.status !== "NEW_REQUEST";
  const superseded = isRevision
    ? {
        code: job.code,
        total: toNumber(job.total),
        validityDays: job.validityDays,
        lines: (await prisma.jobLine.findMany({ where: { jobId }, orderBy: { sort: "asc" } })).map((l) => ({
          description: l.description,
          quantity: toNumber(l.quantity),
          unit: l.unit,
          unitPrice: toNumber(l.unitPrice),
        })),
      }
    : null;

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
        event: isRevision ? "REVISED" : "QUOTED",
        fromStatus: job.status,
        toStatus: "QUOTE_SENT",
        details: { total: total.toNumber(), validityDays, ...(superseded ? { superseded } : {}) },
      },
    }),
    prisma.comment.create({
      data: {
        authorId: user.id,
        resource: "Job",
        resourceId: jobId,
        jobId,
        kind: "SYSTEM",
        body: `${isRevision ? "Quote revised" : "Quote delivered"}: ${total.toFixed(2)} ${job.currency}${
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
    details: { event: isRevision ? "REVISED" : "QUOTED", code, total, validityDays },
  });

  if (job.designatedAuthoriserId) {
    await notify({
      userIds: [job.designatedAuthoriserId],
      kind: "APPROVAL_REQUIRED",
      priority: "HIGH",
      title: `${isRevision ? "Revised quote" : "Quote"} ready to authorise: ${code} — ${job.title}`,
      resource: "Job",
      resourceId: jobId,
    });
  }

  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}

/**
 * A plain status move.
 *
 * Acceptance is never done here, whatever `to` is posted: it runs through
 * the confirmation-code ceremony in jobs/[id]/accept/actions.ts, which this
 * refuses to shortcut — see JOB_TRANSITIONS_REQUIRING_CEREMONY. Fixed as
 * AUDIT_REPORT.md's Critical C2.
 */
export async function transitionJob(formData: FormData) {
  const user = await requireUser();
  const jobId = String(formData.get("jobId") ?? "");
  const to = String(formData.get("to") ?? "") as JobStatus;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (JOB_TRANSITIONS_REQUIRING_CEREMONY.includes(to)) {
    throw forbidden("Accepting a quote goes through the confirmation code, not this action.");
  }

  const job = await loadJob(user.id, jobId);

  assertPermission(user, JOB_TRANSITION_PERMISSION[to]);
  assertTransitionJob(job.status as JobStatus, to);

  // progressPct is the input to the project's headline work-progress figure
  // (lib/metrics/project.ts) — YARD_COMPLETED used to force it to 100
  // regardless of what had actually been reported, and WORKS_ACCEPTED
  // carried no check at all, so a job could read "works accepted" at 0%
  // (ACTION_PLAN.md G3.9). Both now require the figure to already be there.
  if ((to === "YARD_COMPLETED" || to === "WORKS_ACCEPTED") && job.progressPct !== 100) {
    throw invalid("Report 100% progress before completing this job.");
  }

  const now = new Date();
  const extra: Record<string, unknown> = { updatedById: user.id };

  if (to === "ACCEPTED") {
    extra.yardAcceptedAt = now;
    extra.yardAcceptedById = user.id;
  }
  if (to === "YARD_COMPLETED") {
    extra.yardCompletedAt = now;
  }
  if (to === "WORKS_ACCEPTED") {
    extra.worksAcceptedAt = now;
    extra.warrantyMonths = job.warrantyMonths ?? 12;
  }
  if (to === "CANCELLED_QUOTE" || to === "CANCELLED_WORKS") {
    extra.cancelledAt = now;
    extra.cancelReason = reason;
  }

  // The write is conditional on the status this function read (see
  // applyTransition) and, wrapped in an interactive transaction, rolls the
  // history row and the system comment back with it if someone else moved
  // this job first.
  await prisma.$transaction(async (tx) => {
    await applyTransition(tx.job, { id: jobId, from: job.status, to, data: extra });
    await tx.jobHistory.create({
      data: {
        jobId,
        actorId: user.id,
        event: to,
        fromStatus: job.status,
        toStatus: to,
        details: reason ? { reason } : undefined,
      },
    });
    await tx.comment.create({
      data: {
        authorId: user.id,
        resource: "Job",
        resourceId: jobId,
        jobId,
        kind: "SYSTEM",
        body: systemMessage(to, reason),
      },
    });
  });

  await recordAudit({
    actorId: user.id,
    action: "STATUS",
    resource: "Job",
    resourceId: jobId,
    details: { from: job.status, to, reason },
  });

  // The audience is whichever side did *not* just act — a `side: "client"`
  // action (a deficiency, a cancellation, works acceptance) is client-raised
  // and the yard needs to hear about it, not the two vessel-side fields this
  // used to notify regardless of direction (ACTION_PLAN.md G3.9): before
  // this, the yard was never told about a reported deficiency or that works
  // had been accepted and its warranty clock had started.
  if (jobActionSide(to) === "yard") {
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
  } else {
    const yardUserIds = (await usersWithPermissionOnProject(job.project, PERMISSIONS.JOB_ISSUE_QUOTE)).filter(
      (id) => id !== user.id
    );
    if (yardUserIds.length) {
      await notify({
        userIds: yardUserIds,
        kind: "STATUS_CHANGE",
        title: `${job.code} — ${systemMessage(to, null)}`,
        resource: "Job",
        resourceId: jobId,
      });
    }
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

  // progressPct feeds the project's headline work-progress figure
  // (lib/metrics/project.ts) — the control was already hidden outside
  // ACCEPTED/MINOR_DEFICIENCY, but the action itself wrote unconditionally,
  // so a trade lead (who holds JOB_PROGRESS and nothing else job-workflow)
  // could move the figure on a job that was cancelled, unpriced, or already
  // closed out, just by posting the form directly (ACTION_PLAN.md G3.9).
  if (job.status !== "ACCEPTED" && job.status !== "MINOR_DEFICIENCY") {
    throw invalid("Progress can only be reported while a job is accepted or has an open deficiency.");
  }

  const raw = Number(formData.get("progressPct") ?? 0);
  const progressPct = Math.min(100, Math.max(0, Math.round(raw)));

  // One logical change, so one transaction (ACTION_PLAN.md G3.4) — a
  // failure between the two writes used to leave progressPct changed with
  // no history row explaining it, and progressPct drives the value-weighted
  // group progress on the jobs list (lib/jobs/views.ts).
  await prisma.$transaction([
    prisma.job.update({ where: { id: jobId }, data: { progressPct, updatedById: user.id } }),
    prisma.jobHistory.create({
      data: {
        jobId,
        actorId: user.id,
        event: "PROGRESS",
        details: { from: job.progressPct, to: progressPct },
      },
    }),
  ]);
  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Job",
    resourceId: jobId,
    details: { progressPct },
  });

  // Nobody on the vessel side was told a progress change happened at all.
  if (progressPct !== job.progressPct) {
    const watchers = [job.createdById, job.designatedAuthoriserId].filter(
      (id): id is string => !!id && id !== user.id
    );
    if (watchers.length) {
      await notify({
        userIds: Array.from(new Set(watchers)),
        kind: "STATUS_CHANGE",
        title: `${job.code} — progress now ${progressPct}%`,
        resource: "Job",
        resourceId: jobId,
      });
    }
  }

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

  // Checked before the DB round trips below, not after (ACTION_PLAN.md
  // G3.6, forms-validation's [VALIDATION-MESSAGES]) — a `required` textarea
  // is satisfied by a single space, which used to trim to "" and silently
  // no-op: no error, no revalidate, the textarea still showing what was
  // typed with no way to tell whether it posted.
  if (!body) throw invalid("Write something before posting.");

  await loadJob(user.id, jobId);

  if (asMinute) assertPermission(user, PERMISSIONS.MINUTES_RECORD);

  // One transaction (ACTION_PLAN.md G3.4) — a failure between the two
  // writes used to post a comment whose attachments never landed: the
  // files exist in storage but are referenced by nothing.
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        authorId: user.id,
        resource: "Job",
        resourceId: jobId,
        jobId,
        kind: asMinute ? "MINUTE" : "MESSAGE",
        body,
      },
    });
    await attachUploads(formData, jobId, user.id, "Job", created.id, tx);
    return created;
  });

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

  // A single deleteMany, not read-then-delete-or-create (ACTION_PLAN.md
  // G3.4) — two rapid clicks used to both read null and both create,
  // the second violating the composite primary key with an unhandled
  // crash. deleteMany's count tells us whether there was one to remove, in
  // the same statement, so unfavouriting is idempotent under a double click.
  // Favouriting still has a narrow window between two concurrent deleteMany
  // calls that both see count 0 and both attempt create; rather than close
  // it with more machinery for a "star this job" button, the resulting
  // P2002 is caught and treated as the no-op it actually is — the desired
  // end state (favourited) was already reached by the other request.
  const removed = await prisma.jobFavourite.deleteMany({ where: { userId: user.id, jobId } });
  if (removed.count === 0) {
    try {
      await prisma.jobFavourite.create({ data: { userId: user.id, jobId } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
}

/**
 * Record uploads that the browser already sent to storage.
 *
 * FileDrop posts one hidden field per completed upload, so the server stores
 * metadata rather than bytes. Takes a client so a caller that also writes
 * the parent row (addJobComment) can pass a transaction's `tx` and get one
 * atomic write instead of two — ACTION_PLAN.md G3.4. Defaults to the
 * top-level client for callers with nothing else to wrap it with.
 */
async function attachUploads(
  formData: FormData,
  resourceId: string,
  uploaderId: string,
  resource: string,
  commentId?: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
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

  await client.attachment.createMany({
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
