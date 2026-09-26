import Link from "next/link";
import { AlertCircle, CheckCircle2, Pencil, Ship } from "lucide-react";
import { PageHeader } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { VesselHeadline } from "./VesselHeadline";
import { VesselParticulars } from "./VesselParticulars";
import { ComparisonFlagBadge, VesselComparison } from "./VesselComparison";
import { VesselDataGaps } from "./VesselDataGaps";
import { VesselEvidence } from "./VesselEvidence";
import { VESSEL_VERIFICATION_LABELS } from "@/lib/enums";
import { vesselCompleteness } from "@/lib/vessels/fields";
import { compareWithDatabase } from "@/lib/vessels/comparison";
import type { VesselDetail } from "@/lib/vessels/access";

const VERIFICATION_TONE: Record<string, "ok" | "warn" | "muted"> = {
  CERTIFICATE_VERIFIED: "ok",
  PUBLIC_SOURCE: "warn",
  UNVERIFIED: "muted",
};

export function VerificationBadge({ value }: { value: string }) {
  const label = VESSEL_VERIFICATION_LABELS[value as keyof typeof VESSEL_VERIFICATION_LABELS] ?? value;
  return <Badge tone={VERIFICATION_TONE[value] ?? "muted"}>{label}</Badge>;
}

/**
 * The whole of one vessel: headline figures, every particular, what still
 * needs evidence, how the figures compare with the vessel database, and the
 * observations behind them. The same view serves the active project's vessel
 * page and the fleet register, so every vessel reads identically.
 */
export function VesselDetailView({
  vessel,
  canEdit,
  returnTo,
  searchParams,
  eyebrow = "Vessel",
}: {
  vessel: VesselDetail;
  canEdit: boolean;
  returnTo: string;
  searchParams?: { saved?: string; err?: string };
  eyebrow?: string;
}) {
  const completeness = vesselCompleteness(vessel);
  const comparison = compareWithDatabase(vessel, vessel.observations);
  const openGaps = vessel.dataGaps.filter((g) => g.status !== "CLOSED").length;
  const subtitle =
    [vessel.yardNumber, vessel.vesselType, vessel.builder, vessel.deliveredYear && `delivered ${vessel.deliveredYear}`]
      .filter(Boolean)
      .join(" · ") || "Particulars not yet recorded";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={eyebrow}
        title={vessel.name}
        subtitle={subtitle}
        actions={
          <>
            <Link href="/vessels" className="btn-ghost">
              <Ship className="h-4 w-4" aria-hidden />
              Fleet register
            </Link>
            {canEdit && (
              <Link href={`/vessels/${vessel.id}/edit`} className="btn-primary">
                <Pencil className="h-4 w-4" aria-hidden />
                Edit particulars
              </Link>
            )}
          </>
        }
      />

      {searchParams?.saved === "1" && (
        <Banner tone="ok">Particulars saved. Each changed value was added to the field evidence.</Banner>
      )}
      {searchParams?.saved === "0" && <Banner tone="ok">Nothing had changed, so nothing was saved.</Banner>}
      {searchParams?.saved === "gap" && <Banner tone="ok">Data gap updated.</Banner>}
      {searchParams?.err && <Banner tone="bad">{searchParams.err}</Banner>}

      {/* Status: how far these particulars can be trusted, and how complete they are. */}
      <div className="surface mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
        <VerificationBadge value={vessel.verification} />
        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800"
            role="progressbar"
            aria-label="Particulars recorded"
            aria-valuenow={completeness.pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-marine" style={{ width: `${completeness.pct}%` }} />
          </div>
          <span className="whitespace-nowrap text-xs text-muted tnum">
            {completeness.filled} of {completeness.total} particulars recorded
          </span>
        </div>
        <ComparisonFlagBadge flag={comparison.flag} />
        <a href="#gaps" className="text-xs text-muted hover:text-white tnum">
          {openGaps} open data {openGaps === 1 ? "gap" : "gaps"}
        </a>
        {vessel.projects.length > 0 && (
          <span className="text-xs text-muted">
            {vessel.projects.length === 1 ? "Project " : "Projects "}
            {vessel.projects.map((p) => (
              <span key={p.id} className="ml-1 font-medium text-white">
                {p.code ?? p.name}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="mb-6">
        <VesselHeadline vessel={vessel} />
      </div>

      <VesselParticulars vessel={vessel} observations={vessel.observations} />

      <div id="gaps" className="mt-2 grid scroll-mt-24 grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <VesselDataGaps gaps={vessel.dataGaps} canEdit={canEdit} returnTo={returnTo} />
        <div>
          <VesselComparison comparison={comparison} />
        </div>
      </div>

      <div id="evidence" className="mt-4 scroll-mt-24">
        <VesselEvidence observations={vessel.observations} />
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === "ok" ? "status" : "alert"}
      className={
        tone === "ok"
          ? "mb-4 flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok/10 px-3.5 py-3 text-sm text-ok"
          : "mb-4 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm text-bad"
      }
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
