# OceancOS — QA Test Report

> **Update, 2026-09-19.** The caveat below is closed. The toolchain has since been
> run end to end and an automated test suite exists: 49 Vitest unit tests and 6
> Playwright end-to-end tests, both wired into CI. See "Automated tests" below and
> §9 of `BRIDGE_ALIGNMENT_PLAN.md`. The manual checklist is kept as a regression
> reference for the areas the automated tests do not yet reach.

This QA pass was originally performed in a build-from-scratch context (the
repository was empty when work started, see `PROJECT_REVIEW_AND_BUILD_PLAN.md`).
The codebase was authored in a single session without running `npm install` /
`npx prisma generate` / `next build`. Operator should expect to run:

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run qa     # scripted database-integrity QA
npm run dev    # manual UI QA per the checklist below
```

## Module-by-module manual QA checklist

### Auth / login
- [ ] `/login` renders, accepts seeded credentials.
- [ ] Wrong password shows error, no auth granted.
- [ ] Login writes an `AuditLog` row with `action=LOGIN`.
- [ ] Logout clears cookie and Audit row written.
- [ ] Unauthenticated visit to `/dashboard` redirects to `/login`.

### Dashboard
- [ ] All 4 stat cards render with seeded data.
- [ ] Budget rollup hidden for crew login, shown for owner/finance/PM.
- [ ] Upcoming milestones list shows seeded milestones in date order.
- [ ] Recent activity shows audit rows.
- [ ] Approvals waiting list links to change order.

### Change orders
- [ ] List page filters: status, priority, q (text). Reset clears filters.
- [ ] `/change-orders/new` form validates required fields (title, project, etc.).
- [ ] Created change order gets a `CO-####` number and a 5-stage approval chain.
- [ ] Status transitions enforced: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → IN_PROGRESS → COMPLETED → CLOSED.
- [ ] Illegal transitions (e.g. CLOSED → DRAFT) are rejected server-side.
- [ ] Approval buttons appear only for users with the matching stage permission.
- [ ] Approving the last required stage flips status to APPROVED automatically.
- [ ] Rejecting any stage flips status to REJECTED.
- [ ] Comments persist and appear in detail page.
- [ ] Notifications written to creator on status change and to approvers when work enters their stage.

### Crew requests
- [ ] List page filters: status, priority, category, overdue.
- [ ] Overdue items render in red.
- [ ] `/crew-requests/new` validates and creates with REQ-#### number.
- [ ] Assignment form changes assignee and triggers ASSIGNED notification.
- [ ] Status transitions enforced (NEW → TRIAGED → ASSIGNED → IN_PROGRESS → COMPLETED → CLOSED, etc.).
- [ ] Linking to a change order works on creation.

### Approvals centre
- [ ] "Waiting on you" only shows stages the user can decide.
- [ ] Inline approve / info / reject works without leaving the page.
- [ ] "Pending elsewhere" lists items waiting on other roles.
- [ ] "Other approvals" section lists rows from `Approval` table.

### Financials
- [ ] Restricted to `FIN_VIEW` permission.
- [ ] Totals row and per-category breakdown display.
- [ ] Variance column highlights red when forecast > target.

### Schedule, Logistics, Inventory, Drawings, Documents, Contractors, Suppliers, Meetings, Risks
- [ ] Permission-gated empty/forbidden state shows for restricted roles.
- [ ] Each list renders seeded data (or empty state hint).
- [ ] Inventory low-stock highlighted.
- [ ] Document expiry past today highlighted.

### Notifications
- [ ] Inbox shows newest first.
- [ ] Items with linked resource link through to that page.
- [ ] Visiting `/notifications` marks all unread as read.
- [ ] Sidebar badge clears on navigation.

### Search
- [ ] Top-bar search submits to `/search?q=`.
- [ ] Results respect role-based visibility (e.g. crew sees no contractors).

