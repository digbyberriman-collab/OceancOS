import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { fmtMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FinancialsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.FIN_VIEW)) {
    return <EmptyState title="Forbidden" hint="Financials are restricted." />;
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

  return (
    <>
      <PageHeader title="Financials" subtitle="Budgets, commitments, actuals and forecast." />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <div className="stat-card"><div className="stat-label">Original</div><div className="stat-value">{fmtMoney(totals.original)}</div></div>
        <div className="stat-card"><div className="stat-label">Approved Δ</div><div className="stat-value">{fmtMoney(totals.approved)}</div></div>
        <div className="stat-card"><div className="stat-label">Pending Δ</div><div className="stat-value text-warn">{fmtMoney(totals.pending)}</div></div>
        <div className="stat-card"><div className="stat-label">Committed</div><div className="stat-value">{fmtMoney(totals.committed)}</div></div>
        <div className="stat-card"><div className="stat-label">Actual</div><div className="stat-value">{fmtMoney(totals.actual)}</div></div>
        <div className="stat-card"><div className="stat-label">Forecast</div>
          <div className={`stat-value ${totals.forecast > totals.original + totals.approved ? "text-bad" : "text-ok"}`}>
            {fmtMoney(totals.forecast)}
          </div>
        </div>
      </div>

      {budgets.length === 0 ? (
        <EmptyState title="No budget lines" hint="Seed sample data or create budgets via Admin." />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>Project</th><th>Category</th><th>Dept</th><th>Original</th><th>Approved Δ</th><th>Pending Δ</th><th>Committed</th><th>Actual</th><th>Forecast</th><th>Variance</th></tr>
            </thead>
            <tbody>
              {budgets.map((b) => {
                const target = b.originalAmount + b.approvedChanges;
                const variance = (b.forecastFinal || target) - target;
                return (
                  <tr key={b.id}>
                    <td>{b.project.vessel.name} · {b.project.name}</td>
                    <td>{b.category.name}</td>
                    <td>{b.departmentCode ?? "—"}</td>
                    <td>{fmtMoney(b.originalAmount)}</td>
                    <td>{fmtMoney(b.approvedChanges)}</td>
                    <td className="text-warn">{fmtMoney(b.pendingChanges)}</td>
                    <td>{fmtMoney(b.committed)}</td>
                    <td>{fmtMoney(b.actual)}</td>
                    <td>{fmtMoney(b.forecastFinal)}</td>
                    <td className={variance > 0 ? "text-bad" : variance < 0 ? "text-ok" : ""}>{fmtMoney(variance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
