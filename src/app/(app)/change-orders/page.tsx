import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { CHANGE_ORDER_STATUSES, PRIORITIES } from "@/lib/enums";
import { FilterBar, FilterField } from "@/components/workflow/FilterBar";
import { ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChangeOrdersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; priority?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CO_VIEW)) {
    return (
      <EmptyState
        title="Access restricted"
        hint="You don't have permission to view change orders."
        icon={<ClipboardList size={20} />}
      />
    );
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

  const isFiltered = !!(searchParams.q || searchParams.status || searchParams.priority);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Change Orders"
        eyebrow="Workflow"
        subtitle="Track scope changes, costs and approvals across the project."
        actions={
          hasPermission(user, PERMISSIONS.CO_CREATE) ? (
            <Link href="/change-orders/new" className="btn-primary btn-lg">
              New Change Order
            </Link>
          ) : null
        }
      />

      <FilterBar
        resetHref="/change-orders"
        resultCount={cos.length}
        resultLabel="change order"
      >
        <FilterField label="Search" flex>
          <input
            name="q"
            defaultValue={searchParams.q}
            className="input-base"
            placeholder="CO number, title…"
          />
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={searchParams.status ?? ""} className="input-base">
            <option value="">All statuses</option>
            {CHANGE_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Priority">
          <select name="priority" defaultValue={searchParams.priority ?? ""} className="input-base">
            <option value="">All priorities</option>
            {PRIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {cos.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No change orders match these filters" : "No change orders yet"}
          hint={
            isFiltered
              ? "Try adjusting the filters above, or reset to see all change orders."
              : "Create your first change order to track scope, cost and schedule impact."
          }
          icon={<ClipboardList size={20} />}
          action={
            hasPermission(user, PERMISSIONS.CO_CREATE) ? (
              <Link href="/change-orders/new" className="btn-primary">
                New Change Order
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="surface overflow-hidden animate-fade-in">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-32">Number</th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th className="text-right">Cost</th>
                <th className="text-right">Schedule&nbsp;Δ</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {cos.map((co) => {
                const schedDays = co.scheduleImpactDays ?? 0;
                return (
                  <tr key={co.id} className="row-hover">
                    <td className="font-mono text-xs">
                      <Link
                        href={`/change-orders/${co.id}`}
                        className="text-accent hover:text-accent-bright transition-colors"
                      >
                        {co.number}
                      </Link>
                    </td>
                    <td className="max-w-xs">
                      <Link
                        href={`/change-orders/${co.id}`}
                        className="font-medium text-white hover:text-accent-bright transition-colors line-clamp-1"
                      >
                        {co.title}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge value={co.status} />
                    </td>
                    <td>
                      <PriorityBadge value={co.priority} />
                    </td>
                    <td className="text-right tnum">
                      {fmtMoney(co.approvedCost ?? co.estimatedCost)}
                    </td>
                    <td className="text-right tnum">
                      {schedDays > 0 ? (
                        <span className="text-warn">+{schedDays}d</span>
                      ) : schedDays < 0 ? (
                        <span className="text-ok">{schedDays}d</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-muted text-xs tnum">{fmtDate(co.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
