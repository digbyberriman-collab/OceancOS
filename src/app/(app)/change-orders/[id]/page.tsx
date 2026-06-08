import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/Badge";
import { Field, Textarea } from "@/components/ui/Form";
import { fmtMoney, fmtDateTime } from "@/lib/utils";
import { SectionCard } from "@/components/workflow/SectionCard";
import { DefGrid, DefRow } from "@/components/workflow/DefinitionGrid";
import {
  transitionChangeOrder,
  decideChangeOrderApproval,
  addChangeOrderComment,
} from "../actions";
import type { CoApprovalStage } from "@/lib/enums";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Info,
  Clock,
  MessageSquare,
  History,
  GitMerge,
} from "lucide-react";

export const dynamic = "force-dynamic";

const STAGE_PERMISSION: Record<string, string> = {
  CAPTAIN: PERMISSIONS.CO_APPROVE_CAPTAIN,
  OWNERS_REP: PERMISSIONS.CO_APPROVE_OWNERS_REP,
  YARD: PERMISSIONS.CO_APPROVE_YARD,
  FINANCE: PERMISSIONS.CO_APPROVE_FINANCE,
  TECH_MANAGER: PERMISSIONS.CO_APPROVE_TECH,
  CLASS: PERMISSIONS.CO_APPROVE_CLASS,
  FLAG: PERMISSIONS.CO_APPROVE_FLAG,
};

