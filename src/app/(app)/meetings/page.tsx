import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { fmtDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.MTG_VIEW)) {
    return <EmptyState title="Forbidden" hint="Meeting records are restricted." />;
  }
  const meetings = await prisma.meeting.findMany({
    include: { actions: true, project: { include: { vessel: true } } },
    orderBy: { meetsAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader title="Meetings" subtitle="Agenda, minutes and live action tracking." />
      {meetings.length === 0 ? (
        <EmptyState title="No meetings yet" />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => {
            const open = m.actions.filter((a) => a.status === "OPEN").length;
            return (
              <div key={m.id} className="surface p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-medium">{m.title}</h3>
                    <p className="text-xs text-muted">
                      {m.type} · {m.project.vessel.name} · {m.project.name} · {fmtDateTime(m.meetsAt)}
                      {m.location && ` · ${m.location}`}
                    </p>
                  </div>
                  <div className="text-xs text-right">
                    <div>{m.actions.length} actions</div>
                    {open > 0 && <div className="text-warn">{open} open</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
