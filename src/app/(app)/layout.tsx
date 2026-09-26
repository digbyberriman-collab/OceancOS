import type { Viewport } from "next";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { getActiveProject, listProjectsForUser } from "@/lib/project";
import { THEME_COOKIE, parseTheme, themeColor } from "@/lib/theme";
import { AppShell } from "@/components/layout/AppShell";

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
    <AppShell
      unread={unread}
      user={{ name: user.name, email: user.email, roleKeys: user.roleKeys }}
      projects={projects}
      activeProjectId={activeProject?.id ?? null}
      theme={theme}
    >
      {children}
    </AppShell>
  );
}
