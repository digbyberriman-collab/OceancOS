// Project timing and progress metrics.
//
// These reproduce the formulas printed on The Bridge's Home page
// (BRIDGE_ALIGNMENT_PLAN.md §1.4):
//
//   Work progress % = Σ(progress % × accepted value) ÷ Σ(accepted value)
//   Time progress % = (today − arrival) ÷ (departure − arrival)
//
// Pure functions with no database access so they can be unit-tested and reused
// by the Yard Home page, the job list section headers and any export.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two instants, positive when `to` is after `from`. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export type ProjectTiming = {
  /** Days since arrival. Null until the vessel has arrived. */
  startedDaysAgo: number | null;
  /** Days until departure. Negative once departure has passed. */
  finishInDays: number | null;
  /** Total length of the yard period, arrival to departure. */
  onsiteDays: number | null;
  /** Elapsed share of the yard period, 0–100, clamped. */
  timePct: number | null;
};

/**
 * Yard-period timing. Every field is null when the dates needed to compute it
 * are missing, so a project with no schedule yet renders blanks rather than
 * misleading zeroes.
 */
export function projectTiming(input: {
  arrivalDate?: Date | null;
  departureDate?: Date | null;
  now?: Date;
}): ProjectTiming {
  const { arrivalDate, departureDate } = input;
  const now = input.now ?? new Date();

  const startedDaysAgo = arrivalDate ? daysBetween(arrivalDate, now) : null;
  const finishInDays = departureDate ? daysBetween(now, departureDate) : null;

  let onsiteDays: number | null = null;
  let timePct: number | null = null;

  if (arrivalDate && departureDate) {
    const span = daysBetween(arrivalDate, departureDate);
    onsiteDays = span;
    // A zero- or negative-length yard period has no meaningful elapsed share.
    if (span > 0) {
      const elapsed = now.getTime() - arrivalDate.getTime();
      const total = departureDate.getTime() - arrivalDate.getTime();
      timePct = clampPct((elapsed / total) * 100);
    }
  }

  return { startedDaysAgo, finishInDays, onsiteDays, timePct };
}

export type WeightedProgressItem = {
  /** Yard-reported completion of the job, 0–100. */
  progressPct: number;
  /** Accepted value of the job, in project currency. */
  acceptedValue: number;
};

/**
 * Value-weighted work progress across accepted jobs.
 *
 * Jobs with no accepted value carry no weight, matching The Bridge: a €0 job
 * at 100% must not drag the project figure. Returns null when nothing is
 * accepted yet, so the caller can show a placeholder instead of 0%.
 */
export function workProgressPct(items: WeightedProgressItem[]): number | null {
  const totalValue = items.reduce((sum, i) => sum + Math.max(0, i.acceptedValue), 0);
  if (totalValue <= 0) return null;
  const weighted = items.reduce(
    (sum, i) => sum + clampPct(i.progressPct) * Math.max(0, i.acceptedValue),
    0
  );
  return clampPct(weighted / totalValue);
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export type YardPeriodState =
  /** A historical yard period: a record, not live work. */
  | { kind: "COMPLETED" }
  /** No arrival or departure set yet. */
  | { kind: "NO_DATES" }
  | { kind: "UPCOMING"; arrivesInDays: number }
  | { kind: "IN_PROGRESS" }
  /** Departure has passed but the project is still open. */
  | { kind: "OVERRUN"; departedDaysAgo: number };

/**
 * Where a project stands against its yard period, for choosing what the
 * dashboard shows. Time elapsed against the clock only means something while
 * the vessel is in the yard; before arrival, after departure or for a
 * completed record, a ring stuck at 0% or 100% "behind the clock" is noise.
 */
export function yardPeriodState(input: {
  status: string;
  arrivalDate?: Date | null;
  departureDate?: Date | null;
  now?: Date;
}): YardPeriodState {
  if (input.status === "COMPLETED") return { kind: "COMPLETED" };
  const { arrivalDate, departureDate } = input;
  if (!arrivalDate || !departureDate) return { kind: "NO_DATES" };
  const now = input.now ?? new Date();
  if (now < arrivalDate) return { kind: "UPCOMING", arrivesInDays: daysBetween(now, arrivalDate) };
  if (now > departureDate) return { kind: "OVERRUN", departedDaysAgo: daysBetween(departureDate, now) };
  return { kind: "IN_PROGRESS" };
}
