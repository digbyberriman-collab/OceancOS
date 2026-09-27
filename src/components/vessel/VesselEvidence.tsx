import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { VESSEL_FIELDS, isWebUrl } from "@/lib/vessels/fields";
import { fmtDate } from "@/lib/utils";

export type EvidenceRow = {
  id: string;
  fieldKey: string | null;
  fieldLabel: string;
  value: string;
  unit: string | null;
  basis: string | null;
  qualification: string | null;
  sourceCode: string | null;
  sourceUrl: string | null;
  observedOn: Date | null;
  origin: string;
  source: { publisher: string | null; sourceType: string | null; url: string | null } | null;
};

/** Units that read better left off a value ("12", not "12 persons"). */
const QUIET_UNITS = new Set(["year", "persons", "cabins"]);

/**
 * Every sourced observation behind the particulars, grouped by field in the
 * same order as the particulars. Alternatives sit side by side; nothing here
 * is merged or overwritten.
 */
export function VesselEvidence({ observations }: { observations: EvidenceRow[] }) {
  const groups = [
    ...VESSEL_FIELDS.map((f) => ({
      key: f.key as string,
      label: f.label,
      rows: observations.filter((o) => o.fieldKey === f.key),
    })),
    { key: "other", label: "Other", rows: observations.filter((o) => !o.fieldKey) },
  ].filter((g) => g.rows.length);

  return (
    <SectionCard
      title="Field evidence"
      headerRight={<span className="text-xs text-muted tnum">{observations.length} observations</span>}
      noPad
    >
      {groups.length === 0 ? (
        <p className="p-5 text-sm text-muted">
          No sourced observations yet. Values entered on the particulars form are recorded here with their basis.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Observed as</th>
                <th scope="col">Value</th>
                <th scope="col">Basis</th>
                <th scope="col">Source</th>
                <th scope="col">Qualification</th>
                <th scope="col">Checked</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.key} id={`evidence-${group.key}`} className="scroll-mt-24">
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={6}
                    className="!bg-ink-950/60 !py-2 text-[11px] !normal-case tracking-normal text-white"
                  >
                    {group.label}
                    <span className="ml-2 font-normal text-faint">{group.rows.length}</span>
                  </th>
                </tr>
                {group.rows.map((o) => {
                  const url = [o.source?.url, o.sourceUrl].find(isWebUrl);
                  return (
                    <tr key={o.id}>
                      <td className="min-w-[150px] text-muted">
                        {o.fieldLabel}
                        {o.origin === "MANUAL" && (
                          <Badge tone="info" className="ml-2">
                            Entered
                          </Badge>
                        )}
                      </td>
                      <td className="min-w-[110px] max-w-[260px] font-medium text-white">
                        {o.value}
                        {o.unit && !QUIET_UNITS.has(o.unit) ? ` ${o.unit}` : ""}
                      </td>
                      <td className="min-w-[160px] text-muted">{o.basis ?? "—"}</td>
                      <td className="min-w-[160px]">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 text-accent-bright transition-colors hover:text-marine"
                          >
                            {o.source?.publisher ?? o.sourceCode ?? "Source"}
                            <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-muted">{o.source?.publisher ?? o.sourceCode ?? "—"}</span>
                        )}
                        {o.source?.sourceType && (
                          <span className="block text-[11px] text-faint">{o.source.sourceType}</span>
                        )}
                      </td>
                      <td className="min-w-[220px] max-w-[340px] text-xs text-faint">{o.qualification ?? "—"}</td>
                      <td className="whitespace-nowrap text-muted">{fmtDate(o.observedOn)}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </SectionCard>
  );
}
