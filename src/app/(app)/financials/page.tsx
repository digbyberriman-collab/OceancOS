import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { fmtMoney } from "@/lib/utils";
import { BudgetBar } from "@/components/data/BudgetBar";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinancialsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.FIN_VIEW)) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-5 w-5" />}
        title="Forbidden"
        hint="Financials are restricted."
      />
    );
  }
  const budgets = await prisma.budget.findMany({
    include: { category: true, project: { include: { vessel: true } } },
    orderBy: [{ project: { name: "asc" } }, { category: { name: "asc" } }],
  });
  const totals = budgets.reduce(
    (s, b) => {
      s.original += b.originalAmount;
      s.approved += b.approvedChanges;
      s.pending += b.pendingChanges;
      s.committed += b.committed;
      s.actual += b.actual;
      s.forecast += b.forecastFinal || b.originalAmount + b.approvedChanges;
      return s;
    },
    { original: 0, approved: 0, pending: 0, committed: 0, actual: 0, forecast: 0 }
  );

  const totalBaseline = totals.original + totals.approved;
  const overallVariance = totals.forecast - totalBaseline;
  const overBudget = overallVariance > 0;
  const scale = Math.max(totalBaseline, totals.forecast, 1);
  const actualPct = Math.min(100, Math.max(0, (totals.actual / scale) * 100));
  const forecastPct = Math.min(100, Math.max(0, (totals.forecast / scale) * 100));
  const baselinePct = Math.min(100, Math.max(0, (totalBaseline / scale) * 100));

  return (
    <>
      <PageHeader
        eyebrow="Project Finance"
        title="Financials"
        subtitle="Budgets, commitments, actuals and forecast across all active projects."
      />

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5 animate-fade-up" style={{ animationDelay: "60ms" }}>
        <div className="stat-card">
          <div className="stat-label">Original</div>
          <div className="stat-value tnum">{fmtMoney(totals.original)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved Δ</div>
          <div className="stat-value tnum">{fmtMoney(totals.approved)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Δ</div>
          <div className="stat-value text-warn tnum">{fmtMoney(totals.pending)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Committed</div>
          <div className="stat-value tnum">{fmtMoney(totals.committed)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Actual</div>
          <div className="stat-value tnum">{fmtMoney(totals.actual)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Forecast</div>
          <div className={`stat-value tnum ${overBudget ? "text-bad" : "text-ok"}`}>
            {fmtMoney(totals.forecast)}
          </div>
        </div>
      </div>

      {/* ── Aggregate spend bar ── */}
      <div className="surface p-5 mb-5 animate-fade-up" style={{ animationDelay: "100ms" }}>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <span className="eyebrow">Portfolio Overview</span>
            <p className="text-sm text-white font-medium mt-1.5">Total spend progress</p>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold tnum">
            {overBudget ? (
              <TrendingUp className="h-4 w-4 text-bad" aria-hidden />
            ) : (
              <TrendingDown className="h-4 w-4 text-ok" aria-hidden />
            )}
            <span className={overBudget ? "text-bad" : "text-ok"}>
              {overBudget ? "+" : "−"}{fmtMoney(Math.abs(overallVariance))} variance
            </span>
          </div>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-950 ring-1 ring-line-soft">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out ${
              overBudget
                ? "bg-gradient-to-r from-bad/60 to-bad"
                : "bg-gradient-to-r from-accent to-accent-bright"
            }`}
            style={{ width: `${forecastPct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-marine/80 transition-[width] duration-700 ease-out"
            style={{ width: `${actualPct}%` }}
          />
          <div
            aria-hidden
            className="absolute inset-y-[-2px] w-0.5 bg-white/70"
            style={{ left: `calc(${baselinePct}% - 1px)` }}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-marine/80" /> Actual spend
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${overBudget ? "bg-bad" : "bg-accent-bright"}`} /> Forecast
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-3 bg-white/60" /> Baseline
          </span>
        </div>
      </div>

      {/* ── Budget lines table ── */}
      {budgets.length === 0 ? (
        <EmptyState
          icon={<DollarSign className="h-5 w-5" />}
          title="No budget lines"
          hint="Seed sample data or create budgets via Admin."
        />
      ) : (
        <div className="surface overflow-hidden animate-fade-up" style={{ animationDelay: "140ms" }}>
          {/* Table section header */}
          <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-4">
            <span className="eyebrow">Budget Lines</span>
            <span className="text-[11px] text-faint tnum">
              {budgets.length} {budgets.length === 1 ? "line" : "lines"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left">Project / Vessel</th>
                  <th className="text-left">Category</th>
                  <th className="text-left">Dept</th>
                  <th className="text-right">Original</th>
                  <th className="text-right">Approved Δ</th>
                  <th className="text-right">Pending Δ</th>
                  <th className="text-right">Committed</th>
                  <th className="text-right">Actual</th>
                  <th className="text-right">Forecast</th>
                  <th className="text-right">Variance</th>
                  <th className="min-w-[100px]">Progress</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => {
                  const target = b.originalAmount + b.approvedChanges;
                  const fc = b.forecastFinal || target;
                  const variance = fc - target;
                  const variancePositive = variance > 0;
                  const varianceNeutral = variance === 0;
                  return (
                    <tr key={b.id} className="row-hover">
                      <td className="font-medium text-white">
                        {b.project.vessel.name}
                        <div className="text-xs text-muted font-normal mt-0.5">{b.project.name}</div>
                      </td>
                      <td className="text-white/90">{b.category.name}</td>
                      <td className="text-muted">{b.departmentCode ?? "—"}</td>
                      <td className="text-right tnum text-white/80">{fmtMoney(b.originalAmount)}</td>
                      <td className="text-right tnum text-white/80">{fmtMoney(b.approvedChanges)}</td>
                      <td className="text-right tnum text-warn">{fmtMoney(b.pendingChanges)}</td>
                      <td className="text-right tnum text-white/80">{fmtMoney(b.committed)}</td>
                      <td className="text-right tnum text-white/80">{fmtMoney(b.actual)}</td>
                      <td className={`text-right tnum font-medium ${variancePositive ? "text-bad" : "text-ok"}`}>
                        {fmtMoney(fc)}
                      </td>
                      <td
                        className={`text-right tnum font-semibold tabular-nums ${
                          variancePositive
                            ? "text-bad"
                            : varianceNeutral
                            ? "text-muted"
                            : "text-ok"
                        }`}
                      >
                        {variancePositive ? "+" : varianceNeutral ? "" : "−"}
                        {fmtMoney(Math.abs(variance))}
                      </td>
                      <td className="py-3">
                        <BudgetBar
                          actual={b.actual}
                          forecast={fc}
                          budget={target}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Totals footer */}
              <tfoot>
                <tr className="bg-ink-850/60 border-t border-line">
                  <td
                    colSpan={3}
                    className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted"
                  >
                    Portfolio Total
                  </td>
                  <td className="px-3.5 py-2.5 text-right tnum text-sm font-semibold text-white/90">
                    {fmtMoney(totals.original)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tnum text-sm font-semibold text-white/90">
                    {fmtMoney(totals.approved)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tnum text-sm font-semibold text-warn">
                    {fmtMoney(totals.pending)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tnum text-sm font-semibold text-white/90">
                    {fmtMoney(totals.committed)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right tnum text-sm font-semibold text-white/90">
                    {fmtMoney(totals.actual)}
                  </td>
                  <td
                    className={`px-3.5 py-2.5 text-right tnum text-sm font-bold ${
                      overBudget ? "text-bad" : "text-ok"
                    }`}
                  >
                    {fmtMoney(totals.forecast)}
                  </td>
                  <td
                    className={`px-3.5 py-2.5 text-right tnum text-sm font-bold ${
                      overBudget ? "text-bad" : overallVariance === 0 ? "text-muted" : "text-ok"
                    }`}
                  >
                    {overBudget ? "+" : overallVariance === 0 ? "" : "−"}
                    {fmtMoney(Math.abs(overallVariance))}
                  </td>
                  <td className="px-3.5 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
