// Preferred particulars against the vessel database.
//
// The register prefers the builder's published dimensions and keeps the
// vessel-database figures beside them rather than merging the two. A
// difference is a reason to review, not proof that either figure is wrong.
// Derived from observations, so the comparison stays current when a preferred
// value is edited in the application.

export type ComparedField = "loa" | "beam" | "grossTonnage" | "deliveredYear";

export type ComparisonRow = {
  key: ComparedField;
  label: string;
  unit: string | null;
  preferred: number | null;
  database: number | null;
  /** Preferred minus database, to two decimals; null when either is missing. */
  delta: number | null;
};

export type ComparisonFlag = "REVIEW" | "ALIGNED" | "NO_DATA";

export type DatabaseComparison = { rows: ComparisonRow[]; flag: ComparisonFlag };

/** The Field Evidence label holding each database figure. */
export const DATABASE_OBSERVATION: Record<ComparedField, string> = {
  loa: "Database static LOA",
  beam: "Database static beam",
  grossTonnage: "Database static GT",
  deliveredYear: "Database build year",
};

const ROWS: { key: ComparedField; label: string; unit: string | null }[] = [
  { key: "loa", label: "Length overall", unit: "m" },
  { key: "beam", label: "Beam", unit: "m" },
  { key: "grossTonnage", label: "Gross tonnage", unit: "GT" },
  { key: "deliveredYear", label: "Year", unit: null },
];

function toNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function compareWithDatabase(
  vessel: Partial<Record<ComparedField, number | null>>,
  observations: { fieldLabel: string; value: string }[]
): DatabaseComparison {
  const rows = ROWS.map(({ key, label, unit }) => {
    const preferred = vessel[key] ?? null;
    // The latest observation of a database figure wins if there are several.
    const matches = observations.filter((o) => o.fieldLabel === DATABASE_OBSERVATION[key]);
    const database = toNumber(matches[matches.length - 1]?.value);
    const delta =
      preferred != null && database != null ? Math.round((preferred - database) * 100) / 100 : null;
    return { key, label, unit, preferred, database, delta };
  });

  const compared = rows.filter((r) => r.delta != null);
  const flag: ComparisonFlag = !compared.length
    ? "NO_DATA"
    : compared.some((r) => r.delta !== 0)
      ? "REVIEW"
      : "ALIGNED";

  return { rows, flag };
}
