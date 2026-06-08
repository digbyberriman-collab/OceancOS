import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/utils";
import { FileStack, GitBranch, Ruler } from "lucide-react";

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

  // Group by status for summary counts
  const approved = drawings.filter((d) => d.status === "APPROVED").length;
  const underReview = drawings.filter((d) => d.status === "UNDER_REVIEW").length;
  const draft = drawings.filter((d) => d.status === "DRAFT").length;

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="Technical"
        title="Drawings & plan approvals"
        subtitle="Versioned drawings with approval status. In-browser markup is planned."
      />

      {drawings.length === 0 ? (
        <EmptyState
          icon={<Ruler size={20} />}
          title="No drawings uploaded yet"
          hint="Upload a PDF or DWG to start the approval chain."
        />
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="stat-card">
              <div className="stat-label">Total</div>
              <div className="stat-value text-white">{drawings.length}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-line" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Approved</div>
              <div className="stat-value text-ok">{approved}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-ok/60" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Under review</div>
              <div className="stat-value text-accent-bright">{underReview}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-accent/60" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Draft</div>
              <div className="stat-value text-muted">{draft}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-line" />
            </div>
          </div>

          {/* Drawings table */}
          <div className="surface overflow-hidden">
            {/* Table header strip */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line bg-ink-850/40">
              <FileStack size={13} className="text-marine shrink-0" />
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                {drawings.length} drawing{drawings.length !== 1 ? "s" : ""}
              </span>
              <div className="ml-auto flex items-center gap-1.5 text-[11px] text-faint">
                <GitBranch size={11} className="text-marine" />
                <span>Rev = current revision</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-32">Number</th>
                    <th>Title</th>
                    <th className="w-32">Status</th>
                    <th className="w-20 text-center">Rev</th>
                    <th className="w-32 text-right">Last update</th>
                  </tr>
                </thead>
                <tbody>
                  {drawings.map((d) => {
                    const cur = d.revisions.find((r) => r.current) ?? d.revisions[0];
                    return (
                      <tr key={d.id} className="row-hover group">
                        <td>
                          <span className="font-mono text-xs text-marine tracking-tight">{d.number}</span>
                        </td>
                        <td>
                          <div className="flex items-baseline gap-2 min-w-0">
                            <span className="font-medium text-white group-hover:text-accent-bright transition-colors truncate">
                              {d.title}
                            </span>
                            {d.revisions.length > 1 && (
                              <span className="shrink-0 text-[10px] text-faint tnum">
                                {d.revisions.length} revs
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <StatusBadge value={d.status} />
                        </td>
                        <td className="text-center">
                          {cur?.rev ? (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-ink-800 border border-line text-[11px] font-mono text-muted">
                              {cur.rev}
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="text-right tnum text-muted text-xs">
                          {fmtDate(cur?.createdAt)}
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
