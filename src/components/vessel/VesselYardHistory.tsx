import Link from "next/link";
import { ArrowUpRight, History, Ship } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { SCOPE_DISCIPLINES, SCOPE_DISCIPLINE_LABELS, type ScopeDiscipline } from "@/lib/enums";
import {
  YARD_NOT_IDENTIFIED,
  byMostRecent,
  formatPeriod,
  locationLine,
  nameAtTime,
} from "@/lib/yardPeriods/display";
import { fmtDate } from "@/lib/utils";
import type { VesselDetail } from "@/lib/vessels/access";

type Project = VesselDetail["projects"][number];

const SHORT_DISCIPLINE: Record<ScopeDiscipline, string> = {
  STRUCTURE_HULL_PAINT: "Structure & paint",
  MECHANICAL_PROPULSION: "Mechanical",
  ELECTRICAL_AVIT_NAV: "Electrical & AV/IT",
  INTERIOR_GUEST: "Interior",
  DECK_TENDER_MISSION: "Deck & tenders",
  SURVEY_CLASS_COMPLIANCE: "Survey & class",
  GENERAL: "General",
};

/** The disciplines a period's scope touches, in the disciplines' order. */
function disciplinesOf(p: Project): ScopeDiscipline[] {
  const present = new Set(p.scopeItems.map((i) => i.discipline));
  return SCOPE_DISCIPLINES.filter((d) => present.has(d));
}

/**
 * What has been done to a vessel, yard period by yard period, newest first,
 * with its current and planned projects above. Every period links to its
 * overview; dates are shown as published.
 */
export function VesselYardHistory({
  vesselName,
  projects,
  excluded,
  noPeriodLocated,
}: {
  vesselName: string;
  projects: Project[];
  excluded: VesselDetail["yardEvidence"];
  /** The register looked and found no reliable post-delivery period. */
  noPeriodLocated: boolean;
}) {
  const live = projects.filter((p) => !p.isDemo && p.status !== "COMPLETED");
  const history = projects
    .filter((p) => !p.isDemo && p.status === "COMPLETED")
    .sort((a, b) =>
      byMostRecent(
        { sortStart: a.yardPeriod?.sortStart ?? null, sortEnd: a.yardPeriod?.sortEnd ?? null },
        { sortStart: b.yardPeriod?.sortStart ?? null, sortEnd: b.yardPeriod?.sortEnd ?? null },
      ),
    );
  const years = history
    .map((p) => p.yardPeriod?.sortStart?.getUTCFullYear())
    .filter((y): y is number => typeof y === "number");
  const span = years.length
    ? `${Math.min(...years)}–${Math.max(...history.map((p) => p.yardPeriod?.sortEnd?.getUTCFullYear() ?? 0))}`
    : null;

  return (
    <section id="history" className="mb-6 scroll-mt-24">
      <SectionCard
        title="Yard history"
        headerRight={
          <span className="text-xs text-muted tnum">
            {history.length} {history.length === 1 ? "period" : "periods"}
            {span ? ` · ${span}` : ""}
          </span>
        }
        noPad
      >

        {live.length > 0 && (
          <div className="border-b border-line-soft px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Current &amp; planned
            </div>
            <ul className="mt-2 space-y-2">
              {live.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Link
                    href={`/projects/${p.id}`}
                    className="font-medium text-white hover:text-marine"
                  >
                    {p.code ?? p.name}
                  </Link>
                  <span className="text-muted">{p.name}</span>
                  <StatusBadge value={p.status} />
                  <span className="text-xs text-faint">
                    {p.arrivalDate || p.departureDate
                      ? `${fmtDate(p.arrivalDate)} – ${fmtDate(p.departureDate)}`
                      : "Yard period not yet booked"}
                    {p.yardName ? ` · ${p.yardName}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {history.length === 0 ? (
          <div className="flex items-start gap-3 px-5 py-5 text-sm text-muted">
            <History className="mt-0.5 h-4 w-4 shrink-0 text-marine" aria-hidden />
            {noPeriodLocated ? (
              <p>
                No sufficiently reliable post-delivery yard period has been located in the public
                sources reviewed. That is a gap in the evidence, not proof that no work was done:
                owner or manager maintenance records, class survey history and yard invoices would
                close it.
              </p>
            ) : (
              <p>No yard periods are recorded for this vessel yet.</p>
            )}
          </div>
        ) : (
          <ol className="divide-y divide-line-soft">
            {history.map((p) => {
              const r = p.yardPeriod;
              const place = r ? locationLine(r.cityText, r.countryText) : null;
              const formerly = r ? nameAtTime(r.nameAtPeriod, vesselName) : null;
              const disciplines = disciplinesOf(p);
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[180px_1fr]"
                >
                  <div>
                    <div className="text-sm font-semibold text-white tnum">
                      {r ? formatPeriod(r.startLabel, r.endLabel) : (p.code ?? p.name)}
                    </div>
                    {r?.precisionLabel && (
                      <div className="text-xs text-faint">{r.precisionLabel}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/projects/${p.id}`}
                        className="group inline-flex items-center gap-1 text-sm font-medium text-white hover:text-marine"
                      >
                        {r?.periodType ?? p.name}
                        <ArrowUpRight
                          className="h-3.5 w-3.5 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </Link>
                      <ConfidenceBadge value={r?.confidence ?? null} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {p.yardName ?? <span className="text-faint">{YARD_NOT_IDENTIFIED}</span>}
                      {place ? ` · ${place}` : ""}
                      {formerly ? ` · ${formerly}` : ""}
                      <span className="text-faint"> · {p.code}</span>
                    </div>
                    {disciplines.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Scope by discipline">
                        {disciplines.map((d) => (
                          <li key={d}>
                            <Badge tone="muted" className="text-[11px]">
                              <span title={SCOPE_DISCIPLINE_LABELS[d]}>{SHORT_DISCIPLINE[d]}</span>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {excluded.length > 0 && (
          <div className="border-t border-line-soft px-5 py-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
              <Ship className="h-3.5 w-3.5" aria-hidden />
              Claims considered and left out
            </div>
            <ul className="mt-2 space-y-2.5">
              {excluded.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="font-medium text-white">{e.issue}</span>
                  {e.confidence && (
                    <span className="ml-2 text-xs text-faint">
                      ({e.confidence.toLowerCase()} confidence)
                    </span>
                  )}
                  {e.qualification && (
                    <p className="mt-0.5 text-xs text-muted">{e.qualification}</p>
                  )}
                  {e.sourceUrl && (
                    <a
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent-bright hover:text-marine"
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
    </section>
  );
}
