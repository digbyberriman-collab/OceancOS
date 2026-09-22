// Atomic sequence allocation for human-facing record numbers (CO-0001,
// REQ-0001, …).
//
// The previous approach (`count() + 1`, formerly in lib/utils.ts) read the
// row count and appended 1, racing every concurrent create against the same
// `@unique` column — two submissions filed at the same moment could both
// compute CO-0012 (AUDIT_REPORT.md T5, ACTION_PLAN.md G3.3). This instead
// allocates from a dedicated Counter row via a single
// `INSERT ... ON CONFLICT DO UPDATE`, which Postgres executes under a
// row-level lock: two concurrent callers for the same key are serialised by
// the database, not by application logic, so they can never receive the
// same number. A create that fails after allocating one still leaves a gap
// in the sequence rather than a collision — the same trade-off a native
// database sequence makes, and the correct one here.

import { prisma } from "./db";

export async function nextSequence(prefix: string): Promise<string> {
  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${prefix}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"
  `;
  return `${prefix}-${String(rows[0].value).padStart(4, "0")}`;
}
