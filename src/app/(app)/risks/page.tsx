import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

function ratingTone(rating: number): "bad" | "warn" | "info" | "muted" {
  if (rating >= 15) return "bad";
  if (rating >= 10) return "warn";
  if (rating >= 5) return "info";
  return "muted";
}

function ratingLabel(rating: number) {
  if (rating >= 15) return "Critical";
  if (rating >= 10) return "High";
  if (rating >= 5) return "Medium";
  return "Low";
}

export default async function RisksPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.RSK_VIEW)) {
    return <EmptyState title="Forbidden" hint="Risk register is restricted." />;
  }
  const risks = await prisma.risk.findMany({ orderBy: [{ rating: "desc" }, { createdAt: "desc" }] });

  const critical = risks.filter((r) => r.rating >= 15).length;
  const high = risks.filter((r) => r.rating >= 10 && r.rating < 15).length;
  const medium = risks.filter((r) => r.rating >= 5 && r.rating < 10).length;
  const low = risks.filter((r) => r.rating < 5).length;

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="Risk Management"
        title="Risk register"
        subtitle="Identified risks with likelihood, impact and mitigation."
      />

      {risks.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={20} />}
          title="No risks logged"
          hint="Add risks to track likelihood, impact and mitigation status."
        />
      ) : (
        <>
          {/* Severity summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Critical", count: critical, tone: "bad" as const, range: "15–25", barColor: "bg-bad/60" },
              { label: "High", count: high, tone: "warn" as const, range: "10–14", barColor: "bg-warn/60" },
              { label: "Medium", count: medium, tone: "info" as const, range: "5–9", barColor: "bg-accent/60" },
              { label: "Low", count: low, tone: "muted" as const, range: "1–4", barColor: "bg-line" },
            ].map(({ label, count, tone, range, barColor }) => (
              <div key={label} className="stat-card">
                <div className="stat-label">{label}</div>
                <div className={`stat-value ${
                  tone === "bad" ? "text-bad" :
                  tone === "warn" ? "text-warn" :
                  tone === "info" ? "text-accent-bright" :
                  "text-muted"
                }`}>{count}</div>
                <div className="text-[10px] text-faint mt-1 tnum">Rating {range}</div>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl ${barColor}`} />
              </div>
            ))}
          </div>

          {/* Risk table */}
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th className="w-28">Category</th>
                    <th className="w-10 text-center" title="Likelihood (1–5)">L</th>
                    <th className="w-10 text-center" title="Impact (1–5)">I</th>
                    <th className="w-36">Rating</th>
                    <th className="w-32">Status</th>
                    <th className="w-24 text-right">Cost</th>
                    <th className="w-16 text-right" title="Schedule impact (days)">Sched</th>
                    <th className="w-28 text-right">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((r) => {
                    const tone = ratingTone(r.rating);
                    return (
                      <tr key={r.id} className="row-hover group">
                        <td>
                          <div className="font-medium text-white group-hover:text-accent-bright transition-colors max-w-xs">
                            {r.title}
                          </div>
                          {r.description && (
                            <div className="text-xs text-muted mt-0.5 line-clamp-1 max-w-xs text-pretty">
                              {r.description}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="text-xs text-muted uppercase tracking-wide font-mono">
                            {r.category ?? "—"}
                          </span>
                        </td>
                        <td className="text-center tnum">
                          <span className="text-muted text-sm">{r.likelihood}</span>
                        </td>
                        <td className="text-center tnum">
                          <span className="text-muted text-sm">{r.impact}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Badge tone={tone}>
                              <span className="tnum font-semibold">{r.rating}</span>
                            </Badge>
                            <span className={`text-[11px] font-medium ${
                              tone === "bad" ? "text-bad" :
                              tone === "warn" ? "text-warn" :
                              tone === "info" ? "text-accent-bright" :
                              "text-faint"
                            }`}>
                              {ratingLabel(r.rating)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusBadge value={r.status} />
                        </td>
                        <td className="text-right tnum text-xs text-muted">
                          {fmtMoney(r.costImpact)}
                        </td>
                        <td className="text-right tnum text-xs text-muted">
                          {r.scheduleImpactDays != null ? `${r.scheduleImpactDays}d` : "—"}
                        </td>
                        <td className="text-right tnum text-xs text-muted">
                          {fmtDate(r.dueDate)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend footer */}
            <div className="flex items-center gap-6 px-4 py-2.5 border-t border-line bg-ink-850/40 flex-wrap">
              <span className="text-[11px] text-faint font-medium">L × I = Rating:</span>
              {[
                { label: "Critical ≥15", color: "text-bad" },
                { label: "High 10–14", color: "text-warn" },
                { label: "Medium 5–9", color: "text-accent-bright" },
                { label: "Low 1–4", color: "text-faint" },
              ].map(({ label, color }) => (
                <span key={label} className={`text-[11px] font-medium ${color}`}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
