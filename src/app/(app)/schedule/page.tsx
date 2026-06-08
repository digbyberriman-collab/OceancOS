import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { fmtDate } from "@/lib/utils";
import {
  CalendarDays,
  Milestone as MilestoneIcon,
  AlertTriangle,
  ShieldAlert,
  ClipboardList,
  Flag,
  Anchor,
  Ship,
  ClipboardCheck,
  ShieldCheck,
  PackageCheck,
  Star,
} from "lucide-react";

export const dynamic = "force-dynamic";

const RISK_CLASS: Record<string, string> = {
  LOW: "text-ok",
  MEDIUM: "text-warn",
  HIGH: "text-bad",
  CRITICAL: "text-bad font-semibold",
};

const MILESTONE_TYPE_LABEL: Record<string, string> = {
  YARD_PERIOD: "Yard Period",
  SEA_TRIAL: "Sea Trial",
  HAT: "HAT",
  SAT: "SAT",
  CLASS_INSPECTION: "Class",
  FLAG_INSPECTION: "Flag",
  DELIVERY: "Delivery",
  CUSTOM: "Custom",
};

// Milestone type accent colors for the left border
const MILESTONE_ACCENT: Record<string, string> = {
  DELIVERY: "from-marine via-accent to-accent/10",
  SEA_TRIAL: "from-marine via-marine/60 to-marine/10",
  HAT: "from-accent-bright via-accent to-accent/10",
  SAT: "from-accent-bright via-accent to-accent/10",
  CLASS_INSPECTION: "from-warn/80 via-warn/40 to-warn/5",
  FLAG_INSPECTION: "from-warn/80 via-warn/40 to-warn/5",
  YARD_PERIOD: "from-accent/60 via-accent/30 to-accent/5",
  CUSTOM: "from-muted/50 via-muted/20 to-muted/5",
};

// Milestone type icon
function MilestoneTypeIcon({ type }: { type: string }) {
  const cls = "h-3.5 w-3.5 flex-shrink-0";
  switch (type) {
    case "DELIVERY":
      return <Anchor className={cls} aria-hidden />;
    case "SEA_TRIAL":
      return <Ship className={cls} aria-hidden />;
    case "HAT":
    case "SAT":
      return <ClipboardCheck className={cls} aria-hidden />;
    case "CLASS_INSPECTION":
      return <ShieldCheck className={cls} aria-hidden />;
    case "FLAG_INSPECTION":
      return <Flag className={cls} aria-hidden />;
    case "YARD_PERIOD":
      return <PackageCheck className={cls} aria-hidden />;
    default:
      return <Star className={cls} aria-hidden />;
  }
}

