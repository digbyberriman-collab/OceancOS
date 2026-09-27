import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listProjectsForUser } from "@/lib/project";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_LEVELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from "@/lib/enums";
import {
  cleanFilters,
  isFiltered,
  projectRegisterWhere,
  type RegisterFilters,
} from "@/lib/yardPeriods/filters";
import { YARD_NOT_IDENTIFIED, formatPeriod, locationLine } from "@/lib/yardPeriods/display";
import { EmptyState, PageHeader } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar, FilterField } from "@/components/workflow/FilterBar";
import { ConfidenceBadge } from "@/components/vessel/ConfidenceBadge";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_CAP = 200;

/**
 * Every real project the user can reach, across the fleet: the historical
 * yard periods newest first, and the live projects. The demo workspace is
 * not a vessel's, so it is not listed here.
 */
export default async function ProjectsRegisterPage({
  searchParams,
}: {
  searchParams: RegisterFilters;
}) {
  const user = await requireUser();
  const reachable = await listProjectsForUser(user.id);
  const filters = cleanFilters(searchParams);
  const where = projectRegisterWhere(
    reachable.map((p) => p.id),
    filters,
  );
  const canSeeMoney = hasPermission(user, PERMISSIONS.FIN_VIEW);

  const [projects, total, vessels, inResult, byConfidence] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        vessel: { select: { id: true, name: true, yardNumber: true } },
        yardPeriod: {
          select: {
            startLabel: true,
            endLabel: true,
            periodType: true,
            cityText: true,
            countryText: true,
            confidence: true,
            costBandLabel: true,
          },
        },
        _count: { select: { scopeItems: { where: { archivedAt: null } } } },
      },
      // Newest periods first; live projects, which have no record, after them.
      orderBy: [{ yardPeriod: { sortEnd: { sort: "desc", nulls: "last" } } }, { code: "asc" }],
      take: PAGE_CAP,
    }),
    prisma.project.count({ where }),
    prisma.vessel.findMany({
      where: {
        id: { in: [...new Set(reachable.filter((p) => !p.isDemo).map((p) => p.vesselId))] },
      },
      select: { yardNumber: true, name: true },
      orderBy: [{ yardNumber: "asc" }, { name: "asc" }],
    }),
    prisma.project.groupBy({ by: ["vesselId"], where }),
    prisma.yardPeriodRecord.groupBy({
      by: ["confidence"],
      where: { project: where },
      _count: { _all: true },
    }),
  ]);

  const periods = byConfidence.reduce((n, g) => n + g._count._all, 0);
  const high = byConfidence.find((g) => g.confidence === "HIGH")?._count._all ?? 0;
  const filtered = isFiltered(filters);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Knowledge"
        title="Projects"
        subtitle="Every vessel's yard periods — historical refits, rebuilds, repairs and surveys, and the projects under way now."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat-card">
          <div className="stat-label">Projects</div>
          <div className="stat-value text-white">{total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Historical periods</div>
          <div className="stat-value text-accent-bright">{periods}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">High confidence</div>
          <div className="stat-value text-ok">{high}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vessels</div>
          <div className="stat-value text-marine">{inResult.length}</div>
        </div>
      </div>

      <FilterBar resetHref="/projects" resultCount={total} resultLabel="project">
        <FilterField label="Vessel">
          <select name="vessel" defaultValue={filters.vessel ?? ""} className="input-base">
            <option value="">All vessels</option>
            {vessels
              .filter((v) => v.yardNumber)
              .map((v) => (
                <option key={v.yardNumber} value={v.yardNumber!}>
                  {v.yardNumber} · {v.name}
                </option>
              ))}
          </select>
        </FilterField>
        <FilterField label="Status">
          <select name="status" defaultValue={filters.status ?? ""} className="input-base">
            <option value="">All</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Yard or place" flex>
          <input
            name="yard"
            defaultValue={filters.yard}
            className="input-base"
            placeholder="Navantia, Netherlands…"
          />
        </FilterField>
        <FilterField label="Year">
          <input
            name="year"
            defaultValue={filters.year}
            className="input-base w-24"
            inputMode="numeric"
            placeholder="2020"
          />
        </FilterField>
        <FilterField label="Confidence">
          <select name="confidence" defaultValue={filters.confidence ?? ""} className="input-base">
            <option value="">Any</option>
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c} value={c}>
                {CONFIDENCE_LABELS[c]}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={20} />}
          title={filtered ? "No projects match these filters" : "No projects yet"}
          hint={
            filtered
              ? "Try fewer filters, or reset to see every project."
              : "You are not on any project yet."
          }
        />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>When</th>
                <th>Vessel</th>
                <th>Period</th>
                <th>Yard</th>
                <th>Confidence</th>
                <th className="text-right">Scope lines</th>
                {canSeeMoney && <th>Planning band</th>}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const r = p.yardPeriod;
                const place = r ? locationLine(r.cityText, r.countryText) : null;
                return (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap font-medium text-white tnum">
                      {r
                        ? formatPeriod(r.startLabel, r.endLabel)
                        : p.arrivalDate
                          ? `${fmtDate(p.arrivalDate)} – ${fmtDate(p.departureDate)}`
                          : "Not booked"}
                    </td>
                    <td className="whitespace-nowrap">
                      <Link
                        href={`/vessels/${p.vessel.id}`}
                        className="text-white hover:text-marine"
                      >
                        {p.vessel.name}
                      </Link>
                      <span className="block text-[11px] text-faint">{p.vessel.yardNumber}</span>
                    </td>
                    <td className="min-w-[200px]">
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-white hover:text-marine"
                      >
                        {r?.periodType ?? p.name}
                      </Link>
                      <span className="block text-[11px] text-faint">
                        {p.code}
                        {!r && (
                          <>
                            {" · "}
                            <StatusBadge value={p.status} />
                          </>
                        )}
                      </span>
                    </td>
                    <td className="min-w-[180px] text-muted">
                      {p.yardName ?? (
                        <span className="text-faint">
                          {r ? YARD_NOT_IDENTIFIED : "Not recorded"}
                        </span>
                      )}
                      {place && <span className="block text-[11px] text-faint">{place}</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {r ? (
                        <ConfidenceBadge value={r.confidence} />
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="text-right tnum text-muted">{p._count.scopeItems || "—"}</td>
                    {canSeeMoney && (
                      <td className="whitespace-nowrap text-muted">
                        {r?.costBandLabel ?? (
                          <span className="text-faint">{r ? "Not estimated" : "—"}</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > projects.length && (
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
              Showing the first {projects.length} of {total}. Narrow the filters to see the rest.
            </p>
          )}
          {canSeeMoney && (
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
              Planning bands are order-of-magnitude planning estimates, not historical spend.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
