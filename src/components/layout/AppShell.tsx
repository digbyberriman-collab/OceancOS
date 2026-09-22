"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { ProjectSummary } from "@/lib/project";

/**
 * Holds the mobile nav drawer's open/closed state, shared between TopBar
 * (the hamburger button that opens it) and Sidebar (the drawer itself).
 * They're siblings under the layout, so the state has to live above both —
 * this is that: the one client boundary the responsive sidebar needs,
 * everything else in the authenticated layout stays a server component.
 */
export function AppShell({
  unread,
  user,
  projects,
  activeProjectId,
  children,
}: {
  unread: number;
  user: { name: string; email: string; roleKeys: string[] };
  projects: ProjectSummary[];
  activeProjectId: string | null;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      <Sidebar
        unread={unread}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          user={user}
          projects={projects}
          activeProjectId={activeProjectId}
          onOpenNav={() => setNavOpen(true)}
        />
        <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
