import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/utils";
import { CREW_REQUEST_CATEGORIES, CREW_REQUEST_STATUSES, PRIORITIES } from "@/lib/enums";

export const dynamic = "force-dynamic";

export default async function CrewRequestsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; priority?: string; category?: string; overdue?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CR_VIEW)) {
    return <EmptyState title="Forbidden" hint="You don't have access to crew requests." />;
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

  return (
    <>
      <PageHeader
        title="Crew requests"
        subtitle="Defects, operational asks, safety issues — anything that needs an owner."
        actions={
          hasPermission(user, PERMISSIONS.CR_CREATE) ? (
            <Link href="/crew-requests/new" className="btn-primary">New request</Link>
          ) : null
        }
      />

      <form className="surface p-3 mb-4 flex flex-wrap gap-2 items-end" method="get">
        <label className="flex-1 min-w-[200px]">
          <span className="label-base">Search</span>
          <input name="q" defaultValue={searchParams.q} className="input-base" />
        </label>
        <label>
          <span className="label-base">Status</span>
          <select name="status" defaultValue={searchParams.status ?? ""} className="input-base">
            <option value="">All</option>
            {CREW_REQUEST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          <span className="label-base">Priority</span>
          <select name="priority" defaultValue={searchParams.priority ?? ""} className="input-base">
            <option value="">All</option>
            {PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          <span className="label-base">Category</span>
          <select name="category" defaultValue={searchParams.category ?? ""} className="input-base">
            <option value="">All</option>
            {CREW_REQUEST_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button className="btn">Apply</button>
        <Link href="/crew-requests" className="btn-ghost">Reset</Link>
      </form>

      {items.length === 0 ? (
        <EmptyState
          title="No requests match these filters"
          hint="Try clearing filters or raise a new request."
          action={
            hasPermission(user, PERMISSIONS.CR_CREATE) ? (
              <Link href="/crew-requests/new" className="btn-primary">New request</Link>
            ) : null
          }
        />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Number</th><th>Title</th><th>Category</th><th>Priority</th>
                <th>Status</th><th>Due</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="row-hover">
                  <td className="font-mono">
                    <Link href={`/crew-requests/${r.id}`} className="text-accent">{r.number}</Link>
                  </td>
                  <td>{r.title}</td>
                  <td>{r.category}</td>
                  <td><PriorityBadge value={r.priority} /></td>
                  <td><StatusBadge value={r.status} /></td>
                  <td className={r.dueDate && r.dueDate < new Date() && !["COMPLETED", "CLOSED", "REJECTED"].includes(r.status) ? "text-bad" : ""}>
                    {fmtDate(r.dueDate)}
                  </td>
                  <td>{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
