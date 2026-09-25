import Link from "next/link";
import { AlertCircle, CheckCircle2, Ship } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { vesselIdsForUser } from "@/lib/vessels/access";
import { formatVesselValue, vesselCompleteness, vesselField } from "@/lib/vessels/fields";
import { compareWithDatabase, DATABASE_OBSERVATION } from "@/lib/vessels/comparison";
import { missingYardNumbers } from "@/lib/vessels/workbook";
import { EmptyState, PageHeader } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { VesselDataGaps } from "@/components/vessel/VesselDataGaps";
import { VerificationBadge } from "@/components/vessel/VesselDetailView";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const COLUMNS = ["loa", "beam", "grossTonnage"] as const;

/** Every vessel the user can reach, in one uniform table. */
export default async function FleetRegisterPage({
  searchParams,
}: {
  searchParams: { saved?: string; err?: string };
}) {
  const user = await requireUser();
  const ids = await vesselIdsForUser(user.id);
  if (!ids.length) {
    return <EmptyState icon={<Ship size={20} />} title="No vessels yet" hint="You are not on any project yet." />;
  }

  const [vessels, fleetGaps, allYardNumbers] = await Promise.all([
    prisma.vessel.findMany({
      where: { id: { in: ids }, archivedAt: null },
      include: {
        projects: { where: { archivedAt: null }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } },
        dataGaps: { select: { status: true } },
        observations: {
          where: { fieldLabel: { in: Object.values(DATABASE_OBSERVATION) } },
          select: { fieldLabel: true, value: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    }),
    prisma.vesselDataGap.findMany({ where: { vesselId: null }, orderBy: { createdAt: "asc" } }),
    // Unmapped numbers are worked out from the whole register, not the vessels
    // this user can see: a vessel hidden from a scoped user is still mapped.
    prisma.vessel.findMany({
      where: { archivedAt: null, yardNumber: { not: null } },
      select: { yardNumber: true },
    }),
  ]);

  // Yard-numbered vessels in build order, then any without a yard number by name.
  vessels.sort((a, b) =>
    a.yardNumber && b.yardNumber
      ? a.yardNumber.localeCompare(b.yardNumber, "en", { numeric: true })
      : a.yardNumber
        ? -1
        : b.yardNumber
          ? 1
          : a.name.localeCompare(b.name)
  );

  const rows = vessels.map((v) => ({
    vessel: v,
    completeness: vesselCompleteness(v),
    comparison: compareWithDatabase(v, v.observations),
    openGaps: v.dataGaps.filter((g) => g.status !== "CLOSED").length,
  }));

  const openGaps = rows.reduce((s, r) => s + r.openGaps, 0);
  const toReview = rows.filter((r) => r.comparison.flag === "REVIEW").length;
  const verified = rows.filter((r) => r.vessel.verification === "CERTIFICATE_VERIFIED").length;
  const avgComplete = Math.round(rows.reduce((s, r) => s + r.completeness.pct, 0) / rows.length);
  const unmapped = missingYardNumbers(allYardNumbers.map((v) => v.yardNumber));

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Knowledge"
        title="Fleet register"
        subtitle="Every vessel's particulars in one table. Open a vessel for its full particulars, the evidence behind each figure and what still needs a certificate."
      />

      {searchParams.saved === "gap" && (
        <div role="status" className="mb-5 flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok/10 px-3.5 py-3 text-sm text-ok">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Data gap updated.</span>
        </div>
      )}
      {searchParams.err && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{searchParams.err}</span>
        </div>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Vessels" value={String(rows.length)} />
        <Tile label="Particulars recorded" value={`${avgComplete}%`} hint="average across vessels" />
        <Tile label="Open data gaps" value={String(openGaps)} tone={openGaps ? "warn" : "ok"} />
        <Tile
          label="Certificate-verified"
          value={`${verified} of ${rows.length}`}
          hint={toReview ? `${toReview} differ from the vessel database` : undefined}
          tone={verified === rows.length ? "ok" : "neutral"}
        />
      </dl>

      <SectionCard title="Vessels" noPad>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Yard no.</th>
                <th scope="col">Vessel</th>
                <th scope="col">Delivered</th>
                <th scope="col">IMO</th>
                <th scope="col">Flag</th>
                <th scope="col" className="text-right">LOA</th>
                <th scope="col" className="text-right">Beam</th>
                <th scope="col" className="text-right">GT</th>
                <th scope="col">Recorded</th>
                <th scope="col" className="text-right">Open gaps</th>
                <th scope="col">Database</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ vessel: v, completeness, comparison, openGaps: gaps }) => (
                <tr key={v.id}>
                  <td className="font-medium text-white">{v.yardNumber ?? <Dash />}</td>
                  <td className="min-w-[180px]">
                    <Link href={`/vessels/${v.id}`} className="font-medium text-white hover:text-marine">
                      {v.name}
                    </Link>
                    <span className="block text-[11px] text-faint">
                      {v.vesselType ?? "Type not recorded"}
                      {/* The project code is the yard number for register vessels; show it only when it adds something. */}
                      {v.projects
                        .filter((p) => p.code && p.code !== v.yardNumber)
                        .map((p) => ` · ${p.code}`)
                        .join("")}
                    </span>
                  </td>
                  <td>{v.deliveredYear ?? <Dash />}</td>
                  <td className="text-muted">{v.imo ?? <Dash />}</td>
                  <td className="whitespace-nowrap text-muted">{v.flag ?? <Dash />}</td>
                  {COLUMNS.map((key) => (
                    <td key={key} className="whitespace-nowrap text-right">
                      {formatVesselValue(vesselField(key), v[key]) ?? <Dash />}
                    </td>
                  ))}
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-ink-800" aria-hidden>
                        <div className="h-full rounded-full bg-marine" style={{ width: `${completeness.pct}%` }} />
                      </div>
                      <span className="text-xs text-muted">{completeness.pct}%</span>
                    </div>
                  </td>
                  <td className={cn("text-right", gaps ? "text-warn" : "text-faint")}>{gaps}</td>
                  <td>
                    {comparison.flag === "REVIEW" ? (
                      <Badge tone="warn">Review</Badge>
                    ) : comparison.flag === "ALIGNED" ? (
                      <Badge tone="ok">Aligned</Badge>
                    ) : (
                      <Dash />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft px-3.5 py-2.5 text-xs text-faint">
          <span>Figures are the preferred values; alternatives are kept on each vessel&apos;s evidence.</span>
          {rows.some((r) => r.vessel.verification === "PUBLIC_SOURCE") && (
            <span className="inline-flex items-center gap-1.5">
              <VerificationBadge value="PUBLIC_SOURCE" /> unless marked otherwise on the vessel
            </span>
          )}
        </div>
      </SectionCard>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <VesselDataGaps
          gaps={fleetGaps}
          canEdit={hasPermission(user, PERMISSIONS.VESSEL_EDIT)}
          returnTo="/vessels"
          title="Fleet-level data gaps"
          emptyHint="No gaps that apply to the register as a whole."
        />
        <SectionCard title="Unmapped yard numbers">
          {unmapped.length === 0 ? (
            <p className="text-sm text-muted">Every number in each yard series is accounted for.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {unmapped.map((code) => (
                  <span key={code} className="rounded-md border border-dashed border-line px-2 py-1 text-xs font-medium text-muted tnum">
                    {code}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted">
                Gaps in the build numbering with no vessel mapped to them. No status is inferred: a missing number is not an
                unbuilt, cancelled or confidential project until the builder confirms it.
              </p>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Dash() {
  return <span className="text-faint">—</span>;
}

function Tile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "neutral";
}) {
  return (
    <div className="surface px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tnum",
          tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-white"
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}
