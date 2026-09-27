// Planning cost bands.
//
// The register never has a reported cost for a period — every one is
// "Undisclosed" — and gives instead an indicative band ("€0.5m–€2m",
// "€30m–€70m+") where the published scope is detailed enough. A band is a
// planning estimate, anchored to industry refit benchmarks and deliberately
// wide; it is never historical spend and never feeds a budget or a total.
// Bounds are Decimal like all money, for sorting and filtering.

import { Prisma } from "@prisma/client";

export type CostBand = {
  label: string;
  low: Prisma.Decimal;
  high: Prisma.Decimal;
  /** "€30m–€70m+": the upper bound is a floor, not a ceiling. */
  openEnded: boolean;
  currency: "EUR";
};

const BAND = /^€\s*(\d+(?:\.\d+)?)\s*m\s*[–-]\s*€\s*(\d+(?:\.\d+)?)\s*m\s*(\+)?$/i;
const MILLION = new Prisma.Decimal(1_000_000);

/**
 * A published band, or null when none was given ("Not estimated", blank).
 * Throws on anything else, so an unfamiliar format is noticed rather than
 * stored as the wrong figure.
 */
export function parseCostBand(text: string | null | undefined): CostBand | null {
  const label = (text ?? "").trim();
  if (!label || /^not estimated$/i.test(label)) return null;
  const m = BAND.exec(label);
  if (!m) throw new Error(`Yard-period register: cannot read the cost band "${label}".`);
  const low = new Prisma.Decimal(m[1]).times(MILLION);
  const high = new Prisma.Decimal(m[2]).times(MILLION);
  if (low.greaterThan(high))
    throw new Error(`Yard-period register: the cost band "${label}" runs backwards.`);
  return { label, low, high, openEnded: Boolean(m[3]), currency: "EUR" };
}

/** What a period with no band says instead. */
export const NOT_ESTIMATED =
  "Not estimated — the published scope is too thin for a responsible estimate.";
