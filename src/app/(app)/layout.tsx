import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { getActiveProject, listProjectsForUser } from "@/lib/project";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
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
    >
      {children}
    </AppShell>
  );
}
