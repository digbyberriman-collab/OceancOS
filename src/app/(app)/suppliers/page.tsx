import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requireUser();
  const suppliers = await prisma.supplier.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Suppliers" subtitle="Linked to purchase orders and invoices." />
      {suppliers.length === 0 ? (
        <EmptyState title="No suppliers" />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td><td>{s.contact ?? "—"}</td>
                  <td className="text-muted">{s.email ?? "—"}</td><td>{s.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
