import Link from "next/link";
import { NavList } from "./NavList";

/**
 * Desktop navigation column. Hidden below `lg` — a fixed 240px column left
 * roughly 87px of usable width on a 375px phone, with no toggle anywhere in
 * the app to get it out of the way (C12 in AUDIT_REPORT.md; ui-ux
 * [RESPONSIVE]). MobileNav renders the same NavList as a drawer below this
 * breakpoint instead of hiding it outright.
 */
export function Sidebar({ unread = 0 }: { unread?: number }) {
  return (
    <aside className="hidden lg:block w-60 shrink-0 bg-ink-950/80 border-r border-line h-screen sticky top-0 overflow-y-auto backdrop-blur-sm">
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
      <NavList unread={unread} />
    </aside>
  );
}
