import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime } from "@/lib/utils";
import { CalendarDays, CheckCircle2, Clock3, MapPin } from "lucide-react";

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

  const now = new Date();
  const upcoming = meetings.filter((m) => m.meetsAt >= now);
  const past = meetings.filter((m) => m.meetsAt < now);

  const openActions = meetings.reduce((sum, m) => sum + m.actions.filter((a) => a.status === "OPEN").length, 0);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        eyebrow="Collaboration"
        title="Meetings"
        subtitle="Agenda, minutes and live action tracking."
      />

      {meetings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={20} />}
          title="No meetings yet"
          hint="Meetings with agenda items and action tracking will appear here."
        />
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="stat-card">
              <div className="stat-label">Total meetings</div>
              <div className="stat-value text-white">{meetings.length}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-line" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Upcoming</div>
              <div className="stat-value text-accent-bright">{upcoming.length}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-accent/60" />
            </div>
            <div className="stat-card">
              <div className="stat-label">Open actions</div>
              <div className="stat-value text-warn">{openActions}</div>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-warn/60" />
            </div>
          </div>

          <div className="space-y-6">
            {upcoming.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="eyebrow">Upcoming</span>
                  <span className="text-[11px] text-faint tnum">{upcoming.length}</span>
                </div>
                <div className="space-y-2">
                  {upcoming.map((m) => (
                    <MeetingRow key={m.id} m={m} upcoming />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="eyebrow">Past</span>
                  <span className="text-[11px] text-faint tnum">{past.length}</span>
                </div>
                <div className="space-y-2">
                  {past.map((m) => (
                    <MeetingRow key={m.id} m={m} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MeetingRow({
  m,
  upcoming,
}: {
  m: {
    id: string;
    title: string;
    type: string;
    meetsAt: Date;
    location: string | null;
    actions: { id: string; status: string }[];
    project: { name: string; vessel: { name: string } };
  };
  upcoming?: boolean;
}) {
  const open = m.actions.filter((a) => a.status === "OPEN").length;
  const done = m.actions.filter((a) => a.status !== "OPEN").length;

  const meetDate = new Date(m.meetsAt);
  const day = meetDate.toLocaleDateString("en-GB", { day: "2-digit" });
  const month = meetDate.toLocaleDateString("en-GB", { month: "short" });
  const year = meetDate.getFullYear().toString();
  const time = meetDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`surface p-4 flex items-start gap-4 animate-fade-up${
        upcoming ? " border-marine/40 panel-glow" : ""
      }`}
    >
      {/* Date block */}
      <div className="shrink-0 w-14 text-center">
        <div className="text-[10px] text-muted uppercase tracking-widest tnum">{month}</div>
        <div className="text-2xl font-semibold text-white tnum leading-tight">{day}</div>
        <div className="text-[10px] text-faint tnum">{year}</div>
        <div className="text-[11px] text-marine tnum mt-0.5 font-medium">{time}</div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-line shrink-0" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white truncate">{m.title}</h3>
              {upcoming && <Badge tone="info">Upcoming</Badge>}
            </div>
            <p className="text-xs text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-marine/80 font-medium">{m.type.replace(/_/g, " ")}</span>
              <span className="text-faint">·</span>
              <span>{m.project.vessel.name}</span>
              <span className="text-faint">·</span>
              <span>{m.project.name}</span>
              {m.location && (
                <>
                  <span className="text-faint">·</span>
                  <span className="flex items-center gap-1">
                    <MapPin size={10} className="text-faint" />
                    {m.location}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Action summary */}
          {m.actions.length > 0 && (
            <div className="shrink-0 flex items-center gap-3 text-[11px]">
              {open > 0 && (
                <span className="flex items-center gap-1 text-warn">
                  <Clock3 size={11} />
                  <span className="tnum font-medium">{open} open</span>
                </span>
              )}
              {done > 0 && (
                <span className="flex items-center gap-1 text-ok">
                  <CheckCircle2 size={11} />
                  <span className="tnum font-medium">{done} done</span>
                </span>
              )}
            </div>
          )}
        </div>

        {m.actions.length === 0 && (
          <div className="mt-2">
            <span className="text-[11px] text-faint">No action items</span>
          </div>
        )}
      </div>
    </div>
  );
}
