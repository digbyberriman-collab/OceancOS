// The projects register's filters, as a Prisma `where`.
//
// Pure, so what each filter admits is testable. Always scoped to the
// projects the caller can reach, and never the demo workspace: the register
// is a knowledge page about real vessels.

import type { Prisma } from "@prisma/client";
import { CONFIDENCE_LEVELS, PROJECT_STATUSES } from "../enums";

export type RegisterFilters = {
  vessel?: string;
  status?: string;
  yard?: string;
  year?: string;
  confidence?: string;
};

/** Filters as given, with anything that is not a real choice dropped. */
export function cleanFilters(params: RegisterFilters): RegisterFilters {
  const year = Number(params.year);
  return {
    vessel: params.vessel?.trim() || undefined,
    status: (PROJECT_STATUSES as readonly string[]).includes(params.status ?? "")
      ? params.status
      : undefined,
    yard: params.yard?.trim() || undefined,
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? String(year) : undefined,
    confidence: (CONFIDENCE_LEVELS as readonly string[]).includes(params.confidence ?? "")
      ? params.confidence
      : undefined,
  };
}

export function isFiltered(filters: RegisterFilters): boolean {
  return Object.values(filters).some(Boolean);
}

export function projectRegisterWhere(
  reachableIds: string[],
  filters: RegisterFilters,
): Prisma.ProjectWhereInput {
  const and: Prisma.ProjectWhereInput[] = [
    { id: { in: reachableIds } },
    { isDemo: false },
    { archivedAt: null },
  ];
  if (filters.vessel) and.push({ vessel: { yardNumber: filters.vessel } });
  if (filters.status) and.push({ status: filters.status });
  if (filters.yard) {
    and.push({
      OR: [
        { yardName: { contains: filters.yard, mode: "insensitive" } },
        { yardPeriod: { yardText: { contains: filters.yard, mode: "insensitive" } } },
        { yardPeriod: { cityText: { contains: filters.yard, mode: "insensitive" } } },
        { yardPeriod: { countryText: { contains: filters.yard, mode: "insensitive" } } },
      ],
    });
  }
  if (filters.year) {
    // A period that touches the year at all: started by its end, ended after its start.
    const from = new Date(Date.UTC(Number(filters.year), 0, 1));
    const to = new Date(Date.UTC(Number(filters.year), 11, 31));
    and.push({
      OR: [
        { yardPeriod: { sortStart: { lte: to }, sortEnd: { gte: from } } },
        { arrivalDate: { lte: to }, departureDate: { gte: from } },
      ],
    });
  }
  if (filters.confidence) and.push({ yardPeriod: { confidence: filters.confidence } });
  return { AND: and };
}
