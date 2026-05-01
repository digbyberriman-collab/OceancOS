import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RisksPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.RSK_VIEW)) {
    return <EmptyState title="Forbidden" hint="Risk register is restricted." />;
  }
  const risks = await prisma.risk.findMany({ orderBy: [{ rating: "desc" }, { createdAt: "desc" }] });

  return (
    <>
      <PageHeader title="Risk register" subtitle="Identified risks with likelihood, impact and mitigation." />
      {risks.length === 0 ? (
        <EmptyState title="No risks logged" />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>Risk</th><th>Cat</th><th>L</th><th>I</th><th>Rating</th><th>Status</th><th>Cost</th><th>Sched</th><th>Due</th></tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="font-medium">{r.title}</div>
                    {r.description && <div className="text-xs text-muted">{r.description}</div>}
                  </td>
                  <td>{r.category}</td>
                  <td>{r.likelihood}</td>
                  <td>{r.impact}</td>
                  <td>
                    <Badge tone={r.rating >= 15 ? "bad" : r.rating >= 10 ? "warn" : r.rating >= 5 ? "info" : "muted"}>
                      {r.rating}
                    </Badge>
                  </td>
                  <td><StatusBadge value={r.status} /></td>
                  <td>{fmtMoney(r.costImpact)}</td>
                  <td>{r.scheduleImpactDays}d</td>
                  <td>{fmtDate(r.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
