import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { fmtDateTime } from "@/lib/utils";

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
    <>
      <PageHeader title="Admin" subtitle="Users, vessels, projects, departments and audit log." />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="surface p-4">
          <h2 className="text-sm font-medium mb-3">Users</h2>
          <table className="table-base">
            <thead><tr><th>Name</th><th>Email</th><th>Roles</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="text-muted">{u.email}</td>
                  <td>{u.roles.map((r) => r.role.key).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="surface p-4">
          <h2 className="text-sm font-medium mb-3">Projects</h2>
          <ul className="text-sm space-y-1">
            {projects.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.vessel.name}</span> — {p.name}
                <span className="text-muted ml-2">[{p.type}]</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-muted">
            <div><div className="text-white text-sm font-medium mb-1">Vessels</div>{vessels.map((v) => <div key={v.id}>{v.name}</div>)}</div>
            <div><div className="text-white text-sm font-medium mb-1">Departments</div>{depts.map((d) => <div key={d.id}>{d.name}</div>)}</div>
          </div>
        </div>
      </div>

      {audit.length > 0 && (
        <div className="surface p-4 mt-4">
          <h2 className="text-sm font-medium mb-3">Audit log (latest 50)</h2>
          <table className="table-base">
            <thead><tr><th>When</th><th>Action</th><th>Resource</th><th>Actor</th><th>Details</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-xs">{fmtDateTime(a.createdAt)}</td>
                  <td>{a.action}</td>
                  <td>{a.resource}{a.resourceId ? ` (${a.resourceId.slice(0, 8)})` : ""}</td>
                  <td className="text-muted">{a.actorId?.slice(0, 8) ?? "—"}</td>
                  <td className="text-xs text-muted max-w-xs truncate">{a.details ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
