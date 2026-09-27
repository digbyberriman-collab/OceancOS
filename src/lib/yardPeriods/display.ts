// How a yard period reads on screen.
//
// Pure, so the wording is the same on the vessel's history, the project's
// overview and the fleet list, and testable. The rule throughout: show what
// the register published, at the precision it published it, and say plainly
// where it published nothing.

import { SCOPE_DISCIPLINES, SCOPE_DISCIPLINE_LABELS, type ScopeDiscipline } from "../enums";
import { NOT_ESTIMATED } from "./cost";
import { identifiedPlace } from "./importRegister";
import { formatPeriod } from "./period";

export { formatPeriod };

export const YARD_NOT_IDENTIFIED = "Yard not identified in public sources";

/** "Cartagena, Spain"; a repeated place ("Malta, Malta") once; null when neither is known. */
export function locationLine(city: string | null, country: string | null): string | null {
  const parts = [identifiedPlace(city), identifiedPlace(country)].filter((p): p is string => !!p);
  const unique = parts.filter(
    (p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i,
  );
  return unique.length ? unique.join(", ") : null;
}

/**
 * The vessel's name at the time, when it differs from today's: "as Equanimity".
 * A period spanning a renaming is published as "Tranquility / Draak"; today's
 * name is dropped from it. Null when the name is the same, or not recorded.
 */
export function nameAtTime(nameAtPeriod: string | null, currentName: string): string | null {
  const current = currentName.trim().toLowerCase();
  const then = (nameAtPeriod ?? "")
    .split("/")
    .map((n) => n.trim())
    .filter((n) => n && n.toLowerCase() !== current);
  return then.length ? `as ${then.join(" / ")}` : null;
}

/** A period's planning band, or what stands in for one. Never historical spend. */
export function planningBand(record: {
  costBandLabel: string | null;
  costBandOpenEnded: boolean;
}): {
  label: string;
  estimated: boolean;
} {
  if (!record.costBandLabel) return { label: NOT_ESTIMATED, estimated: false };
  return { label: record.costBandLabel, estimated: true };
}

export const PLANNING_BAND_CAVEAT =
  "Planning estimate — not historical spend. An order-of-magnitude band from published refit benchmarks, " +
  "deliberately wide; replace it with yard quotations, invoices or project accounts when they are available.";

export type ScopeGroup<T> = { discipline: ScopeDiscipline; label: string; items: T[] };

/** Scope lines grouped by discipline, in the disciplines' order, keeping each group's order. */
export function groupScope<T extends { discipline: string; sortOrder: number }>(
  items: T[],
): ScopeGroup<T>[] {
  return SCOPE_DISCIPLINES.map((discipline) => ({
    discipline,
    label: SCOPE_DISCIPLINE_LABELS[discipline],
    items: items
      .filter((i) => i.discipline === discipline)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.items.length > 0);
}

/** Contractors and designers, as a list. */
export function contractorList(text: string | null): string[] {
  return (text ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Newest first by when a period ended; undated periods last. */
export function byMostRecent<T extends { sortEnd: Date | null; sortStart: Date | null }>(
  a: T,
  b: T,
): number {
  const end = (x: T) => (x.sortEnd ?? x.sortStart)?.getTime() ?? -Infinity;
  return end(b) - end(a);
}
