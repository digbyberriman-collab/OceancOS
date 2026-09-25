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

---

### [SCHEMA] — Contractor.contractValue has no currency, so G3.10 can't thread one through it
Severity: Low
Location: `prisma/schema.prisma`'s `Contractor` model; `src/app/(app)/contractors/page.tsx:71,155`
Found by: orchestrator, during G3.10

Description:

ACTION_PLAN.md G3.10 (ui-ux `[CURRENCY]`) threads `project.currency` through every `fmtMoney` call
that was defaulting to EUR. Every other site had a project (or, transitively, one) to read a
currency from. `Contractor` does not: it carries no `projectId` at all — it's a company directory,
not a project-scoped record — and its `contractValue` column has no currency of its own either.
There is no project to thread through and nothing on the row to read instead.

`contractors/page.tsx:71` (the portfolio total) and `:155` (per-row) both still call
`fmtMoney(c.contractValue)` with the bare EUR default, unchanged by G3.10.

Impact:

A contractor's contract value displays in EUR regardless of which currency it was actually agreed
in. Lower severity than the rest of `[CURRENCY]`: contractors are cross-project by design, so
there's no single project currency that would even be correct here — the fix is a schema change
(a `currency` column on `Contractor`), not a threading exercise, and the model is already flagged
above as one of the seed-only tables with no create/edit path at all, so adding a field to a form
that doesn't exist yet needs that work done first.

Suggested fix: add `currency` to `Contractor` (default matching the platform's primary currency)
once a create/edit flow exists for the model to set it through, and thread it into both call sites
the same way every other page in G3.10 was.

---

The entries below were found after Gate 7, while baselining `PERMISSIONS_MATRIX_MASTER_PROMPT.md`
on this tree. Each is fixed by an item in the permission gates (ACTION_PLAN Gates 9–11); the item
is named in its suggested fix.

---

### [RBAC] — Permissions are unioned across every assignment, ignoring its project or vessel scope
Severity: High
Location: `src/lib/auth.ts:75-77`
Found by: permission-matrix planning, after Gate 7

Description:

`getCurrentUser` builds `permissions` from every `UserRole` row the user has, with no regard to
the row's `projectId` or `vesselId`. Project *reachability* is scoped (`listProjectsForUser`,
`requireProjectAccess`), but the permission set is global. A user who is CAPTAIN scoped to p1 and
CREW scoped to p2 holds `change_order.approve.captain` on p2 as well, and every
`hasPermission` / `assertPermission` call honours it there.

No test covers this. `e2e/tenancy.spec.ts` checks reachability only, and `tests/rbac.test.ts` checks
the static matrix, which is why the Gate 7 role walkthrough (all accounts unscoped) could not see
it.

Impact:

Any per-project role assignment leaks its permissions onto every other project the user can reach.
That includes approval stages and quote signatures, the two paths that commit money.

Suggested fix: Gate 9, item 9.6 — resolve permissions per project (most specific assignment wins),
with the CAPTAIN-on-p1 / CREW-on-p2 seed user as the regression case.

---

### [RBAC] — The seed wipes and rebuilds every role's permissions
Severity: Medium
Location: `prisma/seed.ts:51-52`
Found by: permission-matrix planning, after Gate 7

Description:

For every role, the seed deletes its `RolePermission` rows and recreates them from
`ROLE_PERMISSIONS`. That is harmless while nothing else writes those rows. It becomes data loss
the moment an administrator can edit a role's permissions: the next seed or deploy silently
reverts every edit.

Impact:

Latent today; it blocks any admin-editable access model.

Suggested fix: Gate 9, item 9.4 — a pure `planSync` that re-applies defaults only to unedited
system sets and applies additive migrations to customised ones.

---

### [TENANCY] — The quote authoriser is chosen and validated platform-wide
Severity: Medium
Location: `src/app/(app)/jobs/new/page.tsx:39`, `src/app/(app)/jobs/actions.ts:126-133`,
`src/lib/project.ts:208`
Found by: permission-matrix planning, after Gate 7

Description:

The "who may authorise this quote" dropdown lists every active user holding `job.accept` on any
project. `createJobRequest` then accepts any of them, checking the permission in memory across all
of the authoriser's roles. Separately, `usersWithPermissionOnProject` (used for notifications) is
scope-aware but treats any covering assignment as granting, while `hasPermission` is global, so the
three answers to "who holds X on this project?" disagree.

Impact:

A quote can be addressed to someone with no access to the project, who then cannot open it. People
on other refits appear in the list.

Suggested fix: Gate 9, item 9.7 — one `holdersOf` / `canOn` used by the dropdown, the validation and
the notification lookups.

---

