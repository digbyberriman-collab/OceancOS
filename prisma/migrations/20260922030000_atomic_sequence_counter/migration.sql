-- ACTION_PLAN.md G3.3, closing AUDIT_REPORT.md T5 / the [DOUBLE-SUBMIT]
-- finding on nextSequence: ChangeOrder.number and CrewRequest.number were
-- allocated by `count() + 1` against a @unique column, so two concurrent
-- creates could read the same count and collide. See src/lib/sequence.ts.

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- Seed each counter from the current row count, so numbering continues from
-- where `count() + 1` left off rather than restarting and colliding with
-- records that already exist.
INSERT INTO "Counter" ("key", "value") VALUES ('CO', (SELECT COUNT(*) FROM "ChangeOrder"));
INSERT INTO "Counter" ("key", "value") VALUES ('REQ', (SELECT COUNT(*) FROM "CrewRequest"));
