import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.DOC_VIEW)) {
    return <EmptyState title="Forbidden" hint="Documents are restricted." />;
  }
  const docs = await prisma.document.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 500 });
  const showConfidential = hasPermission(user, PERMISSIONS.DOC_VIEW_CONFIDENTIAL);
  const visible = showConfidential ? docs : docs.filter((d) => !["CONTRACT", "INVOICE", "PO"].includes(d.type));

  return (
    <>
      <PageHeader title="Document control" subtitle="Versioned files with expiry, owner and audit trail." />
      {visible.length === 0 ? (
        <EmptyState title="No documents" hint="Upload contracts, certs, manuals, RAMs, minutes." />
      ) : (
        <div className="surface overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Name</th><th>Type</th><th>Folder</th><th>Status</th><th>Expires</th><th>Review</th></tr></thead>
            <tbody>
              {visible.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.type}</td>
                  <td className="text-muted">{d.folder ?? "—"}</td>
                  <td><StatusBadge value={d.approvalStatus} /></td>
                  <td className={d.expiresAt && d.expiresAt < new Date() ? "text-bad" : ""}>{fmtDate(d.expiresAt)}</td>
                  <td>{fmtDate(d.reviewAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
