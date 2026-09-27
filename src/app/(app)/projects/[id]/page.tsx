import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  History,
  Info,
  Pencil,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/project";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { loadProjectOverview, type ProjectOverview } from "@/lib/yardPeriods/access";
import {
  PLANNING_BAND_CAVEAT,
  YARD_NOT_IDENTIFIED,
  contractorList,
  formatPeriod,
  groupScope,
  locationLine,
  nameAtTime,
  planningBand,
} from "@/lib/yardPeriods/display";
import { PageHeader } from "@/components/ui/EmptyState";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { SectionCard } from "@/components/workflow/SectionCard";
import { VesselDataGaps, sortGaps } from "@/components/vessel/VesselDataGaps";
import { ConfidenceBadge } from "@/components/vessel/ConfidenceBadge";
import { fmtDate } from "@/lib/utils";
import { openProjectAction } from "../actions";

export const dynamic = "force-dynamic";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-white">{children}</dd>
    </div>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-faint">{children}</span>;
}

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const user = await requireUser();
  const project = await loadProjectOverview(user.id, params.id);
  if (!project) return notFound();

  const active = await getActiveProject(user.id);
  const record = project.yardPeriod;
  const canSeeMoney = hasPermission(user, PERMISSIONS.FIN_VIEW);
  const canEditGaps = hasPermission(user, PERMISSIONS.VESSEL_EDIT);
  const canEditRecord = hasPermission(user, PERMISSIONS.PROJ_EDIT) && !!project.yardPeriod;
  const returnTo = `/projects/${project.id}`;

  const heading = record
    ? formatPeriod(record.startLabel, record.endLabel)
    : (project.code ?? project.name);
  const subtitle = record
    ? [project.name, project.yardName ?? YARD_NOT_IDENTIFIED].join(" · ")
    : [project.name, project.yardName].filter(Boolean).join(" · ");

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <Link
          href={`/vessels/${project.vessel.id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-white"
        >
          <ArrowLeft size={13} />
          {project.vessel.name}
        </Link>
        <PageHeader
          eyebrow={[project.code, project.vessel.yardNumber, project.vessel.name]
            .filter(Boolean)
            .join(" · ")}
          title={heading}
          subtitle={subtitle}
          actions={
            <>
              {project.isDemo && <DemoBadge />}
              <StatusBadge value={project.status} />
              {record && <ConfidenceBadge value={record.confidence} />}
              {canEditRecord && (
                <Link href={`/projects/${project.id}/edit`} className="btn">
                  <Pencil size={14} />
                  Edit period
                </Link>
              )}
              {active?.id !== project.id && (
                <form action={openProjectAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <SubmitButton className="btn" pendingText="Opening…">
                    Open this project
                  </SubmitButton>
                </form>
              )}
            </>
          }
        />
      </div>

      {searchParams.saved === "record" && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok/10 px-3.5 py-3 text-sm text-ok"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Yard period saved.</span>
        </div>
      )}

      {record ? (
        <YardPeriodSections project={project} canSeeMoney={canSeeMoney} />
      ) : (
        <LiveProjectSummary project={project} />
      )}

      {project.dataGaps.length > 0 && (
        <VesselDataGaps
          gaps={sortGaps(project.dataGaps)}
          canEdit={canEditGaps}
          returnTo={returnTo}
          title="Open questions about this period"
        />
      )}
    </div>
  );
}

function LiveProjectSummary({ project }: { project: ProjectOverview }) {
  const work = [
    { label: "Quotes & requests", count: project._count.jobs, href: "/jobs" },
    { label: "Change orders", count: project._count.changeOrders, href: "/change-orders" },
    { label: "Crew requests", count: project._count.crewRequests, href: "/crew-requests" },
    { label: "Documents", count: project._count.documents, href: "/documents" },
  ];
  return (
    <SectionCard title="Yard period">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Fact label="Yard">{project.yardName ?? <Missing>Not recorded</Missing>}</Fact>
        <Fact label="Arrival">
          {project.arrivalDate ? fmtDate(project.arrivalDate) : <Missing>Not set</Missing>}
        </Fact>
        <Fact label="Departure">
          {project.departureDate ? fmtDate(project.departureDate) : <Missing>Not set</Missing>}
        </Fact>
        <Fact label="Type">{project.type.replace(/_/g, " ").toLowerCase()}</Fact>
      </dl>
      <p className="mt-5 text-xs text-muted">
        Work on this project is listed on its pages once it is the project you are working in:{" "}
        {work.map((w, i) => (
          <span key={w.label}>
            {i > 0 && " · "}
            {w.label} <span className="text-white tnum">{w.count}</span>
          </span>
        ))}
      </p>
    </SectionCard>
  );
}

function YardPeriodSections({
  project,
  canSeeMoney,
}: {
  project: ProjectOverview;
  canSeeMoney: boolean;
}) {
  const record = project.yardPeriod!;
  const location = locationLine(record.cityText, record.countryText);
  const formerly = nameAtTime(record.nameAtPeriod, project.vessel.name);
  const contractors = contractorList(record.contractorsText);
  const groups = groupScope(project.scopeItems);
  const band = planningBand(record);
  const sources = project.evidence.filter((e) => e.kind === "SOURCE");
  const conflicts = project.evidence.filter((e) => e.kind === "CONFLICT");

  return (
    <>
      <div
        role="note"
        className="flex items-start gap-2.5 rounded-lg border border-line bg-ink-900/60 px-4 py-3 text-xs text-muted"
      >
        <History className="mt-px h-4 w-4 shrink-0 text-marine" aria-hidden />
        <p>
          A completed yard period, recorded from public sources in the yard-period register
          {record.registerEdition ? ` (research cutoff ${record.registerEdition})` : ""}. Dates are
          shown at the precision they were published. It is a record: no new work can be raised
          against it.
        </p>
      </div>

      <SectionCard title="The period">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Vessel">
            <Link href={`/vessels/${project.vessel.id}`} className="hover:text-marine">
              {project.vessel.name}
            </Link>
            {formerly && <span className="text-muted"> {formerly}</span>}
          </Fact>
          <Fact label="When">
            {formatPeriod(record.startLabel, record.endLabel)}
            {record.precisionLabel && (
              <span className="block text-xs text-muted">{record.precisionLabel}</span>
            )}
          </Fact>
          <Fact label="Yard">
            {project.yardName ?? <Missing>{YARD_NOT_IDENTIFIED}</Missing>}
            {location && <span className="block text-xs text-muted">{location}</span>}
          </Fact>
          <Fact label="Type of period">{record.periodType}</Fact>
        </dl>
        {contractors.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Contractors &amp; designers
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {contractors.map((c) => (
                <li key={c}>
                  <Badge tone="muted">{c}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Scope of work">
        {record.scopeSummary ? (
          <p className="max-w-3xl text-sm leading-relaxed text-white">{record.scopeSummary}</p>
        ) : (
          <p className="text-sm text-muted">No scope was published for this period.</p>
        )}
        {groups.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <div
                key={g.discipline}
                className="rounded-lg border border-line-soft bg-ink-900/50 p-4"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wider text-marine">
                  {g.label}
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-white">
                  {g.items.map((item) => (
                    <li key={item.id} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
                      <span>{item.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">
            The sources give no itemised work list for this period, so it has no scope lines by
            discipline.
          </p>
        )}
      </SectionCard>

      {canSeeMoney && (
        <SectionCard title="Cost">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Fact label="Reported cost">
              {record.reportedCostText ?? <Missing>Not reported</Missing>}
            </Fact>
            <Fact label="Planning estimate">
              {band.estimated ? (
                <>
                  <span className="font-semibold">{band.label}</span>
                  <span className="mt-1 block text-xs text-warn">{PLANNING_BAND_CAVEAT}</span>
                </>
              ) : (
                <Missing>{band.label}</Missing>
              )}
            </Fact>
          </dl>
          {record.costBandBasis && (
            <p className="mt-4 text-xs text-muted">
              <span className="text-faint">Basis: </span>
              {record.costBandBasis}
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Evidence">
        <ul className="space-y-3">
          {sources.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
              <ConfidenceBadge value={e.confidence} />
              <div className="min-w-0 flex-1">
                {e.sourceUrl ? (
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-accent-bright hover:text-marine"
                  >
                    {e.source?.publisher ?? e.sourceUrl}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <Missing>No source URL</Missing>
                )}
                {(e.sourceQuality ?? e.source?.sourceType) && (
                  <span className="ml-2 text-xs text-muted">
                    {e.sourceQuality ?? e.source?.sourceType}
                  </span>
                )}
                {e.qualification && <p className="mt-1 text-xs text-muted">{e.qualification}</p>}
              </div>
            </li>
          ))}
        </ul>
        {record.notes && (
          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
            {record.notes}
          </p>
        )}
        {conflicts.length > 0 && (
          <div className="mt-5 border-t border-line-soft pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-warn">
              Where sources disagree
            </h3>
            <ul className="mt-2 space-y-3">
              {conflicts.map((c) => (
                <li key={c.id} className="text-sm">
                  <div className="font-medium text-white">{c.issue}</div>
                  {c.qualification && (
                    <p className="mt-0.5 text-xs text-muted">{c.qualification}</p>
                  )}
                  {c.sourceUrl && (
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-accent-bright hover:text-marine"
                    >
                      Source <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>
    </>
  );
}
