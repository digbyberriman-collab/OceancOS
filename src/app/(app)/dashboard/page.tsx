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
import { Donut } from "@/components/charts/Donut";
import { ProgressRings } from "@/components/charts/ProgressRings";
import { StepArea } from "@/components/charts/StepArea";
import { SERIES, DE_EMPHASIS } from "@/components/charts/palette";
import { cumulativeByDate } from "@/lib/charts/geometry";
import { projectTiming } from "@/lib/metrics/project";
import { getActiveProject, projectScope } from "@/lib/project";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  // Every count and list below reflects only the projects this user can
  // reach — a project-scoped user must never see a number on their own
  // dashboard that comes from work they cannot open. AuditLog is the one
  // exception: it carries no projectId at all (a genuinely cross-project
  // log), so it stays unscoped here.
  const scope = await projectScope(user.id);

  const [coOpen, coPending, crOpen, crOverdue, approvalsPending, milestonesUpcoming, risksOpen, recent] =
    await Promise.all([
      prisma.changeOrder.count({ where: { ...scope, status: { notIn: ["CLOSED", "CANCELLED", "REJECTED"] } } }),
      prisma.changeOrder.count({
        where: { ...scope, status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO"] } },
      }),
      prisma.crewRequest.count({ where: { ...scope, status: { notIn: ["COMPLETED", "CLOSED", "REJECTED"] } } }),
      prisma.crewRequest.count({
        where: { ...scope, dueDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CLOSED", "REJECTED"] } },
      }),
      prisma.approval.count({ where: { ...scope, status: "PENDING" } }),
      prisma.milestone.findMany({
        where: { ...scope, date: { gte: new Date() }, status: { not: "COMPLETED" } },
        orderBy: { date: "asc" },
        take: 5,
      }),
      prisma.risk.findMany({
        where: { ...scope, status: { in: ["OPEN", "ESCALATED"] } },
        orderBy: { rating: "desc" },
        take: 5,
      }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    ]);

  // Budget rollup
  const budgets = await prisma.budget.findMany({ where: scope });
  const original = budgets.reduce((s, b) => s + b.originalAmount, 0);
  const approved = budgets.reduce((s, b) => s + b.approvedChanges, 0);
  const pending = budgets.reduce((s, b) => s + b.pendingChanges, 0);
  const actual = budgets.reduce((s, b) => s + b.actual, 0);
  const forecast = budgets.reduce((s, b) => s + (b.forecastFinal || b.originalAmount + b.approvedChanges), 0);

  const myApprovals = await prisma.changeOrderApproval.findMany({
    where: { decision: "PENDING", changeOrder: scope },
    include: { changeOrder: true },
    take: 5,
  });

  const canViewFinancials = hasPermission(user, PERMISSIONS.FIN_VIEW);

  // ---- Charts -------------------------------------------------------------
  const activeProject = await getActiveProject(user.id);

  const changeOrders = await prisma.changeOrder.findMany({
    where: activeProject ? { projectId: activeProject.id } : scope,
    select: { status: true, estimatedCost: true, approvedCost: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Statuses are states, so they wear the status colours rather than arbitrary
  // series hues, and cancelled work is deliberately recessive.
  const STATUS_GROUPS: { label: string; colour: string; statuses: string[] }[] = [
    { label: "Draft and submitted", colour: SERIES.new, statuses: ["DRAFT", "SUBMITTED"] },
    { label: "Awaiting decision", colour: SERIES.pending, statuses: ["UNDER_REVIEW", "MORE_INFO"] },
    { label: "Approved and in progress", colour: SERIES.accepted, statuses: ["APPROVED", "IN_PROGRESS", "COMPLETED", "CLOSED"] },
    { label: "Rejected or cancelled", colour: DE_EMPHASIS, statuses: ["REJECTED", "CANCELLED"] },
  ];

  const statusSlices = STATUS_GROUPS.map((group) => ({
    label: group.label,
    color: group.colour,
    value: changeOrders.filter((co) => group.statuses.includes(co.status)).length,
  })).filter((slice) => slice.value > 0);

  // Work done is value-weighted: a large job barely started must not be
  // outranked by a small finished one. Until the yard reports a percentage per
  // job (Phase 1), completion is inferred from the change-order status.
  const COMPLETION_BY_STATUS: Record<string, number> = {
    COMPLETED: 100, CLOSED: 100, IN_PROGRESS: 50, APPROVED: 10,
  };
  const committed = changeOrders.filter((co) => co.approvedCost != null);
  const workPct = committed.length
    ? Math.round(
        committed.reduce((sum, co) => sum + (COMPLETION_BY_STATUS[co.status] ?? 0) * (co.approvedCost ?? 0), 0) /
          Math.max(1, committed.reduce((sum, co) => sum + (co.approvedCost ?? 0), 0))
      )
    : null;

  const timing = projectTiming({
    arrivalDate: activeProject?.arrivalDate,
    departureDate: activeProject?.departureDate,
  });

  // Cumulative value over time, split by whether the money is still a proposal
  // or has been approved. This is the shape the yard quote history takes in
  // Phase 4, on the data that exists today.
  const PENDING_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "MORE_INFO"];
  const APPROVED_STATUSES = ["APPROVED", "IN_PROGRESS", "COMPLETED", "CLOSED"];
  const valueSeries = [
    {
      key: "pending",
      label: "Awaiting approval",
      color: SERIES.pending,
      points: cumulativeByDate(
        changeOrders
          .filter((co) => PENDING_STATUSES.includes(co.status))
          .map((co) => ({ at: co.createdAt, amount: co.estimatedCost }))
      ),
    },
    {
      key: "approved",
      label: "Approved",
      color: SERIES.accepted,
      points: cumulativeByDate(
        changeOrders
          .filter((co) => APPROVED_STATUSES.includes(co.status))
          .map((co) => ({ at: co.createdAt, amount: co.approvedCost ?? co.estimatedCost }))
      ),
    },
  ];

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

      {/* Charts */}
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-6 animate-fade-up"
        style={{ animationDelay: "90ms" }}
      >
        <Panel title="Change orders by status" link={{ href: "/change-orders", label: "All change orders" }}>
          <Donut slices={statusSlices} centreLabel="change orders" format="count" />
        </Panel>

        <Panel title="Progress against the yard period">
          {activeProject?.arrivalDate && activeProject?.departureDate ? (
            <ProgressRings workPct={workPct} timePct={timing.timePct} />
          ) : (
            <p className="text-sm text-muted">
              Set arrival and departure dates on the project to track progress against the clock.
            </p>
          )}
        </Panel>
      </div>

      {canViewFinancials && (
        <div className="mb-6 animate-fade-up" style={{ animationDelay: "150ms" }}>
          <Panel title="Cumulative change-order value">
            <StepArea
              series={valueSeries}
              format="compactMoney"
              currency={activeProject?.currency ?? "EUR"}
            />
          </Panel>
        </div>
      )}

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
