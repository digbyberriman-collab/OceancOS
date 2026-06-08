"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileDiff,
  Users,
  CheckSquare,
  CalendarRange,
  Wallet,
  Truck,
  Boxes,
  Ruler,
  FileText,
  Presentation,
  ShieldAlert,
  Building2,
  Factory,
  Bell,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { label: string; href: string; section?: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Change orders", href: "/change-orders", icon: FileDiff },
  { label: "Crew requests", href: "/crew-requests", icon: Users },
  { label: "Approvals", href: "/approvals", icon: CheckSquare },
  { section: "Project", label: "Schedule", href: "/schedule", icon: CalendarRange },
  { label: "Financials", href: "/financials", icon: Wallet },
  { label: "Logistics", href: "/logistics", icon: Truck },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { section: "Knowledge", label: "Drawings", href: "/drawings", icon: Ruler },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Meetings", href: "/meetings", icon: Presentation },
  { label: "Risks", href: "/risks", icon: ShieldAlert },
  { section: "Network", label: "Contractors", href: "/contractors", icon: Building2 },
  { label: "Suppliers", href: "/suppliers", icon: Factory },
  { section: "System", label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Search", href: "/search", icon: Search },
  { label: "Admin", href: "/admin", icon: Settings },
];

export function Sidebar({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 bg-ink-950/80 border-r border-line h-screen sticky top-0 overflow-y-auto backdrop-blur-sm">
      <div className="px-4 py-4 border-b border-line">
        <Link href="/dashboard" className="group flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-lg bg-brand-gradient grid place-items-center text-white font-bold shadow-glow transition-transform duration-200 group-hover:scale-105">
            O
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">OceancOS</div>
            <div className="text-[10px] text-faint uppercase tracking-[0.18em]">Project command</div>
          </div>
        </Link>
      </div>
      <nav className="py-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <div key={item.href}>
              {item.section && (
                <div className="px-4 pt-5 pb-1.5 text-[10px] uppercase tracking-[0.18em] text-faint font-medium">
                  {item.section}
                </div>
              )}
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("nav-link mx-2", active && "nav-link-active")}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-marine" : "text-faint")} aria-hidden />
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
