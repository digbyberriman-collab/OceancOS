import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DrawingsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.DRW_VIEW)) {
    return <EmptyState title="Forbidden" hint="Drawings are restricted." />;
  }
  const drawings = await prisma.drawing.findMany({
    include: { revisions: { orderBy: { createdAt: "desc" } } },
    orderBy: { number: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Drawings & plan approvals"
        subtitle="Versioned drawings with approval status. In-browser markup is planned."
      />
      {drawings.length === 0 ? (
        <EmptyState title="No drawings uploaded yet" hint="Upload a PDF or DWG to start the approval chain." />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Number</th><th>Title</th><th>Status</th><th>Current rev</th><th>Last update</th></tr></thead>
            <tbody>
              {drawings.map((d) => {
                const cur = d.revisions.find((r) => r.current) ?? d.revisions[0];
                return (
                  <tr key={d.id}>
                    <td className="font-mono">{d.number}</td>
                    <td>{d.title}</td>
                    <td><StatusBadge value={d.status} /></td>
                    <td>{cur?.rev ?? "—"}</td>
                    <td>{fmtDate(cur?.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
