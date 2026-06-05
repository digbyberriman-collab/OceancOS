import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/utils";
import { CREW_REQUEST_CATEGORIES, CREW_REQUEST_STATUSES, PRIORITIES } from "@/lib/enums";
import { FilterBar, FilterField } from "@/components/workflow/FilterBar";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CrewRequestsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; priority?: string; category?: string; overdue?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CR_VIEW)) {
    return (
      <EmptyState
        title="Access Restricted"
        hint="You don't have access to crew requests."
        icon={<Users size={20} />}
      />
    );
  }

  const where: any = { archivedAt: null };
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.priority) where.priority = searchParams.priority;
  if (searchParams.category) where.category = searchParams.category;
  if (searchParams.overdue) {
    where.dueDate = { lt: new Date() };
    where.status = { notIn: ["COMPLETED", "CLOSED", "REJECTED"] };
  }
  if (searchParams.q) {
    where.OR = [
      { number: { contains: searchParams.q } },
      { title: { contains: searchParams.q } },
      { description: { contains: searchParams.q } },
    ];
  }

  const items = await prisma.crewRequest.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const isFiltered = !!(searchParams.q || searchParams.status || searchParams.priority || searchParams.category || searchParams.overdue);
  const now = new Date();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Crew Requests"
        eyebrow="Workflow"
        subtitle="Defects, operational asks, safety issues — anything that needs an owner."
        actions={
          hasPermission(user, PERMISSIONS.CR_CREATE) ? (
            <Link href="/crew-requests/new" className="btn-primary btn-lg">
              New Request
            </Link>
          ) : null
        }
      />

      <FilterBar
        resetHref="/crew-requests"
        resultCount={items.length}
        resultLabel="request"
      >
        <FilterField label="Search" flex>
          <input
            name="q"
            defaultValue={searchParams.q}
            className="input-base"
            placeholder="Number, title…"
          />
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={searchParams.status ?? ""} className="input-base">
            <option value="">All statuses</option>
            {CREW_REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Priority">
          <select name="priority" defaultValue={searchParams.priority ?? ""} className="input-base">
            <option value="">All priorities</option>
            {PRIORITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Category">
          <select name="category" defaultValue={searchParams.category ?? ""} className="input-base">
            <option value="">All categories</option>
            {CREW_REQUEST_CATEGORIES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState
          title={isFiltered ? "No requests match these filters" : "No crew requests yet"}
          hint={
            isFiltered
              ? "Try clearing some filters, or reset to see all requests."
              : "Raise a new request to track defects, operational items and safety issues."
          }
          icon={<Users size={20} />}
          action={
            hasPermission(user, PERMISSIONS.CR_CREATE) ? (
              <Link href="/crew-requests/new" className="btn-primary">New Request</Link>
            ) : null
          }
        />
      ) : (
        <div className="surface overflow-hidden animate-fade-in">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-28">Number</th>
                <th>Title</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th className="text-right">Due</th>
                <th className="text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const overdue =
                  r.dueDate &&
                  r.dueDate < now &&
                  !["COMPLETED", "CLOSED", "REJECTED"].includes(r.status);
                return (
                  <tr key={r.id} className="row-hover">
                    <td className="font-mono text-xs">
                      <Link
                        href={`/crew-requests/${r.id}`}
                        className="text-accent hover:text-accent-bright transition-colors"
                      >
                        {r.number}
                      </Link>
                    </td>
                    <td className="max-w-xs">
                      <Link
                        href={`/crew-requests/${r.id}`}
                        className="font-medium text-white hover:text-accent-bright transition-colors line-clamp-1"
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-muted text-xs">{r.category.replace(/_/g, " ")}</span>
                    </td>
                    <td>
                      <PriorityBadge value={r.priority} />
                    </td>
                    <td>
                      <StatusBadge value={r.status} />
                    </td>
                    <td className={`text-right tnum text-xs ${overdue ? "text-bad font-medium" : "text-muted"}`}>
                      {fmtDate(r.dueDate)}
                      {overdue && <span className="ml-1 badge badge-bad text-[10px] py-0">Overdue</span>}
                    </td>
                    <td className="text-right tnum text-xs text-muted">{fmtDate(r.createdAt)}</td>
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
