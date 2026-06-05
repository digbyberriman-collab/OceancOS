import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/utils";
import { FolderOpen, AlertTriangle, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.DOC_VIEW)) {
    return <EmptyState title="Forbidden" hint="Documents are restricted." />;
  }
  const docs = await prisma.document.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 500 });
  const showConfidential = hasPermission(user, PERMISSIONS.DOC_VIEW_CONFIDENTIAL);
  const visible = showConfidential ? docs : docs.filter((d) => !["CONTRACT", "INVOICE", "PO"].includes(d.type));

  const now = new Date();
  const expiredCount = visible.filter((d) => d.expiresAt && d.expiresAt < now).length;
  const expiringSoon = visible.filter(
    (d) =>
      d.expiresAt &&
      d.expiresAt >= now &&
      (d.expiresAt.getTime() - now.getTime()) / 86400000 < 30
  ).length;
  const approved = visible.filter((d) => d.approvalStatus === "APPROVED").length;

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="Document Control"
        title="Document register"
        subtitle="Versioned files with expiry, owner and audit trail."
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<FileText size={20} />}
          title="No documents"
          hint="Upload contracts, certs, manuals, RAMs, minutes."
        />
      ) : (
        <>
          {/* Summary stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat-card">
              <div className="stat-label">Total</div>
              <div className="stat-value text-white">{visible.length}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-line" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Approved</div>
              <div className="stat-value text-ok">{approved}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-ok/60" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Expiring soon</div>
              <div className="stat-value text-warn">{expiringSoon}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-warn/60" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Expired</div>
              <div className="stat-value text-bad">{expiredCount}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-bad/60" />
            </div>
          </div>

          <div className="surface overflow-hidden">
            {/* Top strip */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line bg-ink-850/40">
              <FolderOpen size={13} className="text-marine shrink-0" />
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                {visible.length} document{visible.length !== 1 ? "s" : ""}
              </span>
              {expiredCount > 0 && (
                <div className="ml-auto flex items-center gap-1.5 text-[11px] text-bad">
                  <AlertTriangle size={11} />
                  <span className="font-medium">{expiredCount} expired</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="w-28">Type</th>
                    <th className="w-28">Folder</th>
                    <th className="w-32">Status</th>
                    <th className="w-28 text-right">Expires</th>
                    <th className="w-28 text-right">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((d) => {
                    const isExpired = d.expiresAt && d.expiresAt < now;
                    const expiresNear =
                      d.expiresAt &&
                      !isExpired &&
                      (d.expiresAt.getTime() - now.getTime()) / 86400000 < 30;
                    return (
                      <tr key={d.id} className="row-hover group">
                        <td>
                          <span className="font-medium text-white group-hover:text-accent-bright transition-colors">
                            {d.name}
                          </span>
                        </td>
                        <td>
                          <span className="text-xs font-mono text-muted uppercase tracking-wide">
                            {d.type}
                          </span>
                        </td>
                        <td className="text-muted text-xs">{d.folder ?? "—"}</td>
                        <td>
                          <StatusBadge value={d.approvalStatus} />
                        </td>
                        <td className="text-right tnum">
                          {d.expiresAt ? (
                            <span
                              className={
                                isExpired
                                  ? "text-bad font-medium text-xs"
                                  : expiresNear
                                  ? "text-warn text-xs"
                                  : "text-muted text-xs"
                              }
                            >
                              {isExpired && <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />}
                              {fmtDate(d.expiresAt)}
                            </span>
                          ) : (
                            <span className="text-faint text-xs">—</span>
                          )}
                        </td>
                        <td className="text-right tnum text-muted text-xs">
                          {fmtDate(d.reviewAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
