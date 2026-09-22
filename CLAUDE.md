# Contributor guide

This file explains the domain and the codebase conventions a new maintainer — human or AI — needs
before making changes. It's project documentation as much as it is instructions for Claude Code;
treat both readings as intentional.

For setup, scripts, testing and deployment, see `README.md` — this file is about the domain model
and how the code is put together, not how to run it.

## The domain: refit yard project management

OceancOS is a project management platform for **superyacht refit, new-build and conversion
projects** — the period a yacht spends in a shipyard for major work, from the owner/management
company's side. It is explicitly aligned to **"The Bridge by MB92"**, a real yard's client-facing
portal (see `BRIDGE_ALIGNMENT_PLAN.md` for the source manual this was reverse-engineered against
and the phased plan for closing the gap). A few things follow from that:

- The unit of work is a **project**: one vessel, one yard visit, one date range. A `Project` has an
  `arrivalDate`, `haulOutDate` and `departureDate` (the "yard period") that dashboard formulas and
  schedule views are computed against — e.g. time-progress% is `(today − arrival) ÷ (departure −
  arrival)`.
- A **vessel** (`Vessel`) can have multiple projects over its life (this refit, a future one); a
  project belongs to exactly one vessel.
- Everything is **project-scoped**. A user's roles are assigned per-project (or, for a handful of
  cross-project roles, unscoped), and every query that lists or loads records filters to the
  projects the caller can reach — see `lib/project.ts`'s `projectScope()` /
  `accessibleProjectIds()`, which almost every list page and detail page calls before touching the
  database. A missing scope check here is a tenancy bug, not a display bug — several of the
  audit's Critical findings (see `AUDIT_REPORT.md`) were exactly that.

### Job / Quote — the yard-facing work item

