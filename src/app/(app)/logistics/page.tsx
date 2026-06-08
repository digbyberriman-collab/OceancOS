import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtDateTime, fmtMoney } from "@/lib/utils";
import {
  Truck,
  ShieldAlert,
  CalendarClock,
  ArrowRight,
  PackageOpen,
} from "lucide-react";

export const dynamic = "force-dynamic";

// Human-readable logistics type labels
const TYPE_LABEL: Record<string, string> = {
  CREW_TRAVEL: "Crew Travel",
  CONTRACTOR_TRAVEL: "Contractor Travel",
  YARD_ACCESS: "Yard Access",
  DELIVERY: "Delivery",
  SHIPMENT: "Shipment",
  CUSTOMS: "Customs",
  COURIER: "Courier",
  ACCOMMODATION: "Accommodation",
  TRANSPORT: "Transport",
  CRANE: "Crane",
  DOCK: "Dock",
  TUG: "Tug",
  PILOT: "Pilot",
  LINESMEN: "Linesmen",
  BUNKERING: "Bunkering",
  WASTE: "Waste",
  PROVISIONING: "Provisioning",
  GUEST: "Guest",
};

// Icon accent colour by logistics category
const TYPE_ACCENT: Record<string, string> = {
  CREW_TRAVEL: "text-marine",
  CONTRACTOR_TRAVEL: "text-marine",
  DELIVERY: "text-accent-bright",
  SHIPMENT: "text-accent-bright",
  CRANE: "text-warn",
  TUG: "text-warn",
  PILOT: "text-warn",
  BUNKERING: "text-ok",
  PROVISIONING: "text-ok",
  CUSTOMS: "text-bad",
  DOCK: "text-marine",
  ACCOMMODATION: "text-marine",
  DEFAULT: "text-muted",
};

function typeAccent(t: string) {
  return TYPE_ACCENT[t] ?? TYPE_ACCENT.DEFAULT;
}

export default async function LogisticsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.LOG_VIEW)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" />}
        title="Forbidden"
        hint="Logistics is restricted."
      />
    );
  }
  const items = await prisma.logisticsItem.findMany({
    orderBy: [{ whenAt: "asc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Logistics"
        subtitle="Travel, deliveries, dock movements, provisioning and access scheduling."
      />

      {items.length === 0 ? (
        <div className="animate-fade-up">
          <EmptyState
            icon={<PackageOpen className="h-5 w-5" />}
            title="No logistics items yet"
            hint="Create one to schedule access, transport or deliveries."
          />
        </div>
      ) : (
        <div
          className="surface overflow-hidden animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left">Type</th>
                  <th className="text-left">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-3 w-3" aria-hidden />
                      When
                    </span>
                  </th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Cost</th>
                  <th className="text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l, idx) => (
                  <tr
                    key={l.id}
                    className="row-hover animate-fade-up"
                    style={{ animationDelay: `${80 + idx * 20}ms` }}
                  >
                    {/* Type with accent dot */}
                    <td>
                      <span
                        className={`inline-flex items-center gap-2 font-medium text-white/90`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                            l.status === "COMPLETED"
                              ? "bg-ok"
                              : l.status === "CANCELLED"
                              ? "bg-faint"
                              : "bg-marine"
                          }`}
                          aria-hidden
                        />
                        {TYPE_LABEL[l.type] ?? l.type}
                      </span>
                    </td>

                    {/* When */}
                    <td className="tnum text-white/80 whitespace-nowrap">
                      {fmtDateTime(l.whenAt)}
                    </td>

                    {/* Status */}
                    <td>
                      <StatusBadge value={l.status} />
                    </td>

                    {/* Cost — right-aligned tabular */}
                    <td className="text-right tnum text-white/80">
                      {l.cost > 0 ? fmtMoney(l.cost) : <span className="text-faint">—</span>}
                    </td>

                    {/* Notes */}
                    <td className="text-muted text-xs max-w-[280px]">
                      <span className="line-clamp-2">
                        {l.notes ?? (
                          <span className="text-faint">—</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer row count */}
          <div className="px-3.5 py-2.5 border-t border-line-soft flex items-center gap-1.5 text-[11px] text-faint">
            <Truck className="h-3 w-3" aria-hidden />
            <span className="tnum">{items.length}</span>
            <span>
              {items.length === 1 ? "item" : "items"}
            </span>
            <ArrowRight className="h-3 w-3 ml-auto text-faint/40" aria-hidden />
          </div>
        </div>
      )}
    </>
  );
}
