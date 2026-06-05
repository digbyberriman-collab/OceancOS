import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Factory, Mail, Phone } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requireUser();
  const suppliers = await prisma.supplier.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="Network"
        title="Suppliers"
        subtitle="Linked to purchase orders and invoices."
      />

      {suppliers.length === 0 ? (
        <EmptyState
          icon={<Factory size={20} />}
          title="No suppliers"
          hint="Add a supplier to link them to purchase orders and invoices."
        />
      ) : (
        <div className="surface overflow-hidden">
          {/* Header strip */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line bg-ink-850/40">
            <Factory size={13} className="text-marine shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
              {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="w-36">Contact</th>
                  <th className="w-56">Email</th>
                  <th className="w-40">Phone</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="row-hover group">
                    <td>
                      <span className="font-medium text-white group-hover:text-accent-bright transition-colors">
                        {s.name}
                      </span>
                    </td>
                    <td>
                      {s.contact ? (
                        <span className="text-sm text-muted">{s.contact}</span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td>
                      {s.email ? (
                        <a
                          href={`mailto:${s.email}`}
                          className="text-xs text-accent hover:text-accent-bright transition-colors flex items-center gap-1"
                        >
                          <Mail size={11} className="shrink-0" />
                          {s.email}
                        </a>
                      ) : (
                        <span className="text-faint text-xs">—</span>
                      )}
                    </td>
                    <td>
                      {s.phone ? (
                        <a
                          href={`tel:${s.phone}`}
                          className="text-xs text-muted hover:text-white transition-colors flex items-center gap-1"
                        >
                          <Phone size={11} className="shrink-0 text-faint" />
                          {s.phone}
                        </a>
                      ) : (
                        <span className="text-faint text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
