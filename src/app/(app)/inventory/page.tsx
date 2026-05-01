import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string; status?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.INV_VIEW)) {
    return <EmptyState title="Forbidden" hint="Inventory is restricted." />;
  }
  const where: any = { archivedAt: null };
  if (searchParams.q) {
    where.OR = [
      { name: { contains: searchParams.q } },
      { manufacturer: { contains: searchParams.q } },
      { model: { contains: searchParams.q } },
      { serial: { contains: searchParams.q } },
    ];
  }
  if (searchParams.category) where.category = searchParams.category;
  if (searchParams.status) where.status = searchParams.status;

  const items = await prisma.inventoryItem.findMany({ where, orderBy: { name: "asc" }, take: 500 });

  return (
    <>
      <PageHeader title="Inventory & equipment" subtitle="Equipment lists, spares, tools and consumables." />
      <form className="surface p-3 mb-4 flex flex-wrap gap-2 items-end" method="get">
        <label className="flex-1 min-w-[200px]">
          <span className="label-base">Search</span>
          <input name="q" defaultValue={searchParams.q} className="input-base" />
        </label>
        <button className="btn">Apply</button>
      </form>
      {items.length === 0 ? (
        <EmptyState title="No inventory items" hint="Seed sample data or import from Excel." />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead>
              <tr><th>Name</th><th>Cat</th><th>Loc</th><th>Qty</th><th>Min</th><th>Status</th><th>Replacement</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}<div className="text-xs text-muted">{i.manufacturer ?? ""} {i.model ?? ""}</div></td>
                  <td>{i.category}</td>
                  <td>{i.location ?? "—"}</td>
                  <td className={i.qty <= i.minStock ? "text-warn" : ""}>{i.qty}</td>
                  <td className="text-muted">{i.minStock}</td>
                  <td><StatusBadge value={i.status} /></td>
                  <td>{fmtMoney(i.replacementCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
