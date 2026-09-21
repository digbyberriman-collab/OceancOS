# OceancOS — Platform audit report

Phase 3 of the Universal Platform Audit. Nine specialists read the tree independently in Phase 2;
this consolidates and de-duplicates their 221 findings. The ground-truth inventory they worked from
is `SITE_MAP.md`. The raw, un-merged findings are in `audit/findings-*.md` and remain the record —
where this report and a findings file disagree, this report has been checked against source and the
findings file has not.

**No fixes have been made.** Sequencing and execution are Phases 4 and 5.

---

## 1. Headline

Three things in this codebase are worse than "needs work", and they are not the ones an ordinary
review would surface.

**The public login page publishes working owner credentials.** `DemoHint.tsx` renders
unconditionally at `login/page.tsx:122` and prints `owner@oceancos.dev` / `password` to anonymous
visitors. The seed hashes the literal string `"password"` once and reuses it for all twelve
accounts, so the hint is accurate for every seeded user, including `OWNER`. The component's own
docstring calls itself "a demo convenience, not a security concern". That is wrong: it is a
complete authentication bypass for anyone who loads the sign-in page.

**Multi-tenancy exists but is applied in one subtree only.** `src/lib/project.ts` is a correct and
careful scoping model — `listProjectsForUser` respects role-level project and vessel scopes,
`storeActiveProject` refuses a project the user cannot reach. It is then consulted by the jobs
routes and essentially nowhere else. Change orders, crew requests, suppliers, search, the
notification fan-out, the print views, the PDF exports and ten list-only modules all query
without a project term. The platform reads as multi-tenant and behaves as single-tenant.

**The change-order approval chain can be made to approve a rejected change order.**
`decideChangeOrderApproval` (`change-orders/actions.ts:139-211`) counts `decision: "PENDING"` rows
to decide whether the chain is complete. A `REJECTED` stage is not `PENDING`, so a rejection stops
blocking the count instead of stopping the change order. Once the remaining stages approve, the
count reaches zero and the change order is set to `APPROVED` with `approvedCost` taken from
`estimatedCost`. This is the money path.

Beyond those: the acceptance ceremony — the one piece of this system with genuine legal weight —
has a generic side door (`transitionJob` accepts `CLIENT_ACCEPTED` directly, skipping the
confirmation code, the quote fingerprint and the audit record), and there is no error boundary
anywhere in the application, so every one of the ~40 `throw` sites in the server actions renders
as a blank Next.js crash page.

---

## 2. Findings by severity

221 raw findings. De-duplication merges 34 of them into 17 cross-cutting clusters, leaving **187
distinct defects**.

| Severity | Raw | Distinct | What it means here |
|---|---|---|---|
| **Critical** | 18 | **14** | Data loss, authentication bypass, cross-tenant exposure, or a financial control that can be defeated |
| **High** | 62 | 54 | A documented capability that does not work, or a defect a user will hit on a normal path |
| **Medium** | 79 | 71 | Wrong behaviour in a reachable but non-default case, or a standard the platform claims and misses |
| **Low** | 43 | 39 | Inconsistency, rough edge, avoidable confusion |
| **Cosmetic** | 19 | 9 | Tidiness; no behavioural consequence |

### Per specialist

| Specialist | Findings | C | H | M | L | Cos |
|---|---|---|---|---|---|---|
| auth-security | 21 | 6 | 6 | 7 | 2 | 0 |
| workflow-logic | 22 | 3 | 9 | 8 | 2 | 0 |
| ui-ux | 34 | 2 | 10 | 14 | 6 | 2 |
| data-api | 26 | 3 | 11 | 9 | 2 | 1 |
| forms-validation | 33 | 3 | 12 | 11 | 7 | 0 |
| accessibility | 25 | 0 | 4 | 11 | 7 | 3 |
| performance | 18 | 0 | 8 | 8 | 1 | 2 |
| docs | 24 | 1 | 8 | 10 | 5 | 0 |
| dead-code | 18 | 0 | 1 | 4 | 8 | 5 |

---

## 3. The fourteen Criticals

Ordered by what they let an attacker or an ordinary user do, not by module.

