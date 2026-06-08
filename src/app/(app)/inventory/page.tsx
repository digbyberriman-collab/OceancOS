import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtMoney } from "@/lib/utils";
import {
  ShieldAlert,
  Layers,
  AlertTriangle,
  ArrowRight,
  Search,
} from "lucide-react";

export const dynamic = "force-dynamic";

// Human-readable category labels
const CAT_LABEL: Record<string, string> = {
  EQUIPMENT: "Equipment",
  SPARE: "Spare",
  CRITICAL_SPARE: "Critical Spare",
  TOOL: "Tool",
  CONSUMABLE: "Consumable",
  LSA: "LSA",
  FFE: "FF&E",
  AV_IT: "AV / IT",
  ENGINEERING: "Engineering",
  DECK: "Deck",
  INTERIOR: "Interior",
  GALLEY: "Galley",
  MEDICAL: "Medical",
  DIVE: "Dive",
  SAFETY: "Safety",
};

// Category tone pill style
const CAT_TONE: Record<string, string> = {
  CRITICAL_SPARE: "badge badge-bad",
  LSA: "badge badge-bad",
  SAFETY: "badge badge-warn",
  MEDICAL: "badge badge-warn",
  DEFAULT: "badge badge-muted",
};

function catBadgeClass(cat: string) {
  return CAT_TONE[cat] ?? CAT_TONE.DEFAULT;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string; status?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.INV_VIEW)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" />}
        title="Forbidden"
        hint="Inventory is restricted."
      />
    );
  }

  const where: any = { archivedAt: null };
  if (searchParams.q) {
    where.OR = [
      { name: { contains: searchParams.q } },
      { manufacturer: { contains: searchParams.q } },
      { model: { contains: searchParams.q } },
      { serial: { contains: searchParams.q } },
    ];
  }
  if (searchParams.category) where.category = searchParams.category;
  if (searchParams.status) where.status = searchParams.status;

  const items = await prisma.inventoryItem.findMany({
    where,
    orderBy: { name: "asc" },
    take: 500,
  });

  // Derived counts for summary strip
  const lowCount = items.filter(
    (i) => i.qty > 0 && i.qty <= i.minStock
  ).length;
  const reorderCount = items.filter(
    (i) => i.status === "REORDER" || i.status === "LOW"
  ).length;
  const faultyCount = items.filter((i) => i.status === "FAULTY").length;

  return (
    <>
      <PageHeader
        eyebrow="Vessel Inventory"
        title="Inventory & Equipment"
        subtitle="Equipment, spares, tools and consumables across all active projects."
      />

      {/* ── Filter bar ── */}
      <form
        className="surface p-3.5 mb-4 flex flex-wrap gap-3 items-end animate-fade-up"
        style={{ animationDelay: "40ms" }}
        method="get"
      >
        <label className="flex-1 min-w-[200px]">
          <span className="label-base">Search</span>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-faint pointer-events-none"
              aria-hidden
            />
            <input
              name="q"
              defaultValue={searchParams.q}
              className="input-base pl-8"
              placeholder="Name, manufacturer, model, serial…"
              spellCheck={false}
            />
          </div>
        </label>

        <label className="w-48">
          <span className="label-base">Category</span>
          <select
            name="category"
            defaultValue={searchParams.category ?? ""}
            className="input-base"
          >
            <option value="">All categories</option>
            {Object.entries(CAT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="w-40">
          <span className="label-base">Status</span>
          <select
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="input-base"
          >
            <option value="">All statuses</option>
            {["OK", "LOW", "REORDER", "MISSING", "FAULTY", "RETIRED"].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              )
            )}
          </select>
        </label>

        <button type="submit" className="btn-primary btn">
          Apply
        </button>
      </form>

      {/* ── Alert strip (low stock / faults) ── */}
      {(lowCount > 0 || reorderCount > 0 || faultyCount > 0) && (
        <div
          className="flex flex-wrap gap-2 mb-4 animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          {lowCount > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warn/10 border border-warn/30 text-warn text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              <span className="tnum font-semibold">{lowCount}</span> below min stock
            </div>
          )}
          {reorderCount > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warn/10 border border-warn/30 text-warn text-xs font-medium">
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              <span className="tnum font-semibold">{reorderCount}</span> need reorder
            </div>
          )}
          {faultyCount > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bad/10 border border-bad/30 text-bad text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              <span className="tnum font-semibold">{faultyCount}</span> faulty
            </div>
          )}
        </div>
      )}

      {/* ── Table or empty state ── */}
      {items.length === 0 ? (
        <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
          <EmptyState
            icon={<Layers className="h-5 w-5" />}
            title="No inventory items"
            hint={
              searchParams.q || searchParams.category || searchParams.status
                ? "No items match your current filters."
                : "Seed sample data or import from Excel to populate inventory."
            }
          />
        </div>
      ) : (
        <div
          className="surface overflow-hidden animate-fade-up"
          style={{ animationDelay: "80ms" }}
        >
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left">Item</th>
                  <th className="text-left">Category</th>
                  <th className="text-left">Location</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Min</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Replacement</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const belowMin = i.qty <= i.minStock && i.minStock > 0;
                  return (
                    <tr key={i.id} className="row-hover">
                      {/* Name + meta */}
                      <td className="max-w-[240px]">
                        <div className="font-medium text-white truncate">
                          {i.name}
                        </div>
                        {(i.manufacturer || i.model) && (
                          <div className="text-xs text-faint mt-0.5 truncate">
                            {[i.manufacturer, i.model]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                        {i.serial && (
                          <div className="text-[10px] text-faint/70 mt-0.5 tnum font-mono truncate">
                            s/n {i.serial}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td>
                        <span className={catBadgeClass(i.category)}>
                          {CAT_LABEL[i.category] ?? i.category}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="text-muted text-xs whitespace-nowrap">
                        {i.location ?? (
                          <span className="text-faint">—</span>
                        )}
                      </td>

                      {/* Qty — warn when below min */}
                      <td
                        className={`text-right tnum font-semibold ${
                          belowMin ? "text-warn" : "text-white/80"
                        }`}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          {belowMin && (
                            <AlertTriangle
                              className="h-3 w-3 flex-shrink-0"
                              aria-hidden
                            />
                          )}
                          {i.qty}
                        </span>
                      </td>

                      {/* Min stock */}
                      <td className="text-right tnum text-faint">
                        {i.minStock}
                      </td>

                      {/* Status */}
                      <td>
                        <StatusBadge value={i.status} />
                      </td>

                      {/* Replacement cost */}
                      <td className="text-right tnum text-white/70">
                        {i.replacementCost > 0 ? (
                          fmtMoney(i.replacementCost)
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-3.5 py-2.5 border-t border-line-soft flex items-center gap-1.5 text-[11px] text-faint">
            <Layers className="h-3 w-3" aria-hidden />
            <span className="tnum">{items.length}</span>
            <span>{items.length === 1 ? "item" : "items"}</span>
          </div>
        </div>
      )}
    </>
  );
}