// Calculate days from today for a milestone date
function daysFromNow(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function RelativeDays({ date }: { date: Date }) {
  const days = daysFromNow(date);
  if (days < 0) {
    return (
      <span className="text-faint tnum text-[10px]">
        {Math.abs(days)}d ago
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="badge badge-warn text-[10px]">Today</span>
    );
  }
  if (days <= 7) {
    return (
      <span className="badge badge-warn text-[10px] tnum">
        {days}d
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="badge badge-info text-[10px] tnum">
        {days}d
      </span>
    );
  }
  return (
    <span className="text-faint tnum text-[10px]">
      {days}d
    </span>
  );
}

export default async function SchedulePage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.SCH_VIEW)) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" />}
        title="Forbidden"
        hint="Schedule is restricted."
      />
    );
  }
  const [tasks, milestones] = await Promise.all([
    prisma.scheduleTask.findMany({ orderBy: { startDate: "asc" }, take: 200 }),
    prisma.milestone.findMany({ orderBy: { date: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Project Timeline"
        title="Schedule"
        subtitle="Tasks, milestones and critical dates. Gantt view planned."
      />

      {/* ── Milestones timeline ── */}
      <section className="mb-8 animate-fade-up" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-2 mb-4">
          <MilestoneIcon className="h-4 w-4 text-marine" aria-hidden />
          <h2 className="text-sm font-semibold text-white tracking-tight">
            Milestones
          </h2>
          {milestones.length > 0 && (
            <span className="badge badge-info ml-1 tnum">
              {milestones.length}
            </span>
          )}
        </div>

        {milestones.length === 0 ? (
          <EmptyState
            icon={<MilestoneIcon className="h-5 w-5" />}
            title="No milestones yet"
            hint="Milestones will appear here once they're added to a project."
          />
        ) : (
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {milestones.map((m, idx) => {
              const accent =
                MILESTONE_ACCENT[m.type] ?? MILESTONE_ACCENT.CUSTOM;
              return (
                <li
                  key={m.id}
                  className="surface surface-hover relative flex items-start gap-3 p-4 rounded-xl overflow-hidden animate-fade-up"
                  style={{ animationDelay: `${80 + idx * 30}ms` }}
                >
                  {/* Accent left rule */}
                  <div
                    className={`absolute left-0 inset-y-0 w-0.5 bg-gradient-to-b ${accent} rounded-l-xl`}
                    aria-hidden
                  />

                  <div className="flex-1 min-w-0 pl-1">
                    {/* Name + status row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-sm text-white leading-snug truncate">
                        {m.name}
                      </div>
                      <div className="shrink-0">
                        <StatusBadge value={m.status} />
                      </div>
                    </div>

                    {/* Date + type row */}
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <CalendarDays
                          className="h-3 w-3 text-marine"
                          aria-hidden
                        />
                        <span className="tnum">{fmtDate(m.date)}</span>
                      </span>

                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <MilestoneTypeIcon type={m.type} />
                        <span>
                          {MILESTONE_TYPE_LABEL[m.type] ?? m.type}
                        </span>
                      </span>

                      <div className="ml-auto">
                        <RelativeDays date={m.date} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ── Tasks table ── */}
      <section className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="h-4 w-4 text-marine" aria-hidden />
          <h2 className="text-sm font-semibold text-white tracking-tight">
            Tasks
          </h2>
          {tasks.length > 0 && (
            <span className="badge badge-muted ml-1 tnum">
              {tasks.length}
            </span>
          )}
        </div>

        {tasks.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title="No tasks scheduled"
            hint="Schedule tasks will appear here once created against a project."
          />
        ) : (
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="text-left">Task</th>
                    <th className="text-left">Owner</th>
                    <th className="text-left">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" aria-hidden />
                        Start
                      </span>
                    </th>
                    <th className="text-left">End</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Risk</th>
                    <th className="text-left">Blockers</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t, idx) => (
                    <tr
                      key={t.id}
                      className="row-hover animate-fade-up"
                      style={{ animationDelay: `${140 + idx * 15}ms` }}
                    >
                      {/* Task name */}
                      <td className="font-medium text-white max-w-[200px]">
                        <span className="truncate block">{t.name}</span>
                      </td>

                      {/* Owner */}
                      <td className="text-muted text-xs">
                        {t.ownerId ?? (
                          <span className="text-faint">—</span>
                        )}
                      </td>

                      {/* Start date */}
                      <td className="tnum text-white/80 whitespace-nowrap">
                        {fmtDate(t.startDate)}
                      </td>

                      {/* End date */}
                      <td className="tnum text-white/80 whitespace-nowrap">
                        {fmtDate(t.endDate)}
                      </td>

                      {/* Status badge */}
                      <td>
                        <StatusBadge value={t.status} />
                      </td>

                      {/* Risk level */}
                      <td>
                        {t.riskLevel && t.riskLevel !== "LOW" ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              RISK_CLASS[t.riskLevel] ?? "text-muted"
                            }`}
                          >
                            <AlertTriangle
                              className="h-3 w-3 flex-shrink-0"
                              aria-hidden
                            />
                            {t.riskLevel}
                          </span>
                        ) : (
                          <span className="text-xs text-faint">
                            {t.riskLevel ?? "—"}
                          </span>
                        )}
                      </td>

                      {/* Blockers */}
                      <td className="text-muted text-xs max-w-[220px]">
                        <span className="line-clamp-2">
                          {t.blockers ?? (
                            <span className="text-faint">—</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
