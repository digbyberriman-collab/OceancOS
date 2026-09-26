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

### [RBAC] — `transitionChangeOrder`'s generic `CO_EDIT` fallback reaches every status, including `APPROVED`, bypassing the entire approval chain
Severity: Critical
Location: `src/lib/workflow/changeOrder.ts:54-58` (`permissionForTransition`); `src/app/(app)/change-orders/actions.ts:63-71` (`transitionChangeOrder`)
Found by: orchestrator, during G1.3 (building `applyTransition` required reading every existing
transition call site's permission logic against its legality map)

Description:

`permissionForTransition` special-cases only two targets — `SUBMITTED` (`CO_SUBMIT`) and
`CANCELLED` (`CO_CANCEL`) — and returns `PERMISSIONS.CO_EDIT` for every other legal target,
including `APPROVED`, `REJECTED`, `MORE_INFO`, `IN_PROGRESS`, `COMPLETED`, `CLOSED` and `DRAFT`.
`CO_LEGAL_TRANSITIONS.UNDER_REVIEW` lists `["MORE_INFO", "APPROVED", "REJECTED"]` as legal edges
(`changeOrder.ts:30`), and `transitionChangeOrder` checks nothing beyond
`assertPermission(user, permissionForTransition(target))` and `assertTransitionChangeOrder`
(`change-orders/actions.ts:70-71`) — no check that the caller is deciding a specific approval
stage, no check that any stage has actually been decided at all.

This is the same shape of bug as C2 (`jobActions()`'s `NOT_OFFERED` filters `APPROVED`/`REJECTED`/
`MORE_INFO` out of the buttons the UI renders — `changeOrder.ts:87`, `NOT_OFFERED_AS_BUTTON` — with
no server-side counterpart), independently present on the change-order side and missed by the
original audit: `findings-workflow-logic.md`'s two CO_EDIT-related findings both concern
*under*-permissioning (CO_EDIT is decorative because no edit action exists; captain/chief engineer
can create a CO but not progress it) and neither notices that the same fallback *over*-grants
transition authority to the terminal approval states.

`CO_EDIT` is held by OWNERS_REP and PROJECT_MANAGER (`rbac.ts:95,113`). PROJECT_MANAGER holds no
`CO_APPROVE_*` permission at all — per the audit's own [X5] finding, a PM can raise and submit a
change order but is not supposed to ever approve one. Calling the exported
`transitionChangeOrder(id, "APPROVED")` action directly, as any PROJECT_MANAGER, moves a change
order in `UNDER_REVIEW` straight to `APPROVED` — no stage decisions recorded, no chain, no
`approvedCost` set (that field is only written by `decideChangeOrderApproval`'s all-approved
branch), yet the record reads as fully approved.

Impact:

The multi-stage approval chain (Captain, Owner's Rep, Yard, Finance, Tech Manager, Class, Flag) is
entirely optional for a PROJECT_MANAGER or OWNERS_REP holding CO_EDIT: they can skip straight to
`APPROVED`, `REJECTED` or `MORE_INFO` on any change order in `UNDER_REVIEW`, for any project (this
finding compounds C16 until G1.4 lands, and remains project-unscoped until `applyTransition`'s
`requireProjectAccess` call is in place). This is the money path — identical in kind to C7/C8's
already-logged defeat of the approval chain, reached through a different function.

Suggested fix:

Fixed as part of G1.3: `applyTransition`'s ChangeOrder dispatch refuses `APPROVED`, `REJECTED` and
`MORE_INFO` unconditionally from the generic path (`CO_GENERIC_UNREACHABLE` in
`lib/workflow/changeOrder.ts`, mirroring `JOB_GENERIC_UNREACHABLE`) — the only route to those three
statuses is `decideChangeOrderApproval` (itself still routing around the legality map until G2.2
migrates it to `applyTransition`). Not struck through: this is a real, additional Critical closed
by building the primitive correctly, not a batched unrelated fix — the whole point of `applyTransition`
is that a generic transition action can no longer reach a status that requires its own ceremony or
decision process, and this is the second instance of exactly that pattern (the first being C2).
