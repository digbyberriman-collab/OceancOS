"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertPermission, PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { listProjectsForUser, usersWithPermissionOnProject } from "@/lib/project";
import { assertTransitionJob } from "@/lib/jobs/workflow";
import type { JobStatus } from "@/lib/enums";
import { forbidden, notFound } from "@/lib/errors";
import { toNumber } from "@/lib/utils";
import {
  MAX_CHALLENGE_ATTEMPTS,
  acceptanceEmail,
  challengeExpiry,
  challengeProblem,
  challengeProblemMessage,
  generateAcceptanceCode,
  hashAcceptanceCode,
  quoteFingerprint,
  verifyAcceptanceCode,
} from "@/lib/jobs/acceptance";

async function loadJobForAccept(userId: string, jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { project: true, lines: { orderBy: { sort: "asc" } } },
  });
  if (!job) throw notFound("That job");

  const projects = await listProjectsForUser(userId);
  if (!projects.some((p) => p.id === job.projectId)) {
    throw forbidden("That job belongs to a project you cannot reach.");
  }
  return job;
}

/**
 * Step two: send the confirmation code.
 *
 * The gate on the linked change order is checked here rather than at the final
 * step, so the authoriser is told before a code is sent rather than after.
 */
export async function requestAcceptanceCode(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.JOB_ACCEPT);

  const jobId = String(formData.get("jobId") ?? "");
  const job = await loadJobForAccept(user.id, jobId);

  const back = (message: string) =>
    redirect(`/jobs/${jobId}/accept?err=${encodeURIComponent(message)}`);

  if (!["QUOTE_SENT", "EXPIRED"].includes(job.status)) {
    back("This quote is no longer awaiting a decision.");
  }

  // Governance gate: where a change order authorised the work, it must have
  // cleared its own approval chain first. This is what The Bridge cannot do.
  if (job.linkedChangeOrderId) {
    const co = await prisma.changeOrder.findUnique({
      where: { id: job.linkedChangeOrderId },
      select: { number: true, status: true },
    });
    if (co && !["APPROVED", "IN_PROGRESS", "COMPLETED", "CLOSED"].includes(co.status)) {
      back(
        `Change order ${co.number} is still ${co.status
          .replace(/_/g, " ")
          .toLowerCase()}. It must be approved before this quote can be accepted.`
      );
    }
  }

  // Supersede any code still outstanding, so only the newest one works.
  await prisma.acceptanceChallenge.updateMany({
    where: { jobId, userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  // The id is generated here, not by Prisma's default, so the hash — which
  // binds to it — can be computed up front and the row inserted complete in
  // one statement (ACTION_PLAN.md G3.4). The previous create-then-update
  // left a row with codeHash: "" between the two statements; a failure
  // there emailed nothing but still redirected the user to a challenge
  // asking for a code that was never sent.
  const code = generateAcceptanceCode();
  const challengeId = randomUUID();
  const challenge = await prisma.acceptanceChallenge.create({
    data: {
      id: challengeId,
      jobId,
      userId: user.id,
      codeHash: hashAcceptanceCode(challengeId, code),
      quoteHash: quoteFingerprint(job),
      expiresAt: challengeExpiry(),
    },
  });

  const { subject, text } = acceptanceEmail({
    name: user.name,
    code,
    jobCode: job.code,
    jobTitle: job.title,
    amount: new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: job.currency || job.project.currency,
      maximumFractionDigits: 0,
    }).format(toNumber(job.total)),
  });
  await sendEmail({ to: user.email, subject, text });

  await recordAudit({
    actorId: user.id,
    action: "UPDATE",
    resource: "Job",
    resourceId: jobId,
    details: { event: "ACCEPTANCE_CODE_SENT", challengeId: challenge.id, channel: "EMAIL" },
  });

  redirect(`/jobs/${jobId}/accept?challenge=${challenge.id}`);
}

