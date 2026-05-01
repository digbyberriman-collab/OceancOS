import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.SCH_VIEW)) {
    return <EmptyState title="Forbidden" hint="Schedule is restricted." />;
  }
  const [tasks, milestones] = await Promise.all([
    prisma.scheduleTask.findMany({ orderBy: { startDate: "asc" }, take: 200 }),
    prisma.milestone.findMany({ orderBy: { date: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Schedule" subtitle="Tasks, milestones and critical dates. Gantt view planned." />

      <div className="surface p-4 mb-4">
        <h2 className="text-sm font-medium mb-2">Milestones</h2>
        {milestones.length === 0 ? (
          <p className="text-sm text-muted">No milestones yet.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {milestones.map((m) => (
              <li key={m.id} className="border border-line rounded p-3 text-sm flex justify-between gap-3">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted">{m.type}</div>
                </div>
                <div className="text-right text-xs">
                  <div>{fmtDate(m.date)}</div>
                  <StatusBadge value={m.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface overflow-hidden">
        <table className="table-base">
          <thead>
            <tr><th>Task</th><th>Owner</th><th>Start</th><th>End</th><th>Status</th><th>Risk</th><th>Blockers</th></tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted py-8">No tasks scheduled.</td></tr>
            ) : tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="text-muted">{t.ownerId ?? "—"}</td>
                <td>{fmtDate(t.startDate)}</td>
                <td>{fmtDate(t.endDate)}</td>
                <td><StatusBadge value={t.status} /></td>
                <td>{t.riskLevel}</td>
                <td className="text-muted">{t.blockers ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
