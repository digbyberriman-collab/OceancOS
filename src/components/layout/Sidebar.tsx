"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV: { label: string; href: string; section?: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Change orders", href: "/change-orders" },
  { label: "Crew requests", href: "/crew-requests" },
  { label: "Approvals", href: "/approvals" },
  { section: "Project", label: "Schedule", href: "/schedule" },
  { label: "Financials", href: "/financials" },
  { label: "Logistics", href: "/logistics" },
  { label: "Inventory", href: "/inventory" },
  { section: "Knowledge", label: "Drawings", href: "/drawings" },
  { label: "Documents", href: "/documents" },
  { label: "Meetings", href: "/meetings" },
  { label: "Risks", href: "/risks" },
  { section: "Network", label: "Contractors", href: "/contractors" },
  { label: "Suppliers", href: "/suppliers" },
  { section: "System", label: "Notifications", href: "/notifications" },
  { label: "Search", href: "/search" },
  { label: "Admin", href: "/admin" },
];

export function Sidebar({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 bg-ink-950 border-r border-line h-screen sticky top-0 overflow-y-auto">
      <div className="px-4 py-4 border-b border-line">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-accent grid place-items-center text-white font-semibold">O</div>
          <div>
            <div className="text-sm font-semibold tracking-wide">OceancOS</div>
            <div className="text-[10px] text-muted uppercase tracking-widest">Project command</div>
          </div>
        </Link>
      </div>
      <nav className="py-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <div key={item.href}>
              {item.section && (
                <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-widest text-muted">
                  {item.section}
                </div>
              )}
              <Link
                href={item.href}
                className={cn("nav-link mx-2", active && "nav-link-active")}
              >
                <span className="flex-1">{item.label}</span>
                {item.href === "/notifications" && unread > 0 && (
                  <span className="badge badge-info">{unread}</span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
