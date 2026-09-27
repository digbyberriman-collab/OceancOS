import Link from "next/link";
import { Anchor, ArrowUpRight } from "lucide-react";
import { DemoBadge } from "@/components/ui/DemoBadge";
import { formatVesselValue, vesselField, type VesselFieldKey, type VesselParticulars } from "@/lib/vessels/fields";

const STRIP: { key: VesselFieldKey; label: string }[] = [
  { key: "imo", label: "IMO" },
  { key: "flag", label: "Flag" },
  { key: "loa", label: "LOA" },
  { key: "grossTonnage", label: "GT" },
  { key: "deliveredYear", label: "Delivered" },
];

/** The active project's vessel in one line, for the top of project pages. */
export function VesselStrip({
  vessel,
  projectCode,
  isDemo = false,
}: {
  vessel: Partial<VesselParticulars> & { name: string };
  projectCode?: string | null;
  /** The active project is demo data; say so beside the vessel it is parked on. */
  isDemo?: boolean;
}) {
  return (
    <div className="surface mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 animate-fade-up">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-marine/10 text-marine ring-1 ring-marine/20">
          <Anchor className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{vessel.name}</span>
            {isDemo && <DemoBadge />}
          </div>
          <div className="text-[11px] text-faint">
            {[projectCode, vessel.vesselType].filter(Boolean).join(" · ") || "Vessel"}
          </div>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {STRIP.map(({ key, label }) => (
          <div key={key} className="flex items-baseline gap-1.5">
            <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
            <dd className="font-medium text-white tnum">
              {formatVesselValue(vesselField(key), vessel[key]) ?? <span className="font-normal text-faint">—</span>}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        href="/vessel"
        className="group ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent-bright transition-colors hover:text-marine"
      >
        Vessel particulars
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