| # | Finding | Location | Found by |
|---|---|---|---|
| C1 | Working owner credentials printed on the public login page | `components/auth/DemoHint.tsx`, `login/page.tsx:122` | auth-security, ui-ux |
| C2 | `transitionJob` accepts `CLIENT_ACCEPTED`, skipping the entire acceptance ceremony | `jobs/actions.ts:310-388` | auth-security, workflow-logic |
| C3 | Any signed-in user can download any stored file by object key | `api/uploads/local/route.ts` | auth-security, data-api |
| C4 | Project scoping absent everywhere outside the jobs subtree | 14 locations | auth-security, data-api |
| C5 | Change-order transitions and approvals have no record-level or project-level check | `change-orders/actions.ts:139-211` | auth-security, data-api |
| C6 | Crew-request transitions accept several statuses with no permission check | `crew-requests/actions.ts:50-97` | auth-security, workflow-logic |
| C7 | A rejected change order becomes `APPROVED` once the remaining stages approve | `change-orders/actions.ts:180-192` | workflow-logic |
| C8 | Approval decisions write status outside the legal-transition map | `change-orders/actions.ts:186-192` | workflow-logic |
| C9 | The approval decision value is never validated; any string persists | `change-orders/actions.ts:142` | data-api, workflow-logic, forms-validation |
| C10 | The approval decision is five separate writes with no transaction | `change-orders/actions.ts:152-207` | data-api |
| C11 | No error boundary anywhere; every thrown server action is a blank crash page | `src/app/` (no `error.tsx`) | ui-ux, forms-validation, data-api |
| C12 | The sidebar is a fixed 240px column; the app is unusable below ~600px | `components/layout/Sidebar.tsx` | ui-ux |
| C13 | Leaving the optional "Due Date" blank rejects the whole crew request | `lib/validators.ts:37` | forms-validation |
| C14 | `.env.example` makes local-disk storage the silent production default, losing uploads | `.env.example` | docs |

C5 and C7–C10 are five distinct defects in a single 70-line function. That function is the
platform's financial control. It should be rewritten, not patched.

---

## 4. Cross-cutting themes

Seventeen findings recurred across specialists. These are the structural causes; most of the
187 distinct defects are downstream of one of them.

### T1 — One module was finished; nineteen were not

The jobs subtree has a state machine (`lib/jobs/workflow.ts`), project scoping, an acceptance
ceremony, exports, print views, 78 unit tests and 11 e2e tests. Change orders and crew requests
have roughly half of that. The remaining ten modules are list-only scaffolds. Every specialist
independently found the same shape: **the quality gradient runs from `/jobs` outward**, and the
sidebar presents all twenty as peers.

Touches: C4, C6, C12; ui-ux `[SCAFFOLDS]`, `[EMPTY STATES]`; accessibility; performance
`[QUERY] — Seven list pages read an entire table`.

### T2 — Guards exist but are not the only path

This is the single most productive bug pattern in the codebase, and it produced four Criticals.
In each case a correct guard was written and then routed around:

| Guard | Bypass |
|---|---|
| `lib/jobs/workflow.ts` `jobActions()` filters `CLIENT_ACCEPTED` out of the UI | `transitionJob` accepts it from the form (C2) |
| `lib/workflow/changeOrder.ts` `assertTransitionChangeOrder` | imported into `change-orders/actions.ts` but called only at `:70`, never in the approval path (C8) |
| `ApprovalDecisionSchema` in `lib/validators.ts:52-57` | defined, never imported anywhere (C9) |
| `lib/project.ts` scoping | consulted by jobs routes only (C4) |

`jobActions` is the clearest illustration: `NOT_OFFERED` is a **UI-layer filter with no server-side
counterpart**, and its file header claims the server and the screen cannot disagree. They can.

### T3 — Thrown errors have nowhere to land

No `error.tsx`, `global-error.tsx` or `not-found.tsx` exists in `src/app/`. Around forty server
actions and page components throw raw `Error` objects — permission denials, validation failures,
not-found. Every one of them is a blank crash page with no way back. This also means **every fix
that correctly adds a guard makes the user experience worse until the boundary exists**, which is
why it sequences first.

