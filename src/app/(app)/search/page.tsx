import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireUser();
  const q = (searchParams.q ?? "").trim();
  if (!q) {
    return (
      <>
        <PageHeader title="Search" subtitle="Find anything by title, number, contents." />
        <form className="surface p-4">
          <input name="q" placeholder="Type and press enter…" className="input-base" autoFocus />
        </form>
      </>
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

  return (
    <>
      <PageHeader title={`Search: ${q}`} subtitle={`${sections.reduce((n, s) => n + s.items.length, 0)} results`} />
      <form className="surface p-3 mb-4 flex gap-2">
        <input name="q" defaultValue={q} className="input-base flex-1" />
        <button className="btn">Search</button>
      </form>
      {sections.length === 0 ? (
        <p className="text-sm text-muted">No matches.</p>
      ) : (
        sections.map((s) => (
          <div key={s.label} className="surface p-4 mb-3">
            <h2 className="text-sm font-medium mb-2">{s.label}</h2>
            <ul className="text-sm space-y-1">
              {s.items.map((it, i) => (
                <li key={i}><Link className="text-accent" href={it.href}>{it.label}</Link></li>
              ))}
            </ul>
          </div>
        ))
      )}
    </>
  );
}