A `Job` is a unit of work the client (owner's side) requests and the yard prices and delivers — the
direct analogue of The Bridge's "Job / Quote" object. Its `code` follows the yard's own hierarchical
format (`D.0130.05`: section letter, group, job number within the group — `lib/jobs/*` has the
parsing/formatting and the zero-padded ordering that keeps SQL sort order numerically correct).

Lifecycle (`Job.status`):

```
NEW_REQUEST → QUOTE_SENT → CLIENT_ACCEPTED → ACCEPTED → YARD_COMPLETED → WORKS_ACCEPTED → CLOSED
                  │                                          │
                  ├──► EXPIRED (validityDays elapsed)         └──► MINOR_DEFICIENCY
                  ├──► CANCELLED_QUOTE
                  └──► CANCELLED_WORKS
```

`lib/jobs/workflow.ts` is the single source of truth for which transitions are legal and who can
make them — the UI never offers a button for a transition the server would reject, and both sides
are tested against the same table (`tests/jobWorkflow.test.ts`).

A few things specific to this object:

- **Acceptance is two-step**: the client "accepts" a quote, then confirms with a code sent to their
  registered contact (`AcceptanceChallenge`) — mirroring the manual's "2nd confirmation, auth code
  to registered device". See `jobs/[id]/accept/`.
- **Contract type** (`CONTRACT` / `VARIATION_CERTIFICATE` / `SERVICES` / `PURCHASE`) and **pricing
  basis** (`FIXED` / `ESTIMATED` / `TIME_AND_MATERIALS`) are yard-specific classifications, not
  arbitrary enums — they drive which fields the quote form shows.
  `lib/enums.ts` has the canonical labels.
- **Line items** (`JobLine`) carry a stored `total` (quantity × unitPrice) rather than computing it
  on read, so a historic quote keeps the figure it was accepted at even if the arithmetic
  convention ever changes.
- A `Job` can optionally link to a `ChangeOrder` (`linkedChangeOrderId`) when the work needs formal
  budget/scope sign-off — the two objects serve different purposes (see below) and aren't the same
  thing wearing two names.

### Change Order — budget and scope governance

A `ChangeOrder` is the formal document that changes a project's approved scope or budget, and it
carries its own **five-stage sequential approval chain**: `CAPTAIN → TECH_MANAGER → YARD →
OWNERS_REP → FINANCE`. Each stage is a separate `ChangeOrderApproval` row with its own
decision (`PENDING` / `APPROVED` / `MORE_INFO` / `REJECTED`); a rejection at any stage is terminal
— later stages cannot still approve it through (see `tests/changeOrderWorkflow.test.ts` and
`e2e/changeOrderApprovals.spec.ts`, which exist specifically because early versions of this logic
let a rejected order flip back to approved).

`lib/workflow/changeOrder.ts` computes the current status from the approval rows, not the other way
around — a change order's `status` is derived, never set directly by a decision handler.

### Crew Request — internal operational asks

`CrewRequest` is a simpler, internal-facing workflow (crew or department heads raising operational
asks — maintenance, supplies, logistics) with its own status machine and no multi-stage approval.
It can optionally link to a `ChangeOrder` when a request turns out to need budget sign-off, the same
way a `Job` can.

### Roles and permissions

Nineteen roles (`lib/enums.ts`'s `ROLE_KEYS`), covering both sides of the relationship: the owner's
side (Owner, Owner's Rep, Project Manager, Captain, Chief Officer, Chief Engineer, Purser, HOD,
Crew), the yard's side (Yard PM, Yard Trade Lead, Finance, Technical Manager), and external parties
(Contractor, Supplier, Class Surveyor, Flag Surveyor, Auditor, Guest). Twelve have a seeded
walkthrough account (see `README.md`); seven don't yet.

RBAC is role → permission, evaluated server-side on every protected page and every mutating server
action (`lib/rbac.ts`'s `hasPermission()` / `assertPermission()`) — never trust a client-side hide
of a button as the actual access control. `tests/rbac.test.ts` checks the matrix itself (no crew
access to financials, no single role holding a whole approval chain, etc.), independent of any one
page's behaviour.

## Code conventions this codebase relies on

These aren't stylistic preferences — several were fixed as audit findings after being gotten wrong,
so getting them wrong again is a regression, not a style nit.

- **`requestCache()` (`lib/requestCache.ts`), never `cache` imported directly from `"react"`.** The
  pinned React 18.3.1 doesn't export a working `cache()` under plain Node module resolution (what
  Vitest uses) — only Next.js's own bundled React does, at actual request time.
  `requestCache()` is a shim that uses `React.cache` when it's callable and falls back to the plain
  function otherwise, which is also the right behaviour in a unit test (no caching wanted there).
- **Every mutating server action calls `recordAudit()`** (`lib/audit.ts`) — the single entry point
  for the audit trail every page's activity feed and the admin audit log read from. A mutation with
  no audit row is a gap in that trail, not a minor omission.
- **Money is `Prisma.Decimal`, stored as `@db.Decimal`, never `number`/`double precision`.**
  `lib/utils.ts`'s `toNumber()` is the one sanctioned boundary crossing, for display and for
  non-Prisma consumers (chart props, XLSX cells) that only need a number to render. Arithmetic that
  feeds back into a stored total or a signed figure uses `Prisma.Decimal` directly.
- **Every list query is scoped and capped.** `projectScope()`/`accessibleProjectIds()` for tenancy;
  a `take` limit against unbounded growth, with `_count` or a `groupBy`/`aggregate` alongside it so
  a summary figure ("340 total") stays correct once a table exceeds its page cap — never
  `.filter().length` on an array that's already been capped.
- **Zod schemas in `lib/validators.ts`, shared between the form and the server action** — the
  action re-validates independently of whatever the client sent; the schema is not just for the
  client's error messages.
- **Storage goes through `lib/storage/`**, never a direct filesystem or S3 call from a route —
  the module abstracts local-disk (dev) and S3-compatible (production) behind one interface, keyed
  by `STORAGE_DRIVER`.
- **One thing at a time in a commit.** Fixes, especially in a codebase with this much interlocking
  workflow logic, are easiest to review and easiest to revert individually when they touch one
  concern. `tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e` and `npm run qa` all
  pass before a commit, every time — CI runs the same five checks.

## Where the rest of the story lives

- `BRIDGE_ALIGNMENT_PLAN.md` — the product and architecture reference, the open design decisions,
  and the phase-by-phase progress log. The living plan.
- `SITE_MAP.md` — every route, who can reach it, what's actually wired up versus scaffolded.
- `AUDIT_REPORT.md` / `ACTION_PLAN.md` — the point-in-time platform audit this codebase was
  remediated from and the sequenced plan that was executed against it. A development record: read
  it for *why* something is built the way it is, not for what's true today — check the code and the
  two documents above for that.
