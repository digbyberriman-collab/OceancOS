import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { fmtDate, fmtMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContractorsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CON_VIEW)) {
    return <EmptyState title="Forbidden" hint="Contractor records are restricted." />;
  }
  const items = await prisma.contractor.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Contractors" subtitle="Companies, contacts, contract values and insurance status." />
      {items.length === 0 ? (
        <EmptyState title="No contractors" hint="Add a contractor to track scope, value and insurance." />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Name</th><th>Trade</th><th>Contact</th><th>Email</th><th>Contract</th><th>Insurance</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.trade ?? "—"}</td>
                  <td>{c.contact ?? "—"}</td>
                  <td className="text-muted">{c.email ?? "—"}</td>
                  <td>{fmtMoney(c.contractValue)}</td>
                  <td className={c.insuranceExpiresAt && c.insuranceExpiresAt < new Date() ? "text-bad" : ""}>
                    {fmtDate(c.insuranceExpiresAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
