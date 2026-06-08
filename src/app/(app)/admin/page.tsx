import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime } from "@/lib/utils";
import { Users, Ship, FolderKanban, LayoutGrid, ScrollText, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.ADM_USERS) && !hasPermission(user, PERMISSIONS.AUDIT_VIEW)) {
    return <EmptyState title="Forbidden" hint="Admin tools are restricted." />;
  }
  const [users, vessels, projects, depts, audit] = await Promise.all([
    prisma.user.findMany({ include: { roles: { include: { role: true } } }, orderBy: { name: "asc" } }),
    prisma.vessel.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { archivedAt: null }, include: { vessel: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    hasPermission(user, PERMISSIONS.AUDIT_VIEW)
      ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
      : [],
  ]);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow="System"
        title="Admin"
        subtitle="Users, vessels, projects, departments and audit log."
        actions={
          <div className="flex items-center gap-1.5 text-xs text-faint">
            <Settings size={12} className="text-marine" />
            <span>System administration</span>
          </div>
        }
      />

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="stat-label">Users</div>
          <div className="stat-value text-white">{users.length}</div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-line" />
        </div>
        <div className="stat-card">
          <div className="stat-label">Projects</div>
          <div className="stat-value text-accent-bright">{projects.length}</div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-accent/60" />
        </div>
        <div className="stat-card">
          <div className="stat-label">Vessels</div>
          <div className="stat-value text-marine">{vessels.length}</div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-marine/40" />
        </div>
        <div className="stat-card">
          <div className="stat-label">Departments</div>
          <div className="stat-value text-muted">{depts.length}</div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-line" />
        </div>
      </div>

      {/* Main grid: Users + Projects/Vessels/Depts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Users card */}
        <div className="surface overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-ink-850/40">
            <Users size={14} className="text-marine shrink-0" />
            <span className="text-sm font-semibold text-white">Users</span>
            <span className="text-[11px] text-faint tnum ml-1">{users.length}</span>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th className="w-40">Roles</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="row-hover">
                  <td>
                    <span className="font-medium text-white">{u.name}</span>
                  </td>
                  <td className="text-muted text-xs">{u.email}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r.role.key} tone="info">
                          {r.role.key.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column: Projects, Vessels, Departments */}
        <div className="space-y-4">
          {/* Projects */}
          <div className="surface overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-ink-850/40">
              <FolderKanban size={14} className="text-marine shrink-0" />
              <span className="text-sm font-semibold text-white">Projects</span>
              <span className="text-[11px] text-faint tnum ml-1">{projects.length}</span>
            </div>
            {projects.length === 0 ? (
              <div className="px-4 py-6 text-sm text-faint text-center">No active projects</div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-white text-sm">{p.vessel.name}</span>
                      <span className="text-muted text-xs mx-1.5">—</span>
                      <span className="text-muted text-sm">{p.name}</span>
                    </div>
                    <span className="shrink-0 text-[10px] font-mono text-faint uppercase tracking-wide">
                      {p.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Vessels + Departments in a 2-col mini-grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="surface overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-ink-850/40">
                <Ship size={13} className="text-marine shrink-0" />
                <span className="text-sm font-semibold text-white">Vessels</span>
              </div>
              {vessels.length === 0 ? (
                <div className="px-4 py-4 text-sm text-faint">None</div>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {vessels.map((v) => (
                    <li key={v.id} className="px-4 py-2 text-sm text-muted hover:text-white transition-colors">
                      {v.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="surface overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-ink-850/40">
                <LayoutGrid size={13} className="text-marine shrink-0" />
                <span className="text-sm font-semibold text-white">Departments</span>
              </div>
              {depts.length === 0 ? (
                <div className="px-4 py-4 text-sm text-faint">None</div>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {depts.map((d) => (
                    <li key={d.id} className="px-4 py-2 text-sm text-muted hover:text-white transition-colors">
                      {d.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Audit log */}
      {audit.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-ink-850/40">
            <ScrollText size={14} className="text-marine shrink-0" />
            <span className="text-sm font-semibold text-white">Audit log</span>
            <span className="text-[11px] text-faint tnum ml-1">latest {audit.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-40">When</th>
                  <th className="w-32">Action</th>
                  <th className="w-40">Resource</th>
                  <th className="w-28">Actor</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="row-hover">
                    <td className="font-mono text-xs text-muted tnum">{fmtDateTime(a.createdAt)}</td>
                    <td>
                      <span className="text-xs font-medium text-white">{a.action}</span>
                    </td>
                    <td className="text-xs text-muted">
                      {a.resource}
                      {a.resourceId ? (
                        <span className="text-faint ml-1 font-mono">({a.resourceId.slice(0, 8)})</span>
                      ) : null}
                    </td>
                    <td className="text-xs text-faint font-mono">
                      {a.actorId?.slice(0, 8) ?? "—"}
                    </td>
                    <td className="text-xs text-muted max-w-xs truncate">
                      {a.details ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
