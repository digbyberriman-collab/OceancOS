"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV } from "./navItems";

/**
 * The nav item list itself, shared by the desktop Sidebar and the mobile
 * drawer (MobileNav) — one active-link computation, one list of
 * destinations, rendered in two different chrome.
 */
export function NavList({
  unread = 0,
  onNavigate,
}: {
  unread?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="py-3">
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
              onClick={onNavigate}
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
  );
}
