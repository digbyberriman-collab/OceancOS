import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { Building2, AlertTriangle, Phone, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContractorsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CON_VIEW)) {
    return <EmptyState title="Forbidden" hint="Contractor records are restricted." />;
  }
  const items = await prisma.contractor.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });

  const now = new Date();
  const expiredInsurance = items.filter((c) => c.insuranceExpiresAt && c.insuranceExpiresAt < now).length;

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="Network"
        title="Contractors"
        subtitle="Companies, contacts, contract values and insurance status."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Building2 size={20} />}
          title="No contractors"
          hint="Add a contractor to track scope, value and insurance."
        />
      ) : (
        <>
          {/* Summary stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="stat-card">
              <div className="stat-label">Contractors</div>
              <div className="stat-value text-white">{items.length}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-line" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Total contract value</div>
              <div className="stat-value text-marine text-lg">
                {fmtMoney(items.reduce((sum, c) => sum + (c.contractValue ?? 0), 0))}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-marine/40" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Insurance alerts</div>
              <div className={`stat-value ${expiredInsurance > 0 ? "text-bad" : "text-ok"}`}>
                {expiredInsurance}
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl ${expiredInsurance > 0 ? "bg-bad/60" : "bg-ok/60"}`} />
            </div>
          </div>

          <div className="surface overflow-hidden">
            {/* Header strip */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line bg-ink-850/40">
              <Building2 size={13} className="text-marine shrink-0" />
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                {items.length} contractor{items.length !== 1 ? "s" : ""}
              </span>
              {expiredInsurance > 0 && (
                <div className="ml-auto flex items-center gap-1.5 text-[11px] text-bad">
                  <AlertTriangle size={11} />
                  <span className="font-medium">{expiredInsurance} expired insurance</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="w-32">Trade</th>
                    <th className="w-36">Contact</th>
                    <th className="w-48">Email</th>
                    <th className="w-32 text-right">Contract value</th>
                    <th className="w-32 text-right">Insurance expires</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => {
                    const insuranceExpired = c.insuranceExpiresAt && c.insuranceExpiresAt < now;
                    const insuranceNear =
                      c.insuranceExpiresAt &&
                      !insuranceExpired &&
                      (c.insuranceExpiresAt.getTime() - now.getTime()) / 86400000 < 30;
                    return (
                      <tr key={c.id} className="row-hover group">
                        <td>
                          <span className="font-medium text-white group-hover:text-accent-bright transition-colors">
                            {c.name}
                          </span>
                        </td>
                        <td>
                          {c.trade ? (
                            <span className="text-xs font-mono text-muted uppercase tracking-wide">
                              {c.trade}
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td>
                          {c.contact ? (
                            <span className="text-sm text-muted">{c.contact}</span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td>
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              className="text-xs text-accent hover:text-accent-bright transition-colors flex items-center gap-1"
                            >
                              <Mail size={11} className="shrink-0" />
                              {c.email}
                            </a>
                          ) : (
                            <span className="text-faint text-xs">—</span>
                          )}
                        </td>
                        <td className="text-right tnum text-sm font-medium text-white">
                          {fmtMoney(c.contractValue)}
                        </td>
                        <td className="text-right tnum">
                          {c.insuranceExpiresAt ? (
                            <span
                              className={`text-xs font-medium flex items-center justify-end gap-1 ${
                                insuranceExpired
                                  ? "text-bad"
                                  : insuranceNear
                                  ? "text-warn"
                                  : "text-muted"
                              }`}
                            >
                              {insuranceExpired && <AlertTriangle size={11} />}
                              {fmtDate(c.insuranceExpiresAt)}
                            </span>
                          ) : (
                            <span className="text-faint text-xs">—</span>
                          )}
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