Also: two incompatible failure conventions coexist — `throw new Error(...)` in change orders and
crew requests, `redirect(?error=...)` in jobs and auth.

### T4 — The client is trusted for identity and for storage keys

`projectId` is read from the submitted form when creating change orders and crew requests.
`attachUploads` trusts a client-supplied JSON blob including the storage key. `updateProjectAction`
edits any project by id with no scope check. The local upload route authorises the *session* but
never the *object*.

### T5 — Nothing is atomic, and sequences are allocated by counting rows

No status write anywhere is conditional on the status that was read — every transition is
read-then-write with no optimistic concurrency. `nextSequence` allocates `CO-0007` / `REQ-0012` /
job codes by `count() + 1` against a `@unique` column, so two concurrent creates collide. The
acceptance attempt counter is a non-atomic read-modify-write, which means the five-attempt lockout
on the confirmation code can be defeated by concurrent requests.

### T6 — The schema has almost no constraints

36 `*Id` columns carry no foreign key. 41 status/type/category columns are unconstrained text
with no `CHECK`. Money is `double precision` in 21 columns. Core workflow tables have no index
beyond their primary key. The database will accept essentially anything the application sends it,
which is why C9 (unvalidated decision string) persists rather than erroring.

### T7 — Forms are server components with no submission state

Exactly one `disabled=` exists in the app and it is a governance gate, not a pending state. No
`useFormStatus`, no `useTransition`. Every submit button stays live for the whole round trip,
including the ones that write several rows and send an email. Double-clicking creates two change
orders with two full approval chains, or collides on the sequence.

### T8 — Validation is mirrored nowhere and discards everything

Server minimums are not reflected on the client, so valid-looking input crashes the form (T3).
Every validation failure discards the entire form. Raw zod messages are shown to users. Optional
fields that are left blank arrive as `""`: dates fail outright (C13), strings are stored as `""`
where `NULL` belongs.

### T9 — Reads are unbounded

Seven list pages read an entire table with no `take`. The jobs list loads all jobs and sorts in
Node, plus seven `COUNT` queries per render. The dashboard issues 24 Prisma calls, five of them
sequential. `requireUser` and `getActiveProject` are re-resolved per route segment — 7 of the 22
queries on `/jobs` are exact duplicates. Global search runs seven leading-wildcard `ILIKE` scans
across seven unindexed tables.

### T10 — Documentation describes a platform that no longer exists

`QA_TEST_REPORT.md` counts are stale by roughly 5×, its "remaining issues" list work that is
finished, and its setup block omits PostgreSQL entirely. `PROJECT_REVIEW_AND_BUILD_PLAN.md`
describes a directory layout that does not match the repository, and the README sends readers to
it as the architecture document. `npm run test:e2e` cannot work from a clean clone as documented.
`npm run lint` cannot run at all — ESLint is not installed, there is no config, and CI never
calls it.

---

## 5. De-duplication register

Where more than one specialist found the same defect, the merged entry and its sources:

| Merged finding | Sources |
|---|---|
| No error boundary | ui-ux (C), forms-validation (C), data-api (H) |
| Project scoping absent outside jobs | auth-security (C + 3×H), data-api (C + M), workflow-logic (M) |
| `transitionJob` acceptance bypass | auth-security (C), workflow-logic (C) |
| Approval decision unvalidated | data-api (C), workflow-logic (H), forms-validation (H), dead-code (M) |
| Upload route authorises session, not object | auth-security (C), data-api (H) |
| Demo credentials on login page | auth-security (C), ui-ux (H) |
| Crew-request permission gaps | auth-security (C), workflow-logic (H) |
| No pending state on any form | forms-validation (H), ui-ux (H) |
| Sequence numbers by `count() + 1` | forms-validation (H), data-api (H), workflow-logic (M) |
| No indexes on workflow tables | data-api (H), performance (H) |
| Unbounded list reads | data-api (2×H, M), performance (3×H) |
| Attachment metadata trusted from client | auth-security (H), data-api (H), forms-validation (H) |
| `npm run lint` broken | docs (H), dead-code (L) |
| `SESSION_SECRET` dev fallback | auth-security (M), docs (H) |
| Stale `notifications.ts` comment | docs (H), dead-code (L) |
| Local `cn` shadow + unused imports | dead-code (L + Cos), ui-ux (L) |
| Jobs table: 4 headers, 5 columns | accessibility (M), ui-ux (L) |
| Four models never read or written | dead-code (M), data-api (M) |

