# Findings raised during Phase 5

Issues discovered while executing `ACTION_PLAN.md` that were not in the Phase 2 audit. Logged
rather than fixed on the spot, so the current item stays minimal and the scope stays visible.

---

### [TESTS] — Two e2e tests fail on a second run against the same database
Severity: Medium
Location: `e2e/jobs.spec.ts:128` (`stars a job for this user only`), `e2e/jobs.spec.ts:149`
(`request, quote, accept with a code, countersign`)
Found by: orchestrator, during G1.1

Description:

Both tests pass on a freshly seeded database and fail on the next run against the same one.

`stars a job for this user only` clicks the **Favourite** button and never un-stars it. On the
second run the button reads **Favourited**, `getByRole("button", { name: /^favourite$/i })` matches
nothing, and the test times out after 30s.

`request, quote, accept with a code, countersign` creates a job with a `Date.now()` title, so it is
self-contained in that respect, but it consumes seeded state the earlier assertions depend on.

This is invisible in CI, which provisions a clean `postgres:16` service container per run, and
visible to anyone running the suite twice locally. It also means a failure here is ambiguous: a
developer cannot tell a real regression from leftover state without resetting first.

Evidence:

    # after a prior full-suite run
    npx playwright test e2e/jobs.spec.ts   →  2 failed, 9 passed
    npm run db:reset && npx playwright test e2e/jobs.spec.ts  →  11 passed

Suggested fix: make each test restore what it changed (un-star in a `finally`), or give the suite a
per-run reset. Not fixed under G1.1 — unrelated to the error boundary, and changing test isolation
while landing security fixes would muddy which change caused what.

---

### [DOCS] — `npm run db:reset` is the undocumented prerequisite for a repeat e2e run
Severity: Low
Location: `README.md`
Found by: orchestrator, during G1.1

Related to the above and to the existing docs finding that `npm run test:e2e` cannot work from a
clean clone as documented. Fold into G6.3.

---

### [TESTS] — `npm run qa`'s crew-request check assumed the first row is representative
Severity: Low
Location: `scripts/qa.ts:41-44`
Found by: orchestrator, during G2.4

Description:

`prisma.crewRequest.findFirst()` carries no `orderBy`, so which row comes back is
whatever the database happens to return first — not guaranteed stable, and in
practice shifts as soon as anything else (an e2e run, a manual walkthrough)
creates an unassigned crew request ahead of the seeded assigned one. The check
"crew request is assigned" then fails on a database that is otherwise completely
healthy.

Reproduced: `npm run db:reset && npm run qa` → 17/17. Run the e2e suite (which
creates several unassigned crew requests as fixtures — e2e/transitions.spec.ts,
e2e/crewRequestWorkflow.spec.ts) and re-run `npm run qa` against the same
database → fails.

Fixed alongside G2.4 rather than logged-only, since it blocks this pass's own
verification signal from here on: `npm run qa` is run after every gate, and
every gate's e2e tests add more unassigned fixtures. Query for an assigned row
directly (`findFirst({ where: { assignedToId: { not: null } } })`) instead of
assuming the first row returned has the property being checked. Committed
separately from G2.4's functional changes — this is test tooling, not app code.

---

### [DEAD CODE] — Five models have no create/update call site anywhere in the application
Severity: Medium
Location: `prisma/schema.prisma` — `Approval`, `Milestone`, `LogisticsItem`, `Document`,
`MeetingAction`; `prisma/seed.ts`; `src/app/(app)/{logistics,documents,schedule,approvals}/page.tsx`
Found by: orchestrator, during G3.1

Description:

While sourcing value lists for G3.1's CHECK constraints, five models turned out to have **no
`.create` or `.update` call anywhere in `src/`, and no seed fixture either** — confirmed with
`grep -rn "prisma\.<model>\."` across the whole app:

    Approval        — src/app/(app)/approvals/page.tsx and dashboard/page.tsx read it
                       (`findMany`, `count`) but nothing ever writes a row. `stage` has no
                       default and has therefore never held any value at all.
    Milestone       — seed.ts creates rows (`type`, `date`), but `status` is never set past
                       its "PENDING" default; no in-app create/edit path exists.
    LogisticsItem   — `/logistics` reads a table nothing ever writes to.
    Document        — `/documents` and search read a table nothing ever writes to.
    MeetingAction   — read via `Meeting.actions` off `/meetings`; nothing ever writes to it (nor
                       does anything write a `Meeting` row itself, for that matter).

`Meeting`, `Drawing`, `PurchaseOrder`, `Invoice`, `Contractor` and `Budget` are the same shape —
readable pages backed by tables only `prisma/seed.ts` populates, several (Meeting, Drawing,
Contractor) not even that. The Approvals Centre page itself is already flagged
(`findings-ui-ux.md`'s `[DEAD LISTS]`, ACTION_PLAN.md G3.7) as having "no decision controls, no
links" — this finding is the reason why: there is nothing to decide, because nothing ever creates
an `Approval` row to decide on.

Impact:

Six-plus feature areas the UI presents as real (Logistics, Documents, Schedule tasks, the
Approvals Centre, Meetings, Purchase Orders/Invoices/Contractors) are permanently empty beyond
whatever `prisma/seed.ts` happens to plant, because no path exists to add to them. A user
navigating to `/logistics` sees a working-looking table with no way to ever add a row. This reads
as "the feature is broken" rather than "the feature was never built" — the gap is disguised by the
page rendering cleanly with an empty state.

Not fixed here: out of scope for G3.1 (schema constraints), and building nine create/edit flows is
a scoped feature-build, not a bug fix — it needs its own sequenced plan item(s), most likely a new
Gate. Logged rather than folded into G3.1 per the protocol's rule against silently expanding an
item's scope.
