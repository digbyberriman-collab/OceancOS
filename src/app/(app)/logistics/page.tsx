import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtDateTime, fmtMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LogisticsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.LOG_VIEW)) {
    return <EmptyState title="Forbidden" hint="Logistics is restricted." />;
  }
  const items = await prisma.logisticsItem.findMany({
    orderBy: [{ whenAt: "asc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader title="Logistics" subtitle="Travel, deliveries, dock movements, provisioning." />
      {items.length === 0 ? (
        <EmptyState title="No logistics items yet" hint="Create one to schedule access, transport or deliveries." />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>Type</th><th>When</th><th>Status</th><th>Cost</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id}>
                  <td>{l.type}</td>
                  <td>{fmtDateTime(l.whenAt)}</td>
                  <td><StatusBadge value={l.status} /></td>
                  <td>{fmtMoney(l.cost)}</td>
                  <td className="text-muted">{l.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