export default async function ChangeOrderDetail({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CO_VIEW)) return notFound();

  const co = await prisma.changeOrder.findUnique({
    where: { id: params.id },
    include: {
      project: { include: { vessel: true } },
      approvals: { orderBy: { order: "asc" } },
      history: { orderBy: { createdAt: "desc" } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!co) return notFound();

  // map authorIds to names for comments and history
  const userIds = Array.from(new Set([
    ...co.comments.map((c) => c.authorId),
    ...co.history.map((h) => h.actorId),
    ...co.approvals.map((a) => a.decidedById).filter((x): x is string => !!x),
    co.createdById,
  ]));
  const usersMap = new Map(
    (await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])
  );

  const transitionsForStatus: Record<string, { to: string; label: string; perm?: string }[]> = {
    DRAFT: [
      { to: "SUBMITTED", label: "Submit for Review", perm: PERMISSIONS.CO_SUBMIT },
      { to: "CANCELLED", label: "Cancel", perm: PERMISSIONS.CO_CANCEL },
    ],
    SUBMITTED: [{ to: "UNDER_REVIEW", label: "Move to Review" }],
    UNDER_REVIEW: [],
    MORE_INFO: [{ to: "UNDER_REVIEW", label: "Resume Review" }],
    APPROVED: [{ to: "IN_PROGRESS", label: "Start Work" }, { to: "CANCELLED", label: "Cancel" }],
    IN_PROGRESS: [{ to: "COMPLETED", label: "Mark Completed" }],
    COMPLETED: [{ to: "CLOSED", label: "Close" }],
    REJECTED: [{ to: "DRAFT", label: "Revise" }],
    CLOSED: [],
    CANCELLED: [],
  };

  const allowedTransitions = (transitionsForStatus[co.status] ?? []).filter((t) =>
    t.perm ? hasPermission(user, t.perm as any) : hasPermission(user, PERMISSIONS.CO_EDIT)
  );

  return (
    <div className="animate-fade-up">
      {/* ── Page header ── */}
      <div className="mb-6">
        <Link
          href="/change-orders"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          Change Orders
        </Link>
        <PageHeader
          title={`${co.number} — ${co.title}`}
          subtitle={`${co.project.vessel.name} · ${co.project.name}`}
          actions={
            <>
              <StatusBadge value={co.status} />
              <PriorityBadge value={co.priority} />
            </>
          }
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Detail card */}
        <div className="lg:col-span-2 space-y-4">
          <SectionCard title="Change Details">
            <DefGrid>
              <DefRow label="Description" span2>
                <span className="whitespace-pre-wrap">{co.description}</span>
              </DefRow>
              <DefRow label="Reason for Change" span2>
                <span className="whitespace-pre-wrap">{co.reason}</span>
              </DefRow>
              <DefRow label="Department">{co.departmentCode ?? "—"}</DefRow>
              <DefRow label="Estimated Cost">
                <span className="tnum font-medium text-white">{fmtMoney(co.estimatedCost)}</span>
              </DefRow>
              <DefRow label="Approved Cost">
                <span className="tnum font-medium text-white">{fmtMoney(co.approvedCost)}</span>
              </DefRow>
              <DefRow label="Schedule Impact">
                {co.scheduleImpactDays ? (
                  <span className={cn("tnum font-medium", co.scheduleImpactDays > 0 ? "text-warn" : "text-ok")}>
                    {co.scheduleImpactDays > 0 ? "+" : ""}{co.scheduleImpactDays} days
                  </span>
                ) : (
                  <span className="text-muted">No impact</span>
                )}
              </DefRow>
            </DefGrid>
          </SectionCard>

          <SectionCard title="Impact Assessment">
            <DefGrid>
              <DefRow label="Risk Impact" span2>
                <span className="whitespace-pre-wrap">{co.riskImpact ?? "—"}</span>
              </DefRow>
              <DefRow label="Technical Impact" span2>
                <span className="whitespace-pre-wrap">{co.technicalImpact ?? "—"}</span>
              </DefRow>
              <DefRow label="Class Review">
                {co.needsClassReview ? (
                  <span className="badge badge-warn">Required</span>
                ) : (
                  <span className="text-muted">Not required</span>
                )}
              </DefRow>
              <DefRow label="Flag Review">
                {co.needsFlagReview ? (
                  <span className="badge badge-warn">Required</span>
                ) : (
                  <span className="text-muted">Not required</span>
                )}
              </DefRow>
            </DefGrid>
          </SectionCard>

          <SectionCard title="Metadata">
            <DefGrid>
              <DefRow label="Created">
                <span className="tnum">{fmtDateTime(co.createdAt)}</span>
                <span className="text-muted"> by {usersMap.get(co.createdById) ?? "—"}</span>
              </DefRow>
            </DefGrid>
          </SectionCard>

          {/* Workflow actions */}
          {allowedTransitions.length > 0 && (
            <SectionCard title="Workflow Actions">
              <div className="flex flex-wrap gap-2">
                {allowedTransitions.map((t) => (
                  <form key={t.to} action={async () => { "use server"; await transitionChangeOrder(co.id, t.to); }}>
                    <button className={t.to === "CANCELLED" || t.to === "REJECTED" ? "btn-danger" : "btn-primary"}>
                      {t.label}
                    </button>
                  </form>
                ))}
              </div>
            </SectionCard>
          )}
          {allowedTransitions.length === 0 && (
            <p className="text-sm text-muted px-1">No status changes available to you in the current state.</p>
          )}
        </div>

        {/* Approval chain */}
        <SectionCard title="Approval Chain">
          <ol className="space-y-4">
            {co.approvals.map((a, i) => {
              const canDecide =
                a.decision === "PENDING" &&
                hasPermission(user, STAGE_PERMISSION[a.stage] as any) &&
                ["UNDER_REVIEW", "SUBMITTED", "MORE_INFO"].includes(co.status);

              const decisionIcon =
                a.decision === "APPROVED" ? (
                  <CheckCircle2 size={14} className="text-ok shrink-0 mt-0.5" />
                ) : a.decision === "REJECTED" ? (
                  <XCircle size={14} className="text-bad shrink-0 mt-0.5" />
                ) : a.decision === "MORE_INFO" ? (
                  <Info size={14} className="text-warn shrink-0 mt-0.5" />
                ) : (
                  <Clock size={14} className="text-muted shrink-0 mt-0.5" />
                );

              return (
                <li key={a.id} className="relative pl-4 border-l-2 border-line">
                  {/* Step connector dot */}
                  <span
                    className={cn(
                      "absolute -left-[5px] top-1 w-2 h-2 rounded-full border",
                      a.decision === "APPROVED"
                        ? "bg-ok border-ok/50"
                        : a.decision === "REJECTED"
                        ? "bg-bad border-bad/50"
                        : a.decision === "MORE_INFO"
                        ? "bg-warn border-warn/50"
                        : "bg-ink-700 border-line-strong"
                    )}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      {decisionIcon}
                      <span className="text-sm font-medium text-white leading-tight">
                        {i + 1}. {a.stage.replace(/_/g, " ")}
                      </span>
                    </div>
                    <Badge
                      tone={
                        a.decision === "APPROVED"
                          ? "ok"
                          : a.decision === "REJECTED"
                          ? "bad"
                          : a.decision === "MORE_INFO"
                          ? "warn"
                          : "muted"
                      }
                    >
                      {a.decision}
                    </Badge>
                  </div>
                  {a.decidedAt && (
                    <div className="text-xs text-muted mt-1">
                      {usersMap.get(a.decidedById ?? "") ?? "—"} · {fmtDateTime(a.decidedAt)}
                    </div>
                  )}
                  {a.comment && (
                    <div className="text-xs mt-1.5 text-muted whitespace-pre-wrap bg-ink-850/50 rounded-lg px-2.5 py-2 border border-line-soft">
                      {a.comment}
                    </div>
                  )}
                  {canDecide && (
                    <form action={decideChangeOrderApproval} className="mt-3 space-y-2">
                      <input type="hidden" name="approvalId" value={a.id} />
                      <textarea
                        name="comment"
                        placeholder="Comment (optional)…"
                        className="input-base text-xs min-h-[64px]"
                      />
                      <div className="flex gap-2">
                        <button name="decision" value="APPROVED" className="btn-primary text-xs">
                          Approve
                        </button>
                        <button name="decision" value="MORE_INFO" className="btn text-xs">
                          Request Info
                        </button>
                        <button name="decision" value="REJECTED" className="btn-danger text-xs">
                          Reject
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
            {co.approvals.length === 0 && (
              <li className="text-sm text-muted">No approval stages configured.</li>
            )}
          </ol>
        </SectionCard>
      </div>

      {/* ── Comments + History ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title="Comments"
          headerRight={
            co.comments.length > 0 ? (
              <span className="badge badge-muted tnum">{co.comments.length}</span>
            ) : undefined
          }
        >
          <div className="space-y-3 mb-5 max-h-72 overflow-y-auto">
            {co.comments.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted py-2">
                <MessageSquare size={14} />
                No comments yet.
              </div>
            )}
            {co.comments.map((c) => (
              <div key={c.id} className="text-sm bg-ink-850/40 rounded-lg px-3 py-2.5 border border-line-soft">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white text-xs">
                    {usersMap.get(c.authorId) ?? "—"}
                  </span>
                  <span className="text-xs text-muted tnum">{fmtDateTime(c.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{c.body}</div>
              </div>
            ))}
          </div>
          <form action={addChangeOrderComment} className="space-y-2">
            <input type="hidden" name="id" value={co.id} />
            <Field label="Add a comment">
              <Textarea name="body" required placeholder="Write a comment…" />
            </Field>
            <button className="btn-primary">Post Comment</button>
          </form>
        </SectionCard>

        <SectionCard title="History">
          <ul className="space-y-3 max-h-96 overflow-y-auto">
            {co.history.length === 0 && (
              <li className="flex items-center gap-2 text-sm text-muted py-2">
                <History size={14} />
                No history yet.
              </li>
            )}
            {co.history.map((h) => (
              <li key={h.id} className="flex gap-3 text-sm">
                <div className="shrink-0 mt-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent/60 mt-1" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted tnum">
                    {fmtDateTime(h.createdAt)} · {usersMap.get(h.actorId) ?? "—"}
                  </div>
                  <div className="mt-0.5">
                    <span className="font-medium">{h.event}</span>
                    {h.fromStatus && h.toStatus && (
                      <span className="text-muted">
                        {" "}
                        <span className="text-faint">{h.fromStatus}</span>
                        {" → "}
                        <span className="text-white">{h.toStatus}</span>
                      </span>
                    )}
                    {h.details && <span className="text-muted"> — {h.details}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* ── Footer nav ── */}
      <div className="mt-6 flex justify-between items-center">
        <Link href="/change-orders" className="btn-ghost">
          <ArrowLeft size={14} />
          Back to Change Orders
        </Link>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
