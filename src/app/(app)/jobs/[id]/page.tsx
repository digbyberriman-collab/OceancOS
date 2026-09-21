import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Paperclip,
  Star,
  Printer,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { listProjectsForUser } from "@/lib/project";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { DefGrid, DefRow } from "@/components/workflow/DefinitionGrid";
import { Field, Textarea } from "@/components/ui/Form";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";
import { daysUntilExpiry, isExpired, jobActions } from "@/lib/jobs/workflow";
import {
  CONTRACT_TYPE_LABELS,
  PRICING_BASIS_LABELS,
  type ContractType,
  type JobStatus,
  type PricingBasis,
} from "@/lib/enums";
import {
  addJobComment,
  setJobProgress,
  toggleJobFavourite,
  transitionJob,
} from "../actions";

export const dynamic = "force-dynamic";

type InvoicingTerm = { pct?: number; trigger?: string; date?: string };

export default async function JobDetail({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.JOB_VIEW)) return notFound();

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: {
      project: { include: { vessel: true } },
      section: true,
      changeOrder: { select: { id: true, number: true, title: true, status: true } },
      lines: { orderBy: { sort: "asc" } },
      notes: { orderBy: [{ kind: "asc" }, { sort: "asc" }] },
      variation: true,
      history: { orderBy: { createdAt: "desc" } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { attachments: true },
      },
      attachments: { orderBy: { createdAt: "desc" } },
      favourites: { where: { userId: user.id } },
    },
  });
  if (!job) return notFound();

  const projects = await listProjectsForUser(user.id);
  if (!projects.some((p) => p.id === job.projectId)) return notFound();

  const people = await prisma.user.findMany({
    where: {
      id: {
        in: Array.from(
          new Set(
            [
              job.createdById,
              job.designatedAuthoriserId,
              job.clientAcceptedById,
              job.yardAcceptedById,
              ...job.comments.map((c) => c.authorId),
              ...job.history.map((h) => h.actorId).filter((x): x is string => !!x),
            ].filter((x): x is string => !!x)
          )
        ),
      },
    },
    select: { id: true, name: true },
  });
  const nameOf = (id: string | null | undefined) =>
    (id && people.find((p) => p.id === id)?.name) || "—";

  const currency = job.currency || job.project.currency;
  const expired = isExpired(job);
  const daysLeft = daysUntilExpiry(job.expiresAt);
  const exclusions = job.notes.filter((n) => n.kind === "EXCLUSION");
  const notes = job.notes.filter((n) => n.kind === "NOTE");
  const isFavourite = job.favourites.length > 0;

  const actions = jobActions(job.status as JobStatus).filter((a) =>
    hasPermission(user, a.permission)
  );
  const canQuote =
    hasPermission(user, PERMISSIONS.JOB_ISSUE_QUOTE) &&
    ["NEW_REQUEST"].includes(job.status);
  const canProgress =
    hasPermission(user, PERMISSIONS.JOB_PROGRESS) && job.status === "ACCEPTED";

  const invoicingTerms = Array.isArray(job.variation?.invoicingTerms)
    ? (job.variation?.invoicingTerms as InvoicingTerm[])
    : [];

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <Link
          href="/jobs"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
        >
          <ArrowLeft size={13} />
          Quotes &amp; requests
        </Link>
        <PageHeader
          title={`${job.code} — ${job.title}`}
          subtitle={`${job.project.vessel.name} · ${job.project.name}${
            job.section ? ` · ${job.section.name}` : ""
          }`}
          actions={
            <>
              <StatusBadge value={job.status} />
              <form action={toggleJobFavourite}>
                <input type="hidden" name="jobId" value={job.id} />
                <button
                  className={`btn text-xs ${isFavourite ? "border-warn/40 text-warn" : ""}`}
                  aria-pressed={isFavourite}
                >
                  <Star size={13} className={isFavourite ? "fill-warn" : ""} />
                  {isFavourite ? "Favourited" : "Favourite"}
                </button>
              </form>
              <a href={`/api/export/jobs/${job.id}`} className="btn" target="_blank" rel="noopener">
                <Printer size={14} />
                PDF
              </a>
            </>
          }
        />
      </div>

      {/* Validity, stated prominently because it governs whether this is still
          a live offer. */}
      {(expired || (daysLeft !== null && daysLeft <= 7)) && job.status !== "ACCEPTED" && (
        <div
          className={`mb-5 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
            expired ? "border-bad/30 bg-bad/10 text-bad" : "border-warn/30 bg-warn/10 text-warn"
          }`}
          role="status"
        >
          <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {expired ? (
              <>
                This quote lapsed {Math.abs(daysLeft ?? 0)} days ago. It can still be accepted, but
                the yard decides whether to countersign it.
              </>
            ) : (
              <>
                Valid for {daysLeft} more {daysLeft === 1 ? "day" : "days"}
                {job.quoteDeliveredAt ? `, delivered ${fmtDate(job.quoteDeliveredAt)}` : ""}.
              </>
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Job &amp; service description">
            <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">{job.description}</p>

            {job.lines.length > 0 ? (
              <div className="-mx-2 overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="text-right">Quantity</th>
                      <th>Unit</th>
                      <th className="text-right">Unit price</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.description}</td>
                        <td className="text-right tnum">{line.quantity.toLocaleString("en-GB")}</td>
                        <td className="text-muted">{line.unit}</td>
                        <td className="text-right tnum">{fmtMoney(line.unitPrice, currency)}</td>
                        <td className="text-right font-medium text-white tnum">
                          {fmtMoney(line.total, currency)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="text-right font-medium text-muted">
                        Total
                      </td>
                      <td className="text-right text-base font-semibold text-white tnum">
                        {fmtMoney(job.total, currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Not yet priced. The yard adds the lines when it issues the quote.
              </p>
            )}
          </SectionCard>

          {exclusions.length > 0 && (
            <SectionCard title="Exclusions">
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

          {notes.length > 0 && (
            <SectionCard title="Notes">
              <ol className="space-y-1.5 text-sm">
                {notes.map((note, i) => (
                  <li key={note.id} className="flex gap-2.5">
                    <span className="shrink-0 text-faint tnum">{i + 1}.</span>
                    <span>{note.text}</span>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}

          {job.variation && (
            <SectionCard title="Variation certificate">
              <DefGrid>
                <DefRow label="Variation due to">
                  {job.variation.dueTo?.replace(/_/g, " ").toLowerCase() ?? "—"}
                </DefRow>
                <DefRow label="Variation affecting">
                  {job.variation.affecting?.replace(/_/g, " ").toLowerCase() ?? "—"}
                </DefRow>
                <DefRow label="Adjustment to delivery date">
                  {job.variation.deliveryAdjustment ?? "—"}
                </DefRow>
                <DefRow label="Adjustment to contract price">
                  <span className="tnum font-medium text-white">
                    {job.variation.priceAdjustment == null
                      ? "—"
                      : fmtMoney(job.variation.priceAdjustment, currency)}
                  </span>
                </DefRow>
                <DefRow label="Adjustment to invoicing terms" span2>
                  {invoicingTerms.length === 0 ? (
                    "—"
                  ) : (
                    <ul className="space-y-0.5">
                      {invoicingTerms.map((term, i) => (
                        <li key={i} className="tnum">
                          {term.pct}% on {String(term.trigger ?? "").toLowerCase()}
                          {term.date ? ` · ${term.date}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </DefRow>
                <DefRow label="Valid for" span2>
                  {job.validityDays ? `${job.validityDays} days` : "—"}
                  {expired && <span className="badge badge-bad ml-2">Expired</span>}
                </DefRow>
              </DefGrid>
            </SectionCard>
          )}

          {/* Conversation, with minutes tagged as The Bridge tags them. */}
          <SectionCard
            title="Comments"
            headerRight={
              job.comments.length > 0 ? (
                <span className="badge badge-muted tnum">{job.comments.length}</span>
              ) : undefined
            }
          >
            <div className="mb-5 max-h-96 space-y-3 overflow-y-auto">
              {job.comments.length === 0 && (
                <div className="flex items-center gap-2 py-2 text-sm text-muted">
                  <MessageSquare size={14} />
                  No comments yet.
                </div>
              )}
              {job.comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`rounded-lg border px-3 py-2.5 text-sm ${
                    comment.kind === "SYSTEM"
                      ? "border-line-soft bg-ink-950/40 text-muted"
                      : comment.kind === "MINUTE"
                        ? "border-accent/30 bg-accent/5"
                        : "border-line-soft bg-ink-850/40"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-white">{nameOf(comment.authorId)}</span>
                    <span className="text-xs text-muted tnum">{fmtDateTime(comment.createdAt)}</span>
                    {comment.kind === "MINUTE" && <Badge tone="info">minute</Badge>}
                    {comment.kind === "SYSTEM" && <Badge tone="muted">system</Badge>}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{comment.body}</div>
                  {comment.attachments.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {comment.attachments.map((file) => (
                        <li key={file.id} className="flex items-center gap-1.5 text-xs text-muted">
                          <Paperclip size={11} />
                          {file.filename}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {hasPermission(user, PERMISSIONS.JOB_COMMENT) && (
              <form action={addJobComment} className="space-y-2">
                <input type="hidden" name="jobId" value={job.id} />
                <Field label="Add a comment">
                  <Textarea name="body" required placeholder="Write a comment…" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button name="kind" value="MESSAGE" className="btn-primary">
                    Send message
                  </button>
                  {hasPermission(user, PERMISSIONS.MINUTES_RECORD) && (
                    <button name="kind" value="MINUTE" className="btn">
                      Record minute
                    </button>
                  )}
                </div>
              </form>
            )}
          </SectionCard>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <SectionCard title="Quote">
            <DefGrid>
              <DefRow label="Code">
                <span className="tnum">{job.code}</span>
              </DefRow>
              {job.clientRef && (
                <DefRow label="Your reference">
                  <span className="tnum">{job.clientRef}</span>
                </DefRow>
              )}
              <DefRow label="Contract type">
                {CONTRACT_TYPE_LABELS[job.contractType as ContractType] ?? job.contractType}
              </DefRow>
              <DefRow label="Pricing basis">
                {PRICING_BASIS_LABELS[job.pricingBasis as PricingBasis] ?? job.pricingBasis}
                {job.exceptionFlag && <span className="badge badge-warn ml-2">Exception</span>}
              </DefRow>
              <DefRow label="Total">
                <span className="tnum text-base font-semibold text-white">
                  {fmtMoney(job.total, currency)}
                </span>
              </DefRow>
              <DefRow label="Requested">{job.requestedAt ? fmtDate(job.requestedAt) : "—"}</DefRow>
              <DefRow label="Quote delivered">
                {job.quoteDeliveredAt ? fmtDate(job.quoteDeliveredAt) : "—"}
              </DefRow>
              <DefRow label="Authoriser">{nameOf(job.designatedAuthoriserId)}</DefRow>
              <DefRow label="Progress">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full bg-ok" style={{ width: `${job.progressPct}%` }} />
                  </div>
                  <span className="tnum">{job.progressPct}%</span>
                </div>
              </DefRow>
              {job.changeOrder && (
                <DefRow label="Authorised by" span2>
                  <Link
                    href={`/change-orders/${job.changeOrder.id}`}
                    className="text-accent-bright hover:text-marine"
                  >
                    <span className="tnum">{job.changeOrder.number}</span> {job.changeOrder.title}
                  </Link>
                </DefRow>
              )}
            </DefGrid>
          </SectionCard>

          {/* Digital acceptance, as The Bridge records it. */}
          <SectionCard title="Acceptance">
            <div className="space-y-3">
              <SignatureCard
                title="Quote accepted"
                by={nameOf(job.clientAcceptedById)}
                at={job.clientAcceptedAt}
                pending="Awaiting the client's authorisation."
              />
              <SignatureCard
                title="Yard countersigned"
                by={nameOf(job.yardAcceptedById)}
                at={job.yardAcceptedAt}
                pending="Awaiting the yard's countersignature."
              />
              {job.worksAcceptedAt && (
                <SignatureCard
                  title="Works accepted"
                  by={nameOf(job.clientAcceptedById)}
                  at={job.worksAcceptedAt}
                  pending=""
                  note={
                    job.warrantyMonths
                      ? `Warranty runs ${job.warrantyMonths} months from this date.`
                      : undefined
                  }
                />
              )}
            </div>
          </SectionCard>

          {canQuote && (
            <SectionCard title="Yard">
              <Link href={`/jobs/${job.id}/quote`} className="btn-primary w-full justify-center">
                <FileText size={14} />
                Price this request
              </Link>
            </SectionCard>
          )}

          {canProgress && (
            <SectionCard title="Report progress">
              <form action={setJobProgress} className="flex items-end gap-2">
                <input type="hidden" name="jobId" value={job.id} />
                <Field label="Complete (%)" className="flex-1">
                  <input
                    type="number"
                    name="progressPct"
                    min={0}
                    max={100}
                    defaultValue={job.progressPct}
                    className="input-base"
                  />
                </Field>
                <button className="btn-primary">Save</button>
              </form>
            </SectionCard>
          )}

          {actions.length > 0 && (
            <SectionCard title="Actions">
              <div className="space-y-2">
                {actions.map((action) => (
                  <form key={action.to} action={transitionJob} className="space-y-2">
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="to" value={action.to} />
                    {action.tone === "danger" && (
                      <input
                        name="reason"
                        placeholder="Reason (recorded on the job)"
                        className="input-base text-xs"
                      />
                    )}
                    <button
                      className={`w-full justify-center ${
                        action.tone === "danger" ? "btn-danger" : action.tone === "primary" ? "btn-primary" : "btn"
                      }`}
                    >
                      {action.label}
                    </button>
                  </form>
                ))}
              </div>
            </SectionCard>
          )}

          {hasPermission(user, PERMISSIONS.JOB_ACCEPT) &&
            ["QUOTE_SENT", "EXPIRED"].includes(job.status) && (
              <SectionCard title="Authorise">
                <p className="mb-3 text-sm text-muted">
                  Accepting is a signature on {fmtMoney(job.total, currency)}. It is confirmed with a
                  code sent to your email.
                </p>
                <Link href={`/jobs/${job.id}/accept`} className="btn-primary w-full justify-center">
                  Review and accept
                </Link>
              </SectionCard>
            )}

          <SectionCard title="History">
            <ul className="max-h-72 space-y-2.5 overflow-y-auto text-sm">
              {job.history.map((entry) => (
                <li key={entry.id} className="flex gap-2.5">
                  <CheckCircle2 size={13} className="mt-1 shrink-0 text-faint" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-xs text-muted tnum">
                      {fmtDateTime(entry.createdAt)} · {nameOf(entry.actorId)}
                    </div>
                    <div className="mt-0.5">{entry.event.replace(/_/g, " ").toLowerCase()}</div>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SignatureCard({
  title,
  by,
  at,
  pending,
  note,
}: {
  title: string;
  by: string;
  at: Date | null;
  pending: string;
  note?: string;
}) {
  if (!at) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-sm text-muted">
        {pending}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-ok/30 bg-ok/5 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-ok">
        <CheckCircle2 size={14} aria-hidden />
        {title}
      </div>
      <dl className="mt-1.5 space-y-0.5 text-xs text-muted">
        <div>
          <dt className="inline">Name: </dt>
          <dd className="inline text-white">{by}</dd>
        </div>
        <div>
          <dt className="inline">Date: </dt>
          <dd className="inline tnum text-white">{fmtDateTime(at)}</dd>
        </div>
      </dl>
      {note && <p className="mt-1.5 text-xs text-muted">{note}</p>}
    </div>
  );
}
