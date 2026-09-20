// Yard-period validation.
//
// These dates drive the Home timing cards, the time-progress ring and every
// derived figure, so a nonsensical period is not a cosmetic problem: it makes
// the project's headline numbers wrong. Kept pure so the rules are testable
// without a form or a database.

export type YardPeriodInput = {
  arrivalDate?: Date | null;
  haulOutDate?: Date | null;
  seaTrialsDate?: Date | null;
  departureDate?: Date | null;
};

export type DateProblem = { field: keyof YardPeriodInput; message: string };

/**
 * Check a yard period for order.
 *
 * Every date is optional: a project may be booked before the detail is known.
 * What is rejected is a combination that cannot be true.
 */
export function validateYardPeriod(input: YardPeriodInput): DateProblem[] {
  const problems: DateProblem[] = [];
  const { arrivalDate, haulOutDate, seaTrialsDate, departureDate } = input;

  if (arrivalDate && departureDate && departureDate <= arrivalDate) {
    problems.push({
      field: "departureDate",
      message: "Departure must be after arrival.",
    });
  }

  if (arrivalDate && haulOutDate && haulOutDate < arrivalDate) {
    problems.push({
      field: "haulOutDate",
      message: "Haul out cannot be before the vessel arrives.",
    });
  }

  if (departureDate && haulOutDate && haulOutDate > departureDate) {
    problems.push({
      field: "haulOutDate",
      message: "Haul out cannot be after departure.",
    });
  }

  if (arrivalDate && seaTrialsDate && seaTrialsDate < arrivalDate) {
    problems.push({
      field: "seaTrialsDate",
      message: "Sea trials cannot be before the vessel arrives.",
    });
  }

  // Sea trials after departure is a real scenario only if the yard period has
  // been extended, in which case the departure date is what is wrong.
  if (departureDate && seaTrialsDate && seaTrialsDate > departureDate) {
    problems.push({
      field: "seaTrialsDate",
      message: "Sea trials fall after departure. Extend the departure date first.",
    });
  }

  return problems;
}

/** Parse a date input's value. An empty field clears the date rather than erroring. */
export function parseDateField(value: FormDataEntryValue | null): Date | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Render a date for an `<input type="date">`. */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * Normalise a project code: upper case, no stray whitespace.
 * Codes are matched and sorted on, so casing drift causes duplicates.
 */
export function normaliseProjectCode(value: string): string | null {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, "-");
  return cleaned || null;
}
