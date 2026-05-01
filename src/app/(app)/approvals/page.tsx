import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { decideChangeOrderApproval } from "../change-orders/actions";

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

  // Change order approvals waiting on me
  const myCoApprovals = myStages.length
    ? await prisma.changeOrderApproval.findMany({
        where: {
          decision: "PENDING",
          stage: { in: myStages as string[] },
          changeOrder: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO"] } },
        },
        include: { changeOrder: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // All other pending change order approvals (visibility)
  const otherCoApprovals = await prisma.changeOrderApproval.findMany({
    where: {
      decision: "PENDING",
      stage: { notIn: myStages as string[] },
      changeOrder: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO"] } },
    },
    include: { changeOrder: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  // Generic approvals queue (purchase orders, drawings, schedule changes etc.)
  const otherApprovals = await prisma.approval.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return (
    <>
      <PageHeader
        title="Approvals centre"
        subtitle="Every item waiting on a decision, in one queue."
      />

      <section className="mb-6">
        <h2 className="text-sm font-medium mb-2">Waiting on you</h2>
        {myCoApprovals.length === 0 ? (
          <EmptyState title="Nothing to action" hint="You have no pending approvals at this time." />
        ) : (
          <div className="surface overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>Stage</th><th>Change order</th><th>Status</th><th>Cost</th><th>Schedule Δ</th><th>Action</th></tr>
              </thead>
              <tbody>
                {myCoApprovals.map((a) => (
                  <tr key={a.id}>
                    <td><Badge tone="info">{a.stage}</Badge></td>
                    <td>
                      <Link href={`/change-orders/${a.changeOrderId}`} className="text-accent">
                        {a.changeOrder.number} {a.changeOrder.title}
                      </Link>
                    </td>
                    <td><StatusBadge value={a.changeOrder.status} /></td>
                    <td>{fmtMoney(a.changeOrder.estimatedCost)}</td>
                    <td>{a.changeOrder.scheduleImpactDays}d</td>
                    <td>
                      <form action={decideChangeOrderApproval} className="flex gap-1">
                        <input type="hidden" name="approvalId" value={a.id} />
                        <button name="decision" value="APPROVED" className="btn-primary text-xs">Approve</button>
                        <button name="decision" value="MORE_INFO" className="btn text-xs">Info</button>
                        <button name="decision" value="REJECTED" className="btn-danger text-xs">Reject</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-medium mb-2">Pending with other approvers</h2>
        {otherCoApprovals.length === 0 ? (
          <p className="text-sm text-muted">Nothing pending elsewhere.</p>
        ) : (
          <div className="surface overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>Stage</th><th>Change order</th><th>Status</th><th>Cost</th><th>Created</th></tr>
              </thead>
              <tbody>
                {otherCoApprovals.map((a) => (
                  <tr key={a.id}>
                    <td><Badge tone="muted">{a.stage}</Badge></td>
                    <td><Link href={`/change-orders/${a.changeOrderId}`} className="text-accent">{a.changeOrder.number} {a.changeOrder.title}</Link></td>
                    <td><StatusBadge value={a.changeOrder.status} /></td>
                    <td>{fmtMoney(a.changeOrder.estimatedCost)}</td>
                    <td>{fmtDate(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">Other approvals (POs, drawings, schedule, access…)</h2>
        {otherApprovals.length === 0 ? (
          <p className="text-sm text-muted">No other approvals pending.</p>
        ) : (
          <div className="surface overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>Resource</th><th>Stage</th><th>Cost Δ</th><th>Schedule Δ</th><th>Due</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {otherApprovals.map((a) => (
                  <tr key={a.id}>
                    <td>{a.resource}</td>
                    <td><Badge tone="muted">{a.stage}</Badge></td>
                    <td>{fmtMoney(a.costImpact)}</td>
                    <td>{a.scheduleImpactDays}d</td>
                    <td>{fmtDate(a.dueDate)}</td>
                    <td className="text-muted">{a.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
