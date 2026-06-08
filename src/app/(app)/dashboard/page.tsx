import Link from "next/link";
import {
  FileStack,
  ClipboardCheck,
  Users,
  AlertTriangle,
  CalendarClock,
  Activity,
  ShieldAlert,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge, Badge } from "@/components/ui/Badge";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/StatCard";
import { BudgetSummary } from "@/components/dashboard/BudgetSummary";
import { Panel } from "@/components/dashboard/Panel";

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

  const canViewFinancials = hasPermission(user, PERMISSIONS.FIN_VIEW);

  return (
    <>
      <PageHeader
        eyebrow="Command centre"
        title="Project dashboard"
        subtitle="Live operational view across all active vessels and projects."
      />

      {/* Stat row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6 animate-fade-up">
        <StatCard label="Open change orders" value={coOpen} href="/change-orders" icon={FileStack} />
        <StatCard
          label="Awaiting approval"
          value={coPending + approvalsPending}
          href="/approvals"
          tone="warn"
          icon={ClipboardCheck}
        />
        <StatCard label="Open crew requests" value={crOpen} href="/crew-requests" icon={Users} />
        <StatCard
          label="Overdue items"
          value={crOverdue}
          tone={crOverdue > 0 ? "bad" : "muted"}
          href="/crew-requests?overdue=1"
          icon={AlertTriangle}
        />
      </div>

      {/* Budget + milestones */}
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-3 mb-6 animate-fade-up"
        style={{ animationDelay: "60ms" }}
      >
        <Panel
          title="Budget status"
          link={canViewFinancials ? { href: "/financials", label: "Open financials" } : undefined}
          className="lg:col-span-2"
        >
          {canViewFinancials ? (
            <BudgetSummary
              original={original}
              approved={approved}
              pending={pending}
              actual={actual}
              forecast={forecast}
            />
          ) : (
            <p className="text-sm text-muted">You don&apos;t have access to financial data.</p>
          )}
        </Panel>

        <Panel title="Upcoming milestones">
          {milestonesUpcoming.length === 0 ? (
            <p className="text-sm text-muted">No milestones scheduled.</p>
          ) : (
            <ol className="relative space-y-3.5 pl-1">
              {milestonesUpcoming.map((m) => (
                <li key={m.id} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-marine/10 text-marine ring-1 ring-marine/20"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{m.name}</p>
                    <p className="mt-0.5 text-xs text-muted tnum">{fmtDate(m.date)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* Approvals + risks */}
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-6 animate-fade-up"
        style={{ animationDelay: "120ms" }}
      >
        <Panel
          title="Approvals waiting on you and others"
          link={{ href: "/approvals", label: "All approvals" }}
        >
          {myApprovals.length === 0 ? (
            <p className="text-sm text-muted">All caught up.</p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Change order</th>
                    <th className="text-right">Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myApprovals.map((a) => (
                    <tr key={a.id} className="row-hover">
                      <td>
                        <Badge tone="info">{a.stage}</Badge>
                      </td>
                      <td>
                        <Link
                          href={`/change-orders/${a.changeOrder.id}`}
                          className="font-medium text-accent-bright transition-colors hover:text-marine"
                        >
                          <span className="tnum text-muted">{a.changeOrder.number}</span>{" "}
                          {a.changeOrder.title}
                        </Link>
                      </td>
                      <td className="text-right tnum text-white">
                        {fmtMoney(a.changeOrder.estimatedCost)}
                      </td>
                      <td>
                        <StatusBadge value={a.changeOrder.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Top risks" link={{ href: "/risks", label: "Risk register" }}>
          {risksOpen.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <ShieldAlert className="h-4 w-4 text-ok" />
              No open risks.
            </div>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>Rating</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {risksOpen.map((r) => (
                    <tr key={r.id} className="row-hover">
                      <td className="font-medium text-white">{r.title}</td>
                      <td>
                        <PriorityBadge
                          value={
                            r.rating >= 15
                              ? "CRITICAL"
                              : r.rating >= 10
                              ? "HIGH"
                              : r.rating >= 5
                              ? "MEDIUM"
                              : "LOW"
                          }
                        />
                      </td>
                      <td>
                        <StatusBadge value={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* Recent activity */}
      <div className="animate-fade-up" style={{ animationDelay: "180ms" }}>
        <Panel title="Recent activity">
          {recent.length === 0 ? (
            <p className="text-sm text-muted">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink-800 text-muted ring-1 ring-line"
                  >
                    <Activity className="h-3.5 w-3.5" />
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm text-muted">
                    <span className="font-medium text-white">{a.action}</span> on {a.resource}
                    {a.resourceId ? (
                      <span className="tnum text-faint"> ({a.resourceId.slice(0, 8)})</span>
                    ) : (
                      ""
                    )}
                  </p>
                  <span className="shrink-0 text-xs text-faint tnum">{fmtDate(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