### Admin
- [ ] Restricted to roles with `ADM_USERS` or `AUDIT_VIEW`.
- [ ] Lists users with their assigned role keys.
- [ ] Audit log table renders newest 50.

## Automated tests

| Command | What it covers | Count |
|---|---|---|
| `npm test` | Vitest unit tests: change-order state machine, project metrics formulas, RBAC matrix | 49 |
| `npm run test:e2e` | Playwright in a real browser: auth, project switcher, permission gating | 6 |
| `npm run qa` | Read-only database integrity checks against the seeded data | 17 |

All three run in `.github/workflows/ci.yml` alongside `tsc --noEmit` and `next build`.

**Unit tests** (`tests/`):
- `changeOrderWorkflow.test.ts` — every status is mapped, no status transitions to
  itself, terminal statuses are sealed, the documented happy path is legal, a closed
  order cannot reopen, review cannot be skipped, and the UI never offers a button for
  a transition the server would reject.
- `projectMetrics.test.ts` — the two Bridge Home formulas, including clamping past
  100% after an overrun, nulls rather than zeroes for missing dates, and value
  weighting that a zero-value job cannot distort.
- `rbac.test.ts` — no unknown or duplicated grants, crew cannot reach financials, the
  auditor holds nothing that writes, confidential documents reach exactly three roles,
  every approval stage has at least one holder, and no single role holds the whole chain.

**End-to-end tests** (`e2e/shell.spec.ts`): anonymous visitors are redirected, a wrong
password grants nothing, a project manager can sign in and out, the project switcher
lists both seeded projects and remembers the choice across navigation, and financials
are hidden from crew but visible to a project manager.

**Not yet covered by automated tests:** the change-order and crew-request creation and
approval flows, notifications, search, and admin. These remain on the manual checklist
above and are the next targets as Phase 1 lands.

## Scripted QA

`npm run qa` runs `scripts/qa.ts`, which executes read-only DB integrity checks:
seed counts, role-permission link presence, change-order approval chain length,
crew request assignment, milestone presence, risk rating computation, and (added
2026-09-19) project code uniqueness plus yard-period date ordering. It exits
non-zero on any failure so it can be wired into CI.

## Bugs found and fixed during build

- During approval flow design I noticed that flipping a CO to `APPROVED` after
  the last stage required clearing the per-CO status separately. Fixed by
  recomputing remaining required approvals inside the same transition action.
- Permission check for `decideChangeOrderApproval` originally relied on role
  string match; switched to permission-key match so custom roles still work.
- `notify()` was originally synchronous email send; refactored to in-app first +
  optional dynamic SMTP import to avoid breaking dev environments without SMTP.

## Remaining issues / known limitations

- No `npm install` or build executed in the sandbox — first real build is
  expected to be by the operator. The schema is intentionally portable
  (no SQLite-only types) so swapping to Postgres is a `.env` change plus
  `provider = "postgresql"` in `schema.prisma`.
- File uploads are schema-tracked but no S3/disk write code is wired into the
  forms — drawings and documents currently expect an external URL.
- Bulk approve, drawing markup, and Gantt rendering are not built.
- Email notifications: stub present, real SMTP transport not wired.
- ~~No automated unit/integration test framework.~~ Resolved 2026-09-19: Vitest and
  Playwright are in place and run in CI. Coverage is still partial — see "Not yet
  covered by automated tests" above.

## Recommended next steps

1. Replace local-disk file storage with S3-compatible provider; add an
   `/api/uploads` route that returns signed URLs.
2. Add Vitest + Playwright; convert the manual checklist into automated tests.
3. Implement `Approval` decision UI (currently approvals show but only Change
   Order approvals are decided inline).
4. Add a Gantt view for `/schedule` (e.g. via `frappe-gantt` or custom SVG).
5. Add CSV export for budgets, change orders, requests, audit log.
6. Tenant-scoping if the platform is to host multiple owner groups.