/** Step three: verify the code and sign. */
export async function confirmAcceptance(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.JOB_ACCEPT);

  const jobId = String(formData.get("jobId") ?? "");
  const challengeId = String(formData.get("challengeId") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  const job = await loadJobForAccept(user.id, jobId);
  const back = (message: string) =>
    redirect(`/jobs/${jobId}/accept?challenge=${challengeId}&err=${encodeURIComponent(message)}`);

  const challenge = await prisma.acceptanceChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge || challenge.jobId !== jobId || challenge.userId !== user.id) {
    back("That confirmation does not belong to you.");
  }

  const problem = challengeProblem(challenge);
  if (problem) back(challengeProblemMessage(problem));

  if (!verifyAcceptanceCode(challengeId, code, challenge!.codeHash)) {
    // Incremented atomically at the database, not read-then-write in JS
    // (ACTION_PLAN.md G3.3, AUDIT_REPORT.md T5) — two wrong codes submitted
    // at once must not both read the same starting count and each land
    // "attempt 3 of 5", letting the five-attempt lockout be outrun by
    // concurrency.
    const updated = await prisma.acceptanceChallenge.update({
      where: { id: challengeId },
      data: { attempts: { increment: 1 } },
    });
    const attempts = updated.attempts;
    await recordAudit({
      actorId: user.id,
      action: "REJECT",
      resource: "Job",
      resourceId: jobId,
      details: { event: "ACCEPTANCE_CODE_INCORRECT", attempts },
    });
    const left = MAX_CHALLENGE_ATTEMPTS - attempts;
    back(
      left > 0
        ? `That code is not right. ${left} ${left === 1 ? "attempt" : "attempts"} left.`
        : "Too many incorrect codes. Start again from the quote to get a new one."
    );
  }

  // The quote must not have changed since the code was sent.
  if (quoteFingerprint(job) !== challenge!.quoteHash) {
    await prisma.acceptanceChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    });
    back("This quote changed while you were confirming. Review it again before accepting.");
  }

  assertTransitionJob(job.status as JobStatus, "CLIENT_ACCEPTED");

  const now = new Date();
  const requestHeaders = headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip") ??
    null;

  await prisma.$transaction([
    prisma.acceptanceChallenge.update({ where: { id: challengeId }, data: { consumedAt: now } }),
    prisma.job.update({
      where: { id: jobId },
      data: {
        status: "CLIENT_ACCEPTED",
        clientAcceptedAt: now,
        clientAcceptedById: user.id,
        updatedById: user.id,
      },
    }),
    prisma.jobHistory.create({
      data: {
        jobId,
        actorId: user.id,
        event: "CLIENT_ACCEPTED",
        fromStatus: job.status,
        toStatus: "CLIENT_ACCEPTED",
        details: { quoteHash: challenge!.quoteHash, total: toNumber(job.total), channel: challenge!.channel },
      },
    }),
    prisma.comment.create({
      data: {
        authorId: user.id,
        resource: "Job",
        resourceId: jobId,
        jobId,
        kind: "SYSTEM",
        body: `Client action — accepted quote for ${job.total.toFixed(2)} ${job.currency}.`,
      },
    }),
  ]);

  // A signature on money: record who, from where, on which version.
  await recordAudit({
    actorId: user.id,
    action: "APPROVE",
    resource: "Job",
    resourceId: jobId,
    details: {
      event: "CLIENT_ACCEPTED",
      total: toNumber(job.total),
      currency: job.currency,
      quoteHash: challenge!.quoteHash,
      challengeId,
      channel: challenge!.channel,
      ip,
      userAgent: requestHeaders.get("user-agent"),
      wasExpired: job.status === "EXPIRED",
    },
  });

  // Only the yard on this project — see the note in jobs/actions.ts.
  const yardUserIds = await usersWithPermissionOnProject(job.project, PERMISSIONS.JOB_COUNTERSIGN);
  await notify({
    userIds: yardUserIds,
    kind: "APPROVAL_REQUIRED",
    priority: "HIGH",
    title: `${job.code} accepted by the client — ready to countersign`,
    resource: "Job",
    resourceId: jobId,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}?accepted=1`);
}

/** Decline the quote outright. */
export async function rejectQuote(formData: FormData) {
  const user = await requireUser();
  assertPermission(user, PERMISSIONS.JOB_CANCEL);

  const jobId = String(formData.get("jobId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const job = await loadJobForAccept(user.id, jobId);

  assertTransitionJob(job.status as JobStatus, "CANCELLED_QUOTE");

  await prisma.$transaction([
    prisma.job.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED_QUOTE",
        cancelledAt: new Date(),
        cancelReason: reason,
        updatedById: user.id,
      },
    }),
    prisma.jobHistory.create({
      data: {
        jobId,
        actorId: user.id,
        event: "CANCELLED_QUOTE",
        fromStatus: job.status,
        toStatus: "CANCELLED_QUOTE",
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
        body: reason ? `Quote rejected. ${reason}` : "Quote rejected.",
      },
    }),
  ]);

  await recordAudit({
    actorId: user.id,
    action: "REJECT",
    resource: "Job",
    resourceId: jobId,
    details: { event: "QUOTE_REJECTED", reason },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  redirect(`/jobs/${jobId}`);
}
