import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { CHANGE_ORDER_STATUSES, PRIORITIES } from "@/lib/enums";

export const dynamic = "force-dynamic";

export default async function ChangeOrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; priority?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CO_VIEW)) {
    return <EmptyState title="Forbidden" hint="You don't have access to change orders." />;
  }
  const where: any = { archivedAt: null };
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.priority) where.priority = searchParams.priority;
  if (searchParams.q) {
    where.OR = [
      { title: { contains: searchParams.q } },
      { number: { contains: searchParams.q } },
      { description: { contains: searchParams.q } },
    ];
  }

  const cos = await prisma.changeOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Change orders"
        subtitle="Track scope changes, costs and approvals."
        actions={
          hasPermission(user, PERMISSIONS.CO_CREATE) ? (
            <Link href="/change-orders/new" className="btn-primary">New change order</Link>
          ) : null
        }
      />

      <form className="surface p-3 mb-4 flex flex-wrap gap-2 items-end" method="get">
        <label className="flex-1 min-w-[200px]">
          <span className="label-base">Search</span>
          <input name="q" defaultValue={searchParams.q} className="input-base" placeholder="CO number, title…" />
        </label>
        <label>
          <span className="label-base">Status</span>
          <select name="status" defaultValue={searchParams.status ?? ""} className="input-base">
            <option value="">All</option>
            {CHANGE_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          <span className="label-base">Priority</span>
          <select name="priority" defaultValue={searchParams.priority ?? ""} className="input-base">
            <option value="">All</option>
            {PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button className="btn">Apply</button>
        <Link href="/change-orders" className="btn-ghost">Reset</Link>
      </form>

      {cos.length === 0 ? (
        <EmptyState
          title="No change orders match these filters"
          hint="Adjust the filters or create a new change order."
          action={
            hasPermission(user, PERMISSIONS.CO_CREATE) ? (
              <Link href="/change-orders/new" className="btn-primary">New change order</Link>
            ) : null
          }
        />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Cost</th>
                <th>Schedule Δ</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {cos.map((co) => (
                <tr key={co.id} className="row-hover">
                  <td className="font-mono">
                    <Link href={`/change-orders/${co.id}`} className="text-accent">{co.number}</Link>
                  </td>
                  <td>{co.title}</td>
                  <td><StatusBadge value={co.status} /></td>
                  <td><PriorityBadge value={co.priority} /></td>
                  <td>{fmtMoney(co.approvedCost ?? co.estimatedCost)}</td>
                  <td>{co.scheduleImpactDays > 0 ? `+${co.scheduleImpactDays}d` : co.scheduleImpactDays < 0 ? `${co.scheduleImpactDays}d` : "—"}</td>
                  <td>{fmtDate(co.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
