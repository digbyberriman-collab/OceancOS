import { conflict } from "@/lib/errors";

/** The minimal shape `applyTransition` needs — any Prisma model delegate has it. */
export interface StatusUpdatable {
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

/**
 * The one way a status write happens in this application.
 *
 * Before this, every transition — jobs, change orders, crew requests — was a
 * plain `update` conditioned only on the record's id: read a status, decide
 * it is legal to move from, then write. Nothing stopped two requests from
 * doing that at once; the second write would silently overwrite whatever the
 * first one decided, and the row would end up wherever the slower request
 * left it. (AUDIT_REPORT.md's `[CONCURRENCY]` finding: "no status write
 * anywhere is conditional on the status that was read".)
 *
 * This makes the write itself conditional on the status the caller read, via
 * `updateMany` — Prisma's `update` has no `where` beyond the id, so
 * `updateMany` is the only way to add one. If no row still has that status,
 * nothing is written and the caller gets `conflict()` instead of a
 * transition that silently didn't happen, or worse, happened over the top of
 * someone else's.
 *
 * **Call this inside an interactive `prisma.$transaction(async (tx) => ...)`
 * when the transition also writes a history row, a comment, or anything else
 * that must live or die with it.** Throwing `conflict()` inside that callback
 * rolls the whole transaction back — a lost-update race can no longer leave
 * an orphaned history row behind for a status change that didn't happen.
 * Pass `tx.job` (or the relevant delegate), not `prisma.job`.
 *
 * This is deliberately just the write. Legality (`assertTransitionJob` and
 * its siblings) and permission (`assertPermission`) are unchanged and still
 * the caller's job to check first — this only makes the write honest about
 * what it read.
 */
export async function applyTransition(
  model: StatusUpdatable,
  opts: {
    id: string;
    from: string;
    to: string;
    /** Extra columns to write alongside the status, e.g. `updatedById`. */
    data?: Record<string, unknown>;
    /** Defaults to `"status"`. */
    statusField?: string;
  }
): Promise<void> {
  const statusField = opts.statusField ?? "status";
  const { count } = await model.updateMany({
    where: { id: opts.id, [statusField]: opts.from },
    data: { [statusField]: opts.to, ...opts.data },
  });
  if (count === 0) {
    throw conflict();
  }
}
