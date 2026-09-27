// Yard-period dates, at the precision they were published.
//
// The register gives dates as "2012-Q2", "2017-Spring", "2019-03",
// "2023-06 approx." or "Date unverified", and says what the precision is.
// Nothing here turns a label into a day it does not name: a label resolves to
// the range of days it covers, which is used to order periods and to filter
// them by year, and the label itself is what is shown.

export type LabelRange = { start: Date; end: Date; approximate: boolean };

export const UNDATED_LABEL = "Date unverified";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
/** The last day of a month; `m` is zero-based and may run past December. */
const lastDay = (y: number, m: number) => utc(y, m + 1, 0);

const SEASON_MONTHS: Record<string, [number, number]> = {
  // [first month, last month], zero-based, relative to the labelled year.
  spring: [2, 4],
  summer: [5, 7],
  autumn: [8, 10],
  // Winter 2022 is December 2022 to February 2023 ("Winter 2022/23").
  winter: [11, 13],
};

/**
 * The days a published date label covers, or null for "Date unverified".
 * Throws on any other label, so a new form in a later edition is noticed
 * rather than dated wrongly.
 */
export function parsePeriodLabel(label: string): LabelRange | null {
  const raw = label.trim();
  if (raw.toLowerCase() === UNDATED_LABEL.toLowerCase()) return null;

  const approximate = /\s+approx\.?$/i.test(raw);
  const text = raw.replace(/\s+approx\.?$/i, "").trim();

  let m = /^(\d{4})$/.exec(text);
  if (m) {
    const y = Number(m[1]);
    return { start: utc(y, 0, 1), end: utc(y, 11, 31), approximate };
  }
  m = /^(\d{4})-Q([1-4])$/i.exec(text);
  if (m) {
    const y = Number(m[1]);
    const q = Number(m[2]) - 1;
    return { start: utc(y, q * 3, 1), end: lastDay(y, q * 3 + 2), approximate };
  }
  m = /^(\d{4})-(\d{2})$/.exec(text);
  if (m) {
    const y = Number(m[1]);
    const month = Number(m[2]) - 1;
    if (month < 0 || month > 11)
      throw new Error(`Yard-period register: "${label}" is not a month.`);
    return { start: utc(y, month, 1), end: lastDay(y, month), approximate };
  }
  m = /^(\d{4})-(Spring|Summer|Autumn|Winter)$/i.exec(text);
  if (m) {
    const y = Number(m[1]);
    const [first, last] = SEASON_MONTHS[m[2].toLowerCase()];
    return { start: utc(y, first, 1), end: lastDay(y, last), approximate };
  }
  throw new Error(`Yard-period register: cannot read the date "${label}".`);
}

/**
 * Ordering bounds for a period: the first day its start label covers and the
 * last day its end label covers. Null bounds for an undated period.
 */
export function periodBounds(
  startLabel: string,
  endLabel: string,
): { sortStart: Date | null; sortEnd: Date | null; approximate: boolean } {
  const start = parsePeriodLabel(startLabel);
  const end = parsePeriodLabel(endLabel);
  if (start && end && start.start.getTime() > end.end.getTime()) {
    throw new Error(
      `Yard-period register: "${startLabel}" to "${endLabel}" ends before it starts.`,
    );
  }
  return {
    sortStart: start?.start ?? null,
    sortEnd: end?.end ?? null,
    approximate: Boolean(start?.approximate || end?.approximate),
  };
}

/** A period as published: one label when start and end are the same. */
export function formatPeriod(startLabel: string, endLabel: string): string {
  const start = startLabel.trim();
  const end = endLabel.trim();
  return start === end ? start : `${start} – ${end}`;
}

/** The year a period starts in, for codes and filters; null when undated. */
export function startYear(startLabel: string): number | null {
  return parsePeriodLabel(startLabel)?.start.getUTCFullYear() ?? null;
}
