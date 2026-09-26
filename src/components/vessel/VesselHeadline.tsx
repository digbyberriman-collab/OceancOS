import { formatVesselValue, vesselField, type VesselFieldKey, type VesselParticulars } from "@/lib/vessels/fields";

const HEADLINE: VesselFieldKey[] = ["loa", "beam", "grossTonnage", "deliveredYear", "flag", "guests"];

const SHORT_LABEL: Partial<Record<VesselFieldKey, string>> = {
  loa: "LOA",
  grossTonnage: "Gross tonnage",
};

/** The six figures people ask for first, in the same order for every vessel. */
export function VesselHeadline({ vessel }: { vessel: Partial<VesselParticulars> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {HEADLINE.map((key) => {
        const field = vesselField(key);
        const text = formatVesselValue(field, vessel[key]);
        return (
          <div key={key} className="rounded-lg border border-line-soft bg-ink-950/40 px-3 py-2.5">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">
              {SHORT_LABEL[key] ?? field.label}
            </dt>
            <dd className="mt-1 truncate text-base font-semibold tracking-tight tnum">
              {text ?? <span className="font-normal text-faint">Not recorded</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
