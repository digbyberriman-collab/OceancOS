import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/Badge";
import { Field, Textarea } from "@/components/ui/Form";
import { fmtMoney, fmtDateTime } from "@/lib/utils";
import {
  transitionChangeOrder,
  decideChangeOrderApproval,
  addChangeOrderComment,
} from "../actions";
import type { CoApprovalStage } from "@/lib/enums";

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
      { to: "SUBMITTED", label: "Submit for review", perm: PERMISSIONS.CO_SUBMIT },
      { to: "CANCELLED", label: "Cancel", perm: PERMISSIONS.CO_CANCEL },
    ],
    SUBMITTED: [{ to: "UNDER_REVIEW", label: "Move to review" }],
    UNDER_REVIEW: [],
    MORE_INFO: [{ to: "UNDER_REVIEW", label: "Resume review" }],
    APPROVED: [{ to: "IN_PROGRESS", label: "Start work" }, { to: "CANCELLED", label: "Cancel" }],
    IN_PROGRESS: [{ to: "COMPLETED", label: "Mark completed" }],
    COMPLETED: [{ to: "CLOSED", label: "Close" }],
    REJECTED: [{ to: "DRAFT", label: "Revise" }],
    CLOSED: [],
    CANCELLED: [],
  };

  const allowedTransitions = (transitionsForStatus[co.status] ?? []).filter((t) =>
    t.perm ? hasPermission(user, t.perm as any) : hasPermission(user, PERMISSIONS.CO_EDIT)
  );

  return (
    <>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="surface p-4 lg:col-span-2">
          <h2 className="text-sm font-medium mb-3">Detail</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Row label="Description"><span className="whitespace-pre-wrap">{co.description}</span></Row>
            <Row label="Reason"><span className="whitespace-pre-wrap">{co.reason}</span></Row>
            <Row label="Department">{co.departmentCode ?? "—"}</Row>
            <Row label="Estimated cost">{fmtMoney(co.estimatedCost)}</Row>
            <Row label="Approved cost">{fmtMoney(co.approvedCost)}</Row>
            <Row label="Schedule impact">{co.scheduleImpactDays || 0} days</Row>
            <Row label="Risk impact"><span className="whitespace-pre-wrap">{co.riskImpact ?? "—"}</span></Row>
            <Row label="Technical impact"><span className="whitespace-pre-wrap">{co.technicalImpact ?? "—"}</span></Row>
            <Row label="Class review">{co.needsClassReview ? "Required" : "Not required"}</Row>
            <Row label="Flag review">{co.needsFlagReview ? "Required" : "Not required"}</Row>
            <Row label="Created">{fmtDateTime(co.createdAt)} by {usersMap.get(co.createdById) ?? "—"}</Row>
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            {allowedTransitions.map((t) => (
              <form key={t.to} action={async () => { "use server"; await transitionChangeOrder(co.id, t.to); }}>
                <button className={t.to === "CANCELLED" || t.to === "REJECTED" ? "btn-danger" : "btn-primary"}>
                  {t.label}
                </button>
              </form>
            ))}
            {allowedTransitions.length === 0 && (
              <p className="text-sm text-muted">No status changes available to you in the current state.</p>
            )}
          </div>
        </div>

        <div className="surface p-4">
          <h2 className="text-sm font-medium mb-3">Approval chain</h2>
          <ol className="space-y-3">
            {co.approvals.map((a, i) => {
              const canDecide =
                a.decision === "PENDING" &&
                hasPermission(user, STAGE_PERMISSION[a.stage] as any) &&
                ["UNDER_REVIEW", "SUBMITTED", "MORE_INFO"].includes(co.status);
              return (
                <li key={a.id} className="border-l-2 border-line pl-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{i + 1}. {a.stage}</div>
                    <Badge tone={a.decision === "APPROVED" ? "ok" : a.decision === "REJECTED" ? "bad" : a.decision === "MORE_INFO" ? "warn" : "muted"}>
                      {a.decision}
                    </Badge>
                  </div>
                  {a.decidedAt && (
                    <div className="text-xs text-muted mt-0.5">
                      {usersMap.get(a.decidedById ?? "") ?? "—"} · {fmtDateTime(a.decidedAt)}
                    </div>
                  )}
                  {a.comment && <div className="text-xs mt-1 whitespace-pre-wrap">{a.comment}</div>}
                  {canDecide && (
                    <form action={decideChangeOrderApproval} className="mt-2 space-y-2">
                      <input type="hidden" name="approvalId" value={a.id} />
                      <textarea name="comment" placeholder="Comment (optional)" className="input-base text-xs" />
                      <div className="flex gap-2">
                        <button name="decision" value="APPROVED" className="btn-primary text-xs">Approve</button>
                        <button name="decision" value="MORE_INFO" className="btn text-xs">Request info</button>
                        <button name="decision" value="REJECTED" className="btn-danger text-xs">Reject</button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface p-4">
          <h2 className="text-sm font-medium mb-3">Comments</h2>
          <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
            {co.comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
            {co.comments.map((c) => (
              <div key={c.id} className="text-sm">
                <div className="text-xs text-muted">
                  {usersMap.get(c.authorId) ?? "—"} · {fmtDateTime(c.createdAt)}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
          </div>
          <form action={addChangeOrderComment} className="space-y-2">
            <input type="hidden" name="id" value={co.id} />
            <Field label="Add a comment">
              <Textarea name="body" required />
            </Field>
            <button className="btn-primary">Post comment</button>
          </form>
        </div>

        <div className="surface p-4">
          <h2 className="text-sm font-medium mb-3">History</h2>
          <ul className="space-y-2 text-sm max-h-96 overflow-y-auto">
            {co.history.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5">
                <div className="text-xs text-muted">
                  {fmtDateTime(h.createdAt)} · {usersMap.get(h.actorId) ?? "—"}
                </div>
                <div>
                  <span className="font-medium">{h.event}</span>
                  {h.fromStatus && h.toStatus && <> {h.fromStatus} → {h.toStatus}</>}
                  {h.details && <span className="text-muted"> — {h.details}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Link href="/change-orders" className="btn-ghost">← Back</Link>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-white">{children}</dd>
    </div>
  );
}
