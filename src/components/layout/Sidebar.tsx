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
  Ship,
  ReceiptText,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProjectSwitcher } from "./ProjectSwitcher";
import type { ProjectSummary } from "@/lib/project";

const NAV: { label: string; href: string; section?: string; icon: LucideIcon }[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Quotes & requests", href: "/jobs", icon: ReceiptText },
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
  { label: "Projects", href: "/admin/projects", icon: Ship },
];

/**
 * The primary navigation.
 *
 * A fixed 240px column used to be the whole story — AUDIT_REPORT.md's
 * Critical C12, unusable below roughly 600px, because there was no way to
 * reach any page other than the current one on a phone. Below `md` this is
 * now an off-canvas drawer (`fixed`, translated out of view, toggled by
 * AppShell's `open` state); at `md` and up it reverts to the original
 * always-visible column via the `md:` overrides.
 */
export function Sidebar({
  unread = 0,
  open,
  onClose,
  projects,
  activeProjectId,
}: {
  unread?: number;
  open: boolean;
  onClose: () => void;
  projects: ProjectSummary[];
  activeProjectId: string | null;
}) {
  const pathname = usePathname();
  return (
    <>
      {/* Backdrop — mobile only, and only while the drawer is open. */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      {/* A plain div, not <aside> — the primary nav below should be the
          `navigation` landmark, not nested inside a `complementary` one
          (ACTION_PLAN.md G5.5). */}
      <div
        data-testid="mobile-nav-drawer"
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 shrink-0 bg-ink-950 border-r border-line overflow-y-auto",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          "md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 md:bg-ink-950/80 md:backdrop-blur-sm"
        )}
      >
        <div className="px-4 py-4 border-b border-line flex items-center justify-between gap-2">
          <Link href="/dashboard" className="group flex items-center gap-2.5" onClick={onClose}>
            <div className="relative w-8 h-8 rounded-lg bg-brand-gradient grid place-items-center text-white font-bold shadow-glow transition-transform duration-200 group-hover:scale-105">
              O
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">OceancOS</div>
              <div className="text-[10px] text-faint uppercase tracking-[0.18em]">Project command</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="btn-ghost h-8 w-8 p-0 md:hidden"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* The header's project switcher is desktop-only (TopBar, hidden
            below md) — this is its mobile equivalent, previously nowhere
            at all below md (ui-ux's "[RESPONSIVE] — the project switcher
            is hidden below the md breakpoint, with no alternative"). */}
        <div className="px-2 pt-3 md:hidden">
          <ProjectSwitcher projects={projects} activeId={activeProjectId} mobile />
        </div>

        <nav className="py-3" aria-label="Main">
          {NAV.map((item) => {
            // Exact match for entries that are a prefix of another, so /admin
            // does not stay lit while /admin/projects is open.
            const hasDeeperEntry = NAV.some(
              (other) => other.href !== item.href && other.href.startsWith(item.href + "/")
            );
            const active = hasDeeperEntry
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
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
                  onClick={onClose}
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
      </div>
    </>
  );
}
