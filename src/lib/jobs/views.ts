// Jobs list sub-views.
//
// The Bridge splits the same object across New Quotes, New Purchases, Accepted,
// Pending, Cancelled Works, Cancelled Quotes and a Worklist. Each is a filter on
// status and contract type rather than a different table, so they live here as
// data and the page simply reads them.

import { Prisma } from "@prisma/client";
import type { JobStatus } from "@/lib/enums";
import {
  JOB_ACCEPTED_STATUSES,
  JOB_PENDING_STATUSES,
} from "./workflow";

export type JobViewKey =
  | "requests"
  | "purchases"
  | "pending"
  | "accepted"
  | "cancelled-works"
  | "cancelled-quotes"
  | "worklist";

export type JobView = {
  key: JobViewKey;
  label: string;
  /** One line explaining what the reader is looking at. */
  blurb: string;
  statuses: JobStatus[] | null;
  contractTypes?: string[];
};

export const JOB_VIEWS: JobView[] = [
  {
    key: "requests",
    label: "New requests",
    blurb: "Raised by the vessel and waiting for the yard to price.",
    statuses: ["NEW_REQUEST"],
  },
  {
    key: "purchases",
    label: "New purchases",
    blurb: "Supply-only items requested from the yard.",
    statuses: ["NEW_REQUEST", "QUOTE_SENT", "EXPIRED"],
    contractTypes: ["PURCHASE"],
  },
  {
    key: "pending",
    label: "Pending",
    blurb: "Quoted and waiting on a decision from the vessel.",
    statuses: ["QUOTE_SENT", "EXPIRED"],
  },
  {
    key: "accepted",
    label: "Accepted",
    blurb: "Authorised work, in progress or complete.",
    statuses: [...JOB_ACCEPTED_STATUSES, "CLIENT_ACCEPTED"],
  },
  {
    key: "cancelled-works",
    label: "Cancelled works",
    blurb: "Work that was accepted and then stopped.",
    statuses: ["CANCELLED_WORKS"],
  },
  {
    key: "cancelled-quotes",
    label: "Cancelled quotes",
    blurb: "Quotes withdrawn before they were accepted.",
    statuses: ["CANCELLED_QUOTE"],
  },
  {
    key: "worklist",
    label: "Worklist",
    blurb: "Every quotation input and its status, in one flat table.",
    statuses: null,
  },
];

export function jobView(key: string | undefined): JobView {
  return JOB_VIEWS.find((v) => v.key === key) ?? JOB_VIEWS[2]; // Pending is the default
}

/** One group's worth of `prisma.job.groupBy({ by: ["status", "contractType"] })`. */
export type JobStatusContractGroup = { status: string; contractType: string; _count: { _all: number } };

/**
 * Every view's count, derived from one grouped aggregate instead of one
 * `job.count` per view (ACTION_PLAN.md G4.2, performance `[QUERY]` — seven
 * sequential `SELECT COUNT(*)` statements on every `/jobs` render,
 * unconditionally, even when the caller has filtered to one section).
 *
 * Deliberately whole-project counts, matching the tab counts before this
 * change: they do not take `q`, `sectionLetter` or `favouriteOf` into
 * account, so a tab's number does not shift as the caller types a search.
 */
export function viewCountsFromGroups(groups: JobStatusContractGroup[]): Map<JobViewKey, number> {
  return new Map(
    JOB_VIEWS.map((v) => [
      v.key,
      groups
        .filter(
          (g) =>
            (!v.statuses || v.statuses.includes(g.status as JobStatus)) &&
            (!v.contractTypes || v.contractTypes.includes(g.contractType))
        )
        .reduce((sum, g) => sum + g._count._all, 0),
    ])
  );
}

/**
 * The Prisma filter for a view, combined with the caller's search and section.
 *
 * Kept as one function so the list and its counts can never drift apart.
 */
export function jobWhere(opts: {
  projectId: string;
  view: JobView;
  q?: string;
  sectionLetter?: string;
  favouriteOf?: string;
}): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {
    projectId: opts.projectId,
    archivedAt: null,
  };

  if (opts.view.statuses) where.status = { in: opts.view.statuses };
  if (opts.view.contractTypes) where.contractType = { in: opts.view.contractTypes };

  if (opts.sectionLetter) where.section = { letter: opts.sectionLetter };

  if (opts.favouriteOf) where.favourites = { some: { userId: opts.favouriteOf } };

  const q = opts.q?.trim();
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { clientRef: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export type JobGroup<T> = {
  groupCode: string;
  jobs: T[];
  total: Prisma.Decimal;
  /** Value-weighted progress across the group, or null when nothing is priced. */
  progressPct: number | null;
};

/**
 * Group jobs under their code group, the way a yard's own quote pack reads.
 *
 * Groups are ordered by their code, and a group's progress is weighted by value
 * so a large job barely started is not masked by a small finished one. Summed
 * with `Prisma.Decimal` rather than `+`, per ACTION_PLAN.md G3.2 — `total` is
 * money and this group total is what the worklist header displays.
 */
export function groupJobs<
  T extends { groupCode: string | null; code: string; total: Prisma.Decimal; progressPct: number },
>(jobs: T[], compare: (a: string, b: string) => number): JobGroup<T>[] {
  const byGroup = new Map<string, T[]>();
  for (const job of jobs) {
    const key = job.groupCode ?? job.code;
    const list = byGroup.get(key);
    if (list) list.push(job);
    else byGroup.set(key, [job]);
  }

  return [...byGroup.entries()]
    .map(([groupCode, list]) => {
      const sorted = [...list].sort((a, b) => compare(a.code, b.code));
      const total = sorted.reduce((sum, j) => sum.plus(j.total), new Prisma.Decimal(0));
      const weighted = sorted.reduce(
        (sum, j) => sum.plus(j.total.times(j.progressPct)),
        new Prisma.Decimal(0)
      );
      return {
        groupCode,
        jobs: sorted,
        total,
        progressPct: total.greaterThan(0) ? Math.round(weighted.div(total).toNumber()) : null,
      };
    })
    .sort((a, b) => compare(a.groupCode, b.groupCode));
}
