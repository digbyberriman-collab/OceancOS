"use client";

import Link from "next/link";
import { Search, Bell, Menu } from "lucide-react";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { UserMenu } from "./UserMenu";
import type { ProjectSummary } from "@/lib/project";
import type { Theme } from "@/lib/theme";
import type { RefObject } from "react";

export function TopBar({
  user,
  projects,
  activeProjectId,
  onOpenNav,
  navTriggerRef,
  theme,
}: {
  user: { name: string; email: string; roleKeys: string[] };
  projects: ProjectSummary[];
  activeProjectId: string | null;
  onOpenNav: () => void;
  /** So the drawer can return focus here when it closes. */
  navTriggerRef?: RefObject<HTMLButtonElement>;
  theme: Theme;
}) {
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="h-14 border-b border-line bg-ink-950/70 backdrop-blur-md sticky top-0 z-10 flex items-center px-4 gap-4">
      <button
        ref={navTriggerRef}
        type="button"
        onClick={onOpenNav}
        aria-label="Open menu"
        className="btn-ghost h-9 w-9 p-0 shrink-0 md:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>
      <form action="/search" className="flex-1 max-w-xl relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint"
          aria-hidden
        />
        <input
          name="q"
          aria-label="Search"
          placeholder="Search change orders, requests, drawings, documents…"
          className="input-base pl-9"
          spellCheck={false}
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <ProjectSwitcher projects={projects} activeId={activeProjectId} />
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="btn-ghost h-9 w-9 p-0"
        >
          <Bell className="h-4 w-4" aria-hidden />
        </Link>
        <UserMenu
          name={user.name}
          email={user.email}
          role={user.roleKeys[0] ?? "GUEST"}
          initials={initials || "U"}
          theme={theme}
        />
      </div>
    </header>
  );
}
