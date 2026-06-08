import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Search, SearchX } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireUser();
  const q = (searchParams.q ?? "").trim();

  if (!q) {
    return (
      <div className="animate-fade-up space-y-5">
        <PageHeader
          eyebrow="System"
          title="Search"
          subtitle="Find anything — change orders, drawings, documents, suppliers, crew requests."
        />
        <div className="surface p-5">
          <form className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                name="q"
                placeholder="Type and press enter…"
                className="input-base pl-9"
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary px-5">Search</button>
          </form>
          <p className="text-xs text-faint mt-3">
            Searches change orders, crew requests, drawings, documents, suppliers, contractors and inventory.
          </p>
        </div>
      </div>
    );
  }

  const like = q;
  const [cos, crs, drawings, docs, suppliers, contractors, inv] = await Promise.all([
    hasPermission(user, PERMISSIONS.CO_VIEW)
      ? prisma.changeOrder.findMany({
          where: { OR: [{ title: { contains: like } }, { number: { contains: like } }, { description: { contains: like } }] },
          take: 20,
        })
      : [],
    hasPermission(user, PERMISSIONS.CR_VIEW)
      ? prisma.crewRequest.findMany({
          where: { OR: [{ title: { contains: like } }, { number: { contains: like } }, { description: { contains: like } }] },
          take: 20,
        })
      : [],
    hasPermission(user, PERMISSIONS.DRW_VIEW)
      ? prisma.drawing.findMany({
          where: { OR: [{ title: { contains: like } }, { number: { contains: like } }] },
          take: 20,
        })
      : [],
    hasPermission(user, PERMISSIONS.DOC_VIEW)
      ? prisma.document.findMany({ where: { name: { contains: like } }, take: 20 })
      : [],
    prisma.supplier.findMany({ where: { name: { contains: like } }, take: 20 }),
    hasPermission(user, PERMISSIONS.CON_VIEW)
      ? prisma.contractor.findMany({ where: { name: { contains: like } }, take: 20 })
      : [],
    hasPermission(user, PERMISSIONS.INV_VIEW)
      ? prisma.inventoryItem.findMany({ where: { OR: [{ name: { contains: like } }, { serial: { contains: like } }] }, take: 20 })
      : [],
  ]);

  const sections: { label: string; items: { href: string; label: string }[] }[] = [
    { label: "Change orders", items: cos.map((x) => ({ href: `/change-orders/${x.id}`, label: `${x.number} — ${x.title}` })) },
    { label: "Crew requests", items: crs.map((x) => ({ href: `/crew-requests/${x.id}`, label: `${x.number} — ${x.title}` })) },
    { label: "Drawings", items: drawings.map((x) => ({ href: `/drawings`, label: `${x.number} — ${x.title}` })) },
    { label: "Documents", items: docs.map((x) => ({ href: `/documents`, label: x.name })) },
    { label: "Suppliers", items: suppliers.map((x) => ({ href: `/suppliers`, label: x.name })) },
    { label: "Contractors", items: contractors.map((x) => ({ href: `/contractors`, label: x.name })) },
    { label: "Inventory", items: inv.map((x) => ({ href: `/inventory`, label: x.name })) },
  ].filter((s) => s.items.length > 0);

  const totalResults = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="System"
        title={`Search results`}
        subtitle={`${totalResults} result${totalResults !== 1 ? "s" : ""} for "${q}"`}
      />

      {/* Persistent search bar */}
      <div className="surface p-4">
        <form className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input name="q" defaultValue={q} className="input-base pl-9" />
          </div>
          <button type="submit" className="btn btn-primary px-5">Search</button>
        </form>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={<SearchX size={20} />}
          title="No results found"
          hint={`Nothing matched "${q}". Try a different keyword or partial match.`}
        />
      ) : (
        <div className="space-y-3">
          {sections.map((s) => (
            <div key={s.label} className="surface overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-ink-850/40">
                <span className="eyebrow">{s.label}</span>
                <span className="text-[11px] text-faint tnum ml-1">{s.items.length}</span>
              </div>
              <ul className="divide-y divide-line-soft">
                {s.items.map((it, i) => (
                  <li key={i}>
                    <Link
                      href={it.href}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-ink-800/60 transition-colors duration-150 group"
                    >
                      <Search size={12} className="text-faint shrink-0 group-hover:text-marine transition-colors" />
                      <span className="text-accent-bright group-hover:text-white transition-colors truncate">
                        {it.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
