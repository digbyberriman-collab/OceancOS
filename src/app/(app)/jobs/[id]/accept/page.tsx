import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft, Clock, Mail, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { listProjectsForUser } from "@/lib/project";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Field, Input } from "@/components/ui/Form";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { fmtDate, fmtMoney, toNumber } from "@/lib/utils";
import { isExpired } from "@/lib/jobs/workflow";
import { CHALLENGE_TTL_MINUTES, challengeProblem } from "@/lib/jobs/acceptance";
import { confirmAcceptance, rejectQuote, requestAcceptanceCode } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Accepting a quote, in the three steps The Bridge uses: review what is being
 * signed, confirm, then enter the code sent to the registered address.
 */
export default async function AcceptQuote({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { challenge?: string; err?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.JOB_ACCEPT)) {
    return (
      <EmptyState
        title="Not an authoriser"
        hint="Only a designated authoriser can accept a quote. Ask your project manager."
      />
    );
  }

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: {
      project: { include: { vessel: true } },
      lines: { orderBy: { sort: "asc" } },
      notes: { orderBy: [{ kind: "asc" }, { sort: "asc" }] },
      variation: true,
      changeOrder: { select: { id: true, number: true, title: true, status: true } },
    },
  });
  if (!job) return notFound();

  const projects = await listProjectsForUser(user.id);
  if (!projects.some((p) => p.id === job.projectId)) return notFound();

  if (!["QUOTE_SENT", "EXPIRED"].includes(job.status)) {
    return (
      <EmptyState
        title="Nothing to accept"
        hint={`${job.code} is not awaiting a decision.`}
        action={
          <Link href={`/jobs/${job.id}`} className="btn">
            Back to the job
          </Link>
        }
      />
    );
  }

  const currency = job.currency || job.project.currency;
  const exclusions = job.notes.filter((n) => n.kind === "EXCLUSION");
  const expired = isExpired(job);

  // Step three once a code has been issued, step one and two before that.
  const challenge = searchParams.challenge
    ? await prisma.acceptanceChallenge.findUnique({ where: { id: searchParams.challenge } })
    : null;
  const usableChallenge =
    challenge && challenge.jobId === job.id && challenge.userId === user.id
      ? challengeProblem(challenge) === null
        ? challenge
        : null
      : null;

  const coBlocking =
    job.changeOrder &&
    !["APPROVED", "IN_PROGRESS", "COMPLETED", "CLOSED"].includes(job.changeOrder.status);

  return (
    <div className="animate-fade-up">
      <Link
        href={`/jobs/${job.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
      >
        <ArrowLeft size={13} />
        {job.code} — {job.title}
      </Link>

      <PageHeader
        eyebrow="Authorise"
        title="Accept this quote"
        subtitle="Check what you are signing. Acceptance is recorded against your name."
      />

      {searchParams.err && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{searchParams.err}</span>
        </div>
      )}

      {coBlocking && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-3 text-sm text-warn"
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Change order{" "}
            <Link href={`/change-orders/${job.changeOrder!.id}`} className="underline">
              {job.changeOrder!.number}
            </Link>{" "}
            authorises this work and has not been approved yet. It must clear its approval chain
            before this quote can be accepted.
          </span>
        </div>
      )}

      <div className="grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="What you are accepting">
            <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">{job.description}</p>
            {job.lines.length > 0 && (
              <div className="-mx-2 overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="text-right">Qty</th>
                      <th>Unit</th>
                      <th className="text-right">Unit price</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.description}</td>
                        <td className="text-right tnum">{toNumber(line.quantity).toLocaleString("en-GB")}</td>
                        <td className="text-muted">{line.unit}</td>
                        <td className="text-right tnum">{fmtMoney(line.unitPrice, currency)}</td>
                        <td className="text-right font-medium text-white tnum">
                          {fmtMoney(line.total, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {exclusions.length > 0 && (
            <SectionCard title="Excluded from this price">
              <ol className="space-y-1.5 text-sm">
                {exclusions.map((note, i) => (
                  <li key={note.id} className="flex gap-2.5">
                    <span className="shrink-0 text-faint tnum">{i + 1}.</span>
                    <span>{note.text}</span>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          <SectionCard title="Summary">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Total</dt>
                <dd className="text-xl font-semibold text-white tnum">
                  {fmtMoney(job.total, currency)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Quote delivered</dt>
                <dd className="tnum">{job.quoteDeliveredAt ? fmtDate(job.quoteDeliveredAt) : "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Valid for</dt>
                <dd className="tnum">
                  {job.validityDays ? `${job.validityDays} days` : "No expiry"}
                </dd>
              </div>
              {job.variation?.priceAdjustment != null && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Contract price change</dt>
                  <dd className="tnum">{fmtMoney(job.variation.priceAdjustment, currency)}</dd>
                </div>
              )}
            </dl>

            {expired && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-bad">
                <Clock size={12} className="mt-0.5 shrink-0" aria-hidden />
                This quote has lapsed. You can still accept it, but the yard decides whether to
                countersign.
              </p>
            )}
          </SectionCard>

          {usableChallenge ? (
            // Step three: the code.
            <SectionCard title="Enter your code">
              <p className="mb-4 flex items-start gap-2 text-sm text-muted">
                <Mail size={14} className="mt-0.5 shrink-0 text-marine" aria-hidden />
                <span>
                  A six-digit code has been sent to <strong className="text-white">{user.email}</strong>.
                  It expires in {CHALLENGE_TTL_MINUTES} minutes.
                </span>
              </p>
              <form action={confirmAcceptance} className="space-y-3">
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="challengeId" value={usableChallenge.id} />
                <Field label="Confirmation code">
                  <Input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.4em] tnum"
                  />
                </Field>
                <SubmitButton className="btn-primary btn-lg w-full justify-center" pendingText="Confirming…">
                  Accept {fmtMoney(job.total, currency)}
                </SubmitButton>
              </form>
              <form action={requestAcceptanceCode} className="mt-3">
                <input type="hidden" name="jobId" value={job.id} />
                <SubmitButton className="btn-ghost w-full justify-center text-xs" pendingText="Sending…">
                  Send a new code
                </SubmitButton>
              </form>
            </SectionCard>
          ) : (
            // Steps one and two: review, then ask for the code.
            <SectionCard title="Confirm">
              <p className="mb-4 text-sm text-muted">
                Accepting authorises the yard to carry out this work and to invoice{" "}
                <strong className="text-white">{fmtMoney(job.total, currency)}</strong>. We will email
                you a code to confirm it is you.
              </p>
              <form action={requestAcceptanceCode}>
                <input type="hidden" name="jobId" value={job.id} />
                <SubmitButton
                  className="btn-primary btn-lg w-full justify-center"
                  disabled={Boolean(coBlocking)}
                  pendingText="Sending code…"
                >
                  Accept quote
                </SubmitButton>
              </form>
              {coBlocking && (
                <p className="mt-2 text-xs text-warn">
                  Blocked until the change order is approved.
                </p>
              )}
            </SectionCard>
          )}

          {hasPermission(user, PERMISSIONS.JOB_CANCEL) && (
            <SectionCard title="Or reject">
              <form action={rejectQuote} className="space-y-2">
                <input type="hidden" name="jobId" value={job.id} />
                <Field label="Reason" hint="Shared with the yard.">
                  <Input name="reason" placeholder="Why the quote is being rejected" />
                </Field>
                <SubmitButton className="btn-danger w-full justify-center" pendingText="Rejecting…">
                  Reject quote
                </SubmitButton>
              </form>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