### [RBAC] — Nine actions check the permission before loading the record
Severity: Low
Location: `src/app/(app)/jobs/actions.ts` (`issueQuote` :224, `setJobProgress` :566,
`addJobComment` :630); `jobs/[id]/accept/actions.ts` (`requestAcceptanceCode` :52,
`confirmAcceptance` :132, `rejectQuote` :269); `change-orders/actions.ts` `updateChangeOrder` :89;
`crew-requests/actions.ts` `assignCrewRequest` :125; `admin/projects/actions.ts`
`updateProjectAction` :39
Found by: permission-matrix planning, after Gate 7

Description:

Each asserts the permission first and loads the record (and checks its project) afterwards. With
today's global permissions that order is harmless. Once permissions are per project, the check
must run against the record's project, which is only known after the load.

Impact:

None today; it blocks per-project permission checks.

Suggested fix: Gate 10, item 10.1 — load, then `assertPermissionOn(user, key, record.projectId)`.

---

### [RBAC] — The Approvals page has no page gate and re-declares the stage map with `as any`
Severity: Low
Location: `src/app/(app)/approvals/page.tsx:16,30`; `src/app/(app)/change-orders/actions.ts:311`
Found by: permission-matrix planning, after Gate 7

Description:

`approvals/page.tsx` requires only a session. It declares its own `STAGE_PERM:
Record<string, string>` instead of importing the typed `CO_STAGE_PERMISSION`, and casts at the call
site. `decideChangeOrderApproval` casts `permKey as any` even though `CO_STAGE_PERMISSION` is
already typed.

Impact:

A typo in the local map would compile and fail open or closed silently. Every user can open the
page.

Suggested fix: Gate 10, item 10.8.

---

### [RBAC] — Money visibility is gated in the wrong places, and inconsistently
Severity: Medium
Location: `fmtMoney` call sites in `jobs/page.tsx`, `jobs/[id]/page.tsx`,
`change-orders/page.tsx`, `change-orders/[id]/page.tsx`, `approvals/page.tsx`,
`crew-requests/[id]/page.tsx:127`, `print/jobs/[id]/page.tsx`; `api/export/jobs/route.ts:46`,
`api/export/change-orders/route.ts`
Found by: permission-matrix planning, after Gate 7

Description:

Only the dashboard budget panels, the CO print view, `/financials` and the two spreadsheet exports
gate money, all on `financial.view`. Job, change-order, approval and crew-request pages show prices
and costs to anyone who can open them. The exports are too strict in the other direction: YARD_PM
lacks `financial.view`, so the yard's export of its own quotes has no prices. The job PDF renders
`print/jobs/[id]`, which shows money the jobs spreadsheet hides for the same user.

Impact:

Crew and contractors see commercial figures; the yard cannot export its own prices; two exports of
the same job disagree.

Suggested fix: Gate 10, items 10.5 and 10.6 — dedicated `job.price.view` / `change_order.cost.view`
/ `crew_request.cost.view` keys and one `canSeeMoney` helper.

---

### [EXPOSURE] — The dashboard's Recent activity shows the platform-wide audit log to every user
Severity: Medium
Location: `src/app/(app)/dashboard/page.tsx:77` (query), `:390` (panel)
Found by: permission-matrix planning, after Gate 7

Description:

The dashboard lists the last ten `AuditLog` rows with no scope and no `audit.view` check; the page's
own comment calls it a deliberate exception. `AuditLog` has no `projectId`, so it cannot be scoped
as it stands.

Impact:

Every user, including crew, suppliers and guests, sees who did what on every project, which
contradicts `CLAUDE.md`'s rule that everything is project-scoped.

Suggested fix: Gate 10, item 10.7 — `AuditLog.projectId`, and filter the panel by project and by
module view key.

---

### [UI] — The TopBar shows the user's first role, not their role on the active project
Severity: Low
Location: `src/components/layout/TopBar.tsx:66`
Found by: permission-matrix planning, after Gate 7

Description:

`roleKeys[0]` is the first of all the user's role rows in database order. For a user with different
roles on different projects it is arbitrary.

Impact:

Cosmetic today; misleading once roles are per project.

Suggested fix: Gate 9, item 9.6 — show the winning access sets on the active project.

---

### [EXPOSURE] — Since G6.9, every project manager sees the platform-wide user, vessel and project directory
Severity: Medium
Location: `src/app/(app)/admin/page.tsx:19,26-41`
Found by: permission-matrix planning, after Gate 7

Description:

G6.9 granted `admin.users` to OWNER, OWNERS_REP and PROJECT_MANAGER. `/admin` shows the full user
directory (names and emails), every vessel and every project to any holder, with no scope. A PM
assigned to one refit (for example `scoped@oceancos.dev`) therefore sees every user on the
platform.

Impact:

Cross-project disclosure of personal data (names, emails) and of the project portfolio to
project-scoped staff.

Suggested fix: Gate 10, item 10.7 — `admin.users` becomes account-scope (effective only from an
unscoped assignment), and the vessel and project lists are scoped to the viewer's reach.
