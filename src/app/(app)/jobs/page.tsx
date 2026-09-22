import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Search, Star, FileSpreadsheet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { getActiveProject } from "@/lib/project";
import { PageHeader, EmptyState } from "@/components/ui/EmptyState";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { fmtDate, fmtMoney } from "@/lib/utils";
import { compareJobCodes } from "@/lib/jobs/codes";
import { JOB_VIEWS, groupJobs, jobView, jobWhere } from "@/lib/jobs/views";
import { daysUntilExpiry, isExpired } from "@/lib/jobs/workflow";
import {
  CONTRACT_TYPE_LABELS,
  JOB_STATUS_LABELS,
  PRICING_BASIS_LABELS,
  type ContractType,
  type JobStatus,
  type PricingBasis,
} from "@/lib/enums";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { view?: string; q?: string; section?: string; fav?: string };
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.JOB_VIEW)) {
    return <EmptyState title="Forbidden" hint="Quotes are restricted." />;
  }

  const project = await getActiveProject(user.id);
  if (!project) {
    return <EmptyState title="No project" hint="You have no project assigned yet." />;
  }

  const view = jobView(searchParams.view);
  const favouritesOnly = searchParams.fav === "1";
  const where = jobWhere({
    projectId: project.id,
    view,
    q: searchParams.q,
    sectionLetter: searchParams.section,
    favouriteOf: favouritesOnly ? user.id : undefined,
  });

  const [jobs, sections, counts] = await Promise.all([
    prisma.job.findMany({
      where,
      include: {
        section: true,
        favourites: { where: { userId: user.id }, select: { userId: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.jobSection.findMany({ where: { projectId: project.id }, orderBy: { sort: "asc" } }),
    Promise.all(
      JOB_VIEWS.map(async (v) => ({
        key: v.key,
        count: await prisma.job.count({
          where: jobWhere({ projectId: project.id, view: v }),
        }),
      }))
    ),
  ]);

  const countByView = new Map(counts.map((c) => [c.key, c.count]));
  const groups = groupJobs(jobs, compareJobCodes);
  const grandTotal = jobs.reduce((sum, j) => sum.plus(j.total), new Prisma.Decimal(0));

  const qs = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      view: searchParams.view,
      q: searchParams.q,
      section: searchParams.section,
      fav: searchParams.fav,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const s = params.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={project.code ? `${project.code} · ${project.yardName ?? ""}`.trim() : "Yard"}
        title="Quotes &amp; requests"
        subtitle={view.blurb}
        actions={
          <>
            <a href="/api/export/jobs" className="btn" download>
              <FileSpreadsheet size={14} />
              Spreadsheet
            </a>
            {hasPermission(user, PERMISSIONS.JOB_REQUEST) && (
              <Link href="/jobs/new" className="btn-primary btn-lg">
                New quote request
              </Link>
            )}
          </>
        }
      />

      {/* Sub-views, as The Bridge splits them. */}
      <nav aria-label="Views" className="mb-4 flex flex-wrap gap-1.5">
        {JOB_VIEWS.map((v) => {
          const active = v.key === view.key;
          const count = countByView.get(v.key) ?? 0;
          return (
            <Link
              key={v.key}
              href={qs({ view: v.key, section: undefined })}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-line-strong bg-ink-800 text-white"
                  : "border-line-soft bg-ink-900/50 text-muted hover:border-line hover:text-white"
              }`}
            >
              {v.label}
              <span className="text-xs text-faint tnum">{count}</span>
            </Link>
          );
        })}
      </nav>

      {/* Section tabs and search */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={qs({ section: undefined })}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              !searchParams.section ? "bg-accent/20 text-accent-bright" : "text-muted hover:text-white"
            }`}
          >
            All sections
          </Link>
          {sections.map((s) => (
            <Link
              key={s.id}
              href={qs({ section: s.letter })}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                searchParams.section === s.letter
                  ? "bg-accent/20 text-accent-bright"
                  : "text-muted hover:text-white"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>

        <form action="/jobs" className="relative ml-auto">
          <input type="hidden" name="view" value={view.key} />
          {searchParams.section && <input type="hidden" name="section" value={searchParams.section} />}
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search code, title or reference"
            aria-label="Search quotes"
            className="input-base w-72 py-1.5 pl-8 text-sm"
          />
        </form>

        <Link
          href={qs({ fav: favouritesOnly ? undefined : "1" })}
          className={`btn text-xs ${favouritesOnly ? "border-warn/40 text-warn" : ""}`}
        >
          <Star size={13} className={favouritesOnly ? "fill-warn" : ""} />
          Favourites
        </Link>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="Nothing here"
          hint={
            searchParams.q
              ? `No quote matches “${searchParams.q}” in this view.`
              : view.blurb
          }
        />
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-xs text-muted">
              {jobs.length} {jobs.length === 1 ? "quote" : "quotes"} in {groups.length}{" "}
              {groups.length === 1 ? "group" : "groups"}
            </p>
            <p className="text-sm">
              <span className="text-muted">Total </span>
              <span className="font-semibold text-white tnum">
                {fmtMoney(grandTotal, project.currency)}
              </span>
            </p>
          </div>

          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.groupCode} className="surface overflow-hidden">
                <header className="flex flex-wrap items-center gap-3 border-b border-line bg-ink-850/40 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-white tnum">{group.groupCode}</h2>
                  {group.progressPct !== null && (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1 w-24 overflow-hidden rounded-full bg-ink-700"
                        role="img"
                        aria-label={`${group.progressPct} per cent complete`}
                      >
                        <div
                          className="h-full rounded-full bg-ok"
                          style={{ width: `${group.progressPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted tnum">{group.progressPct}%</span>
                    </div>
                  )}
                  <span className="ml-auto text-sm font-medium text-white tnum">
                    {fmtMoney(group.total, project.currency)}
                  </span>
                </header>

                <table className="table-base">
                  <thead className="sr-only">
                    <tr>
                      <th>Quote</th>
                      <th>Status</th>
                      <th>Price</th>
                      <th>Delivered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.jobs.map((job) => {
                      const expired = isExpired(job);
                      const daysLeft = daysUntilExpiry(job.expiresAt);
                      return (
                        <tr key={job.id} className="row-hover">
                          <td>
                            <Link
                              href={`/jobs/${job.id}`}
                              className="font-medium text-accent-bright transition-colors hover:text-marine"
                            >
                              <span className="tnum text-muted">{job.code}</span> {job.title}
                            </Link>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge tone="muted">
                                {CONTRACT_TYPE_LABELS[job.contractType as ContractType] ?? job.contractType}
                              </Badge>
                              <Badge tone="muted">
                                {PRICING_BASIS_LABELS[job.pricingBasis as PricingBasis] ?? job.pricingBasis}
                              </Badge>
                              {job.clientRef && (
                                <span className="text-[11px] text-faint tnum">Ref {job.clientRef}</span>
                              )}
                              {job.favourites.length > 0 && (
                                <Star size={11} className="fill-warn text-warn" aria-label="Favourite" />
                              )}
                              {job._count.comments > 0 && (
                                <span className="text-[11px] text-faint">
                                  {job._count.comments} comment{job._count.comments === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap">
                            <StatusBadge value={job.status} />
                            {expired && daysLeft !== null && (
                              <div
                                className="mt-1 text-[11px] text-bad"
                                title={
                                  job.quoteDeliveredAt
                                    ? `Delivered ${fmtDate(job.quoteDeliveredAt)}, valid ${job.validityDays} days`
                                    : undefined
                                }
                              >
                                Lapsed {Math.abs(daysLeft)} days ago
                              </div>
                            )}
                            {!expired && daysLeft !== null && daysLeft <= 7 && daysLeft >= 0 && (
                              <div className="mt-1 text-[11px] text-warn">
                                {daysLeft === 0 ? "Expires today" : `${daysLeft} days left`}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap text-right font-medium text-white tnum">
                            {job.total.greaterThan(0) ? fmtMoney(job.total, project.currency) : "—"}
                          </td>
                          <td className="whitespace-nowrap text-right text-xs text-muted tnum">
                            {job.quoteDeliveredAt ? fmtDate(job.quoteDeliveredAt) : "—"}
                          </td>
                          <td className="w-24 whitespace-nowrap">
                            {job.progressPct > 0 && (
                              <div className="flex items-center gap-1.5">
                                <div className="h-1 w-12 overflow-hidden rounded-full bg-ink-700">
                                  <div
                                    className="h-full rounded-full bg-ok"
                                    style={{ width: `${job.progressPct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] text-muted tnum">{job.progressPct}%</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