---

## 6. Claims that did not survive verification

Every Critical was re-checked against source before being recorded. Two did not hold as stated.
Both corrections are also appended to the originating findings files.

**forms-validation — "Unselected optional dropdowns … one of them violates a foreign key."**
The empty-string half is confirmed by executing the project's own schema: `{assignedToId: ""}`,
`{vesselAreaId: ""}` and `{departmentCode: ""}` all parse and are written verbatim, so the column
holds `""` where `NULL` belongs and `where: { assignedToId: null }` silently misses those rows.
The foreign-key half is false — none of the three columns declares a `@relation` in
`prisma/schema.prisma`. The one FK on `CrewRequest` besides `project` is `linkedChangeOrderId`,
which is not a field on the create form. **Downgraded Critical → High.**

**data-api — "the change-order export ignores project scope."**
It does not. `api/export/change-orders/route.ts:35` calls `getActiveProject(user.id)` and passes
it to `loadRows(project?.id)`. The real defect is narrower: `where: projectId ? { projectId } :
undefined` falls to `undefined` for a user who can reach no project at all, and that user exports
every change order in the database. Also, `loadRows` has no `archivedAt: null` term, so archived
change orders export alongside live ones — not in the original finding. **Held at High, restated.**

Seven earlier auth-security Criticals were verified against source and carry `**[verified]**` in
that file: the demo credentials, the `transitionJob` bypass, the rejected-CO-becomes-APPROVED bug,
the missing `assertTransitionChangeOrder` call, the unguarded suppliers page, the partial
crew-request permission coverage, and the unscoped change-orders list. All seven confirmed.

---

## 7. What was checked and found correct

Recorded so that Phase 5 does not "fix" working code.

- **The acceptance ceremony itself.** `lib/jobs/acceptance.ts` is sound: the code is hashed bound
  to its challenge id, verified with `timingSafeEqual`, single-use, ten-minute TTL, five-attempt
  lockout, and the quote fingerprint means a client can only sign the version they were shown. Its
  weaknesses are all external to it — the generic transition side door (C2), the non-atomic attempt
  counter (T5), and the `SESSION_SECRET` fallback.
- **`lib/project.ts`.** The scoping model is correct. The defect is that almost nothing calls it.
- **`prefers-reduced-motion`** is properly honoured, and the `!important` clamps in
  `globals.css:263-271` even override the inline transition in `Donut.tsx:72`.
- **The `muted` token** (#8294b3) passes WCAG AA everywhere — 4.99:1 at worst. Only `faint` fails.
- **All badge and status colours** pass contrast on their tinted backgrounds.
- **The client bundle** is small and correctly tree-shaken. Only six files carry `"use client"`.
- **The chart palette** was validated for colour-vision deficiency during construction and the two
  failing pairs were changed; `components/charts/palette.ts` records the verdicts.
- **No orphaned routes.** `/print/*` is intentionally unlinked and reached only by the PDF exporter.
- **`npx prisma validate` passes.**

---

## 8. Sequencing note for Phase 4

Three findings are prerequisites rather than items — fixing anything else first either wastes the
work or actively degrades the product:

1. **C11, the error boundary.** Roughly forty throw sites currently blank the screen. Every
   security fix in this report adds guards, and therefore adds throws. Until there is somewhere
   for an error to land, each correct fix makes the app worse.
2. **A scoping primitive.** C4 spans fourteen call sites. They need one `requireProjectAccess`
   guard and one scoped-`where` helper, not fourteen hand-written project terms.
3. **A single transition write path.** C2, C5, C7 and C8 are all the same failure — a write that
   does not go through the state machine. Patching them individually leaves the next write path
   free to repeat it.

`ACTION_PLAN.md` sequences the work accordingly.
