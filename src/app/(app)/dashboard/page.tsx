import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/Badge";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [coOpen, coPending, crOpen, crOverdue, approvalsPending, milestonesUpcoming, risksOpen, recent] =
    await Promise.all([
      prisma.changeOrder.count({ where: { status: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] } } }),
      prisma.changeOrder.count({
        where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO"] } },
      }),
      prisma.crewRequest.count({ where: { status: { notIn: ["COMPLETED", "CLOSED", "REJECTED"] } } }),
      prisma.crewRequest.count({
        where: { dueDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CLOSED", "REJECTED"] } },
      }),
      prisma.approval.count({ where: { status: "PENDING" } }),
      prisma.milestone.findMany({
        where: { date: { gte: new Date() }, status: { not: "COMPLETED" } },
        orderBy: { date: "asc" },
        take: 5,
      }),
      prisma.risk.findMany({
        where: { status: { in: ["OPEN", "ESCALATED"] } },
        orderBy: { rating: "desc" },
        take: 5,
      }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    ]);

  // Budget rollup
  const budgets = await prisma.budget.findMany();
  const original = budgets.reduce((s, b) => s + b.originalAmount, 0);
  const approved = budgets.reduce((s, b) => s + b.approvedChanges, 0);
  const pending = budgets.reduce((s, b) => s + b.pendingChanges, 0);
  const actual = budgets.reduce((s, b) => s + b.actual, 0);
  const forecast = budgets.reduce((s, b) => s + (b.forecastFinal || b.originalAmount + b.approvedChanges), 0);

  const myApprovals = await prisma.changeOrderApproval.findMany({
    where: { decision: "PENDING" },
    include: { changeOrder: true },
    take: 5,
  });

  return (
    <>
      <PageHeader
        title="Project dashboard"
        subtitle="Live operational view across all active vessels and projects."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Open change orders" value={coOpen} href="/change-orders" />
        <Stat label="Awaiting approval" value={coPending + approvalsPending} href="/approvals" tone="warn" />
        <Stat label="Open crew requests" value={crOpen} href="/crew-requests" />
        <Stat label="Overdue items" value={crOverdue} tone={crOverdue > 0 ? "bad" : "muted"} href="/crew-requests?overdue=1" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="surface p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Budget status</h2>
            {hasPermission(user, PERMISSIONS.FIN_VIEW) ? (
              <Link href="/financials" className="text-xs text-accent">Open financials →</Link>
            ) : null}
          </div>
          {hasPermission(user, PERMISSIONS.FIN_VIEW) ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <Cell label="Original" value={fmtMoney(original)} />
              <Cell label="Approved Δ" value={fmtMoney(approved)} />
              <Cell label="Pending Δ" value={fmtMoney(pending)} tone="warn" />
              <Cell label="Actual" value={fmtMoney(actual)} />
              <Cell
                label="Forecast"
                value={fmtMoney(forecast)}
                tone={forecast > original + approved ? "bad" : "ok"}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">You don't have access to financial data.</p>
          )}
        </div>

        <div className="surface p-4">
          <h2 className="text-sm font-medium mb-3">Upcoming milestones</h2>
          {milestonesUpcoming.length === 0 ? (
            <p className="text-sm text-muted">No milestones scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {milestonesUpcoming.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span>{m.name}</span>
                  <span className="text-muted">{fmtDate(m.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Approvals waiting on you and others</h2>
            <Link href="/approvals" className="text-xs text-accent">All approvals →</Link>
          </div>
          {myApprovals.length === 0 ? (
            <p className="text-sm text-muted">All caught up.</p>
          ) : (
            <table className="table-base">
              <thead>
                <tr><th>Stage</th><th>Change order</th><th>Cost</th><th>Status</th></tr>
              </thead>
              <tbody>
                {myApprovals.map((a) => (
                  <tr key={a.id}>
                    <td><Badge tone="info">{a.stage}</Badge></td>
                    <td>
                      <Link href={`/change-orders/${a.changeOrder.id}`} className="text-accent">
                        {a.changeOrder.number} {a.changeOrder.title}
                      </Link>
                    </td>
                    <td>{fmtMoney(a.changeOrder.estimatedCost)}</td>
                    <td><StatusBadge value={a.changeOrder.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Top risks</h2>
            <Link href="/risks" className="text-xs text-accent">Risk register →</Link>
          </div>
          {risksOpen.length === 0 ? (
            <p className="text-sm text-muted">No open risks.</p>
          ) : (
            <table className="table-base">
              <thead>
                <tr><th>Risk</th><th>Rating</th><th>Status</th></tr>
              </thead>
              <tbody>
                {risksOpen.map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td><PriorityBadge value={r.rating >= 15 ? "CRITICAL" : r.rating >= 10 ? "HIGH" : r.rating >= 5 ? "MEDIUM" : "LOW"} /></td>
                    <td><StatusBadge value={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="surface p-4">
        <h2 className="text-sm font-medium mb-3">Recent activity</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <ul className="text-sm space-y-1.5">
            {recent.map((a) => (
              <li key={a.id} className="text-muted">
                <span className="text-white">{a.action}</span> on {a.resource}
                {a.resourceId ? ` (${a.resourceId.slice(0, 8)})` : ""} — {fmtDate(a.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  href,
  tone = "muted",
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "ok" | "warn" | "bad" | "muted";
}) {
  const cls =
    tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-white";
  const Wrapper: any = href ? Link : "div";
  const props: any = href ? { href, className: "stat-card surface-hover block" } : { className: "stat-card" };
  return (
    <Wrapper {...props}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${cls}`}>{value}</div>
    </Wrapper>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const cls = tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : tone === "ok" ? "text-ok" : "text-white";
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}
