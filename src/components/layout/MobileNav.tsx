"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NavList } from "./NavList";
import { ProjectSwitcher } from "./ProjectSwitcher";
import type { ProjectSummary } from "@/lib/project";

/**
 * Hamburger + slide-in drawer, the mobile equivalent of the desktop Sidebar
 * (hidden below `lg`) — mirroring the pattern already built for the
 * marketing site's nav (src/components/marketing/Nav.tsx) but never applied
 * to the authenticated app (C12 in AUDIT_REPORT.md; ui-ux [RESPONSIVE]).
 *
 * The project switcher lives inside the drawer rather than being hidden
 * outright below `lg` — see the matching note on ProjectSwitcher.
 */
export function MobileNav({
  unread,
  projects,
  activeProjectId,
}: {
  unread: number;
  projects: ProjectSummary[];
  activeProjectId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // A navigation that already happened (a link inside the drawer was
  // followed) should close it, the same way NavList's onNavigate does for a
  // click — this also covers back/forward navigation and any link the
  // drawer itself doesn't render.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock page scroll behind the open drawer.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn-ghost h-9 w-9 p-0 lg:hidden"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
      </button>

      {open &&
        createPortal(
          // Rendered into document.body rather than in place: TopBar's
          // <header> carries `backdrop-blur-md`, and a CSS backdrop-filter
          // (like `transform` or `filter`) establishes a new containing
          // block for `position: fixed` descendants — so without the
          // portal, `fixed inset-0` resolved against the 56px-tall header
          // instead of the viewport, and the backdrop covered only the
          // header's own strip rather than the screen. Found live while
          // verifying this item: the backdrop's own bounding box measured
          // 375x55 instead of the full viewport.
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-ink-950 shadow-xl">
              <div className="flex items-center justify-between gap-2.5 px-4 py-4 border-b border-line">
                <Link
                  href="/dashboard"
                  className="group flex items-center gap-2.5"
                  onClick={() => setOpen(false)}
                >
                  <div className="relative w-8 h-8 rounded-lg bg-brand-gradient grid place-items-center text-white font-bold shadow-glow">
                    O
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold tracking-tight">OceancOS</div>
                    <div className="text-[10px] text-faint uppercase tracking-[0.18em]">
                      Project command
                    </div>
                  </div>
                </Link>
                <button
                  type="button"
                  className="btn-ghost h-8 w-8 p-0"
                  aria-label="Close navigation"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="px-4 py-3 border-b border-line">
                <ProjectSwitcher
                  projects={projects}
                  activeId={activeProjectId}
                  hideOnNarrowScreens={false}
                />
              </div>

              <NavList unread={unread} onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
