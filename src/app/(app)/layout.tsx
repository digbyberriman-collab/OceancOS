import type { Viewport } from "next";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { getActiveProject, listProjectsForUser } from "@/lib/project";
import { THEME_COOKIE, parseTheme, themeColor } from "@/lib/theme";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export function generateViewport(): Viewport {
  return { themeColor: themeColor(parseTheme(cookies().get(THEME_COOKIE)?.value)) };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const theme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  const [unread, projects, activeProject] = await Promise.all([
    unreadCount(user.id),
    listProjectsForUser(user.id),
    getActiveProject(user.id),
  ]);
  return (
    <div id="app-shell" data-app-theme={theme} className="min-h-screen flex text-body">
      <Sidebar unread={unread} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          user={{ name: user.name, email: user.email, roleKeys: user.roleKeys }}
          projects={projects}
          activeProjectId={activeProject?.id ?? null}
          theme={theme}
        />
        <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
