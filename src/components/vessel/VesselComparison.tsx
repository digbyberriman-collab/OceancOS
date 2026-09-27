import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/workflow/SectionCard";
import type { DatabaseComparison } from "@/lib/vessels/comparison";
import { cn } from "@/lib/utils";

const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

function fmt(n: number | null, unit: string | null, grouped = true) {
  if (n == null) return "—";
  const s = grouped ? NUMBER.format(n) : String(n);
  return unit ? `${s} ${unit}` : s;
}

export function ComparisonFlagBadge({ flag }: { flag: DatabaseComparison["flag"] }) {
  if (flag === "REVIEW") return <Badge tone="warn">Differs from database — review</Badge>;
  if (flag === "ALIGNED") return <Badge tone="ok">Matches database</Badge>;
  return <Badge tone="muted">No database figures</Badge>;
}

/**
 * Preferred figures beside the vessel-database figures. Differences are shown,
 * not resolved: settling them needs the vessel's certificates.
 */
export function VesselComparison({ comparison }: { comparison: DatabaseComparison }) {
  return (
    <SectionCard title="Source comparison" headerRight={<ComparisonFlagBadge flag={comparison.flag} />} noPad>
      {comparison.flag === "NO_DATA" ? (
        <p className="p-5 text-sm text-muted">
          No vessel-database figures are recorded for this vessel yet, so there is nothing to compare against.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col" className="text-right">Preferred</th>
                <th scope="col" className="text-right">Database</th>
                <th scope="col" className="text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => {
                const year = row.key === "deliveredYear";
                return (
                  <tr key={row.key}>
                    <td className="text-muted">{row.label}</td>
                    <td className="text-right text-white">{fmt(row.preferred, row.unit, !year)}</td>
                    <td className="text-right text-muted">{fmt(row.database, row.unit, !year)}</td>
                    <td
                      className={cn(
                        "text-right font-medium",
                        row.delta == null ? "text-faint" : row.delta === 0 ? "text-ok" : "text-warn"
                      )}
                    >
                      {row.delta == null ? "—" : row.delta === 0 ? "None" : `${row.delta > 0 ? "+" : ""}${fmt(row.delta, row.unit, !year)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-line-soft px-3.5 py-2.5 text-xs text-faint">
            Preferred minus database. A difference is a reason to check the certificates, not proof either figure is wrong.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
