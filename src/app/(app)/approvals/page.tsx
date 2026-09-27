import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { decideChangeOrderApproval } from "../change-orders/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SectionCard } from "@/components/workflow/SectionCard";
import { CheckCircle2 } from "lucide-react";
import { projectScope } from "@/lib/project";

export const dynamic = "force-dynamic";

const STAGE_PERM: Record<string, string> = {
  CAPTAIN: PERMISSIONS.CO_APPROVE_CAPTAIN,
  OWNERS_REP: PERMISSIONS.CO_APPROVE_OWNERS_REP,
  YARD: PERMISSIONS.CO_APPROVE_YARD,
  FINANCE: PERMISSIONS.CO_APPROVE_FINANCE,
  TECH_MANAGER: PERMISSIONS.CO_APPROVE_TECH,
  CLASS: PERMISSIONS.CO_APPROVE_CLASS,
  FLAG: PERMISSIONS.CO_APPROVE_FLAG,
};

export default async function ApprovalsPage() {
  const user = await requireUser();

  const myStages = (Object.keys(STAGE_PERM) as (keyof typeof STAGE_PERM)[]).filter((s) =>
    hasPermission(user, STAGE_PERM[s] as any)
  );

  const scope = await projectScope(user.id);

  // Change order approvals waiting on me
  const myCoApprovals = myStages.length
    ? await prisma.changeOrderApproval.findMany({
        where: {
          decision: "PENDING",
          stage: { in: myStages as string[] },
          changeOrder: { ...scope, status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO"] } },
        },
        include: { changeOrder: { include: { project: { select: { currency: true } } } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // All other pending change order approvals (visibility)
  const otherCoApprovals = await prisma.changeOrderApproval.findMany({
    where: {
      decision: "PENDING",
      stage: { notIn: myStages as string[] },
      changeOrder: { ...scope, status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO"] } },
    },
    include: { changeOrder: { include: { project: { select: { currency: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const totalPending = myCoApprovals.length + otherCoApprovals.length;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Approvals Centre"
        eyebrow="Workflow"
        subtitle="Every item waiting on a decision, in one queue."
        actions={
          totalPending > 0 ? (
            <span className="badge badge-warn tnum text-sm px-3 py-1">
              {totalPending} pending
            </span>
          ) : (
            <span className="badge badge-ok text-sm px-3 py-1">All clear</span>
          )
        }
      />

      {/* ── Waiting on you ── */}
      <section className="mb-6 animate-fade-in">
        <SectionCard
          title="Waiting on You"
          headerRight={
            myCoApprovals.length > 0 ? (
              <span className="badge badge-warn tnum">{myCoApprovals.length}</span>
            ) : undefined
          }
          noPad={myCoApprovals.length > 0}
        >
          {myCoApprovals.length === 0 ? (
            <div className="flex items-center gap-3 py-2">
              <div className="h-8 w-8 rounded-lg bg-ok/10 border border-ok/30 grid place-items-center shrink-0">
                <CheckCircle2 size={16} className="text-ok" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">All caught up</p>
                <p className="text-xs text-muted">You have no pending approvals at this time.</p>
              </div>
            </div>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Change Order</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Cost</th>
                  <th scope="col" className="text-right">Schedule&nbsp;Δ</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {myCoApprovals.map((a) => {
                  const rowLabel = `${a.changeOrder.number} — ${a.changeOrder.title}`;
                  return (
                  <tr key={a.id}>
                    <td>
                      <Badge tone="info">{a.stage.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="max-w-xs">
                      <Link
                        href={`/change-orders/${a.changeOrderId}`}
                        className="text-accent hover:text-accent-bright transition-colors font-mono text-xs"
                      >
                        {a.changeOrder.number}
                      </Link>
                      <span className="ml-2 text-sm text-white line-clamp-1">{a.changeOrder.title}</span>
                    </td>
                    <td>
                      <StatusBadge value={a.changeOrder.status} />
                    </td>
                    <td className="text-right tnum">
                      {fmtMoney(a.changeOrder.estimatedCost, a.changeOrder.project.currency)}
                    </td>
                    <td className="text-right tnum">
                      {a.changeOrder.scheduleImpactDays ? (
                        <span className="text-warn">+{a.changeOrder.scheduleImpactDays}d</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <form action={decideChangeOrderApproval} className="flex gap-1.5 flex-wrap">
                        <input type="hidden" name="approvalId" value={a.id} />
                        <SubmitButton
                          name="decision"
                          value="APPROVED"
                          aria-label={`Approve ${rowLabel}`}
                          className="btn-primary text-xs py-1 px-2.5"
                        >
                          Approve
                        </SubmitButton>
                        <SubmitButton
                          name="decision"
                          value="MORE_INFO"
                          aria-label={`Request Info — ${rowLabel}`}
                          className="btn text-xs py-1 px-2.5"
                        >
                          Request Info
                        </SubmitButton>
                        <SubmitButton
                          name="decision"
                          value="REJECTED"
                          aria-label={`Reject ${rowLabel}`}
                          className="btn-danger text-xs py-1 px-2.5"
                        >
                          Reject
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>
      </section>

      {/* ── Pending with other approvers ── */}
      <section className="mb-6">
        <SectionCard
          title="Pending with Other Approvers"
          headerRight={
            otherCoApprovals.length > 0 ? (
              <span className="badge badge-muted tnum">{otherCoApprovals.length}</span>
            ) : undefined
          }
          noPad={otherCoApprovals.length > 0}
        >
          {otherCoApprovals.length === 0 ? (
            <p className="text-sm text-muted py-1">Nothing pending with other approvers.</p>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Change Order</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Cost</th>
                  <th scope="col" className="text-right">Raised</th>
                </tr>
              </thead>
              <tbody>
                {otherCoApprovals.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Badge tone="muted">{a.stage.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="max-w-xs">
                      <Link
                        href={`/change-orders/${a.changeOrderId}`}
                        className="text-accent hover:text-accent-bright transition-colors font-mono text-xs"
                      >
                        {a.changeOrder.number}
                      </Link>
                      <span className="ml-2 text-sm text-white line-clamp-1">{a.changeOrder.title}</span>
                    </td>
                    <td>
                      <StatusBadge value={a.changeOrder.status} />
                    </td>
                    <td className="text-right tnum">
                      {fmtMoney(a.changeOrder.estimatedCost, a.changeOrder.project.currency)}
                    </td>
                    <td className="text-right tnum text-muted text-xs">
                      {fmtDate(a.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </section>
    </div>
  );
}
