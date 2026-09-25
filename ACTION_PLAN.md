# OceancOS — Remediation action plan

Phase 4 of the Universal Platform Audit. Sequenced from `AUDIT_REPORT.md` by **dependency first,
severity second**: a Critical that depends on unbuilt scaffolding waits for the scaffolding, and a
Medium that unblocks eight Highs goes early.

Execution rules, carried from the protocol and not negotiable during Phase 5:

- One item per commit. No batching unrelated fixes.
- Every item passes `npm run build`, `npm run typecheck` and the unit suite before the next begins.
- Anything found while fixing is **logged as a new finding in `audit/findings-phase5.md`**, not
  silently folded into the current item.
- An item that turns out to be wrong or unnecessary is struck through with the reason, not deleted.

Numbering is `G<gate>.<item>`. Gates are ordered; items inside a gate are ordered but may be
parallelised where noted.

### Phase 2b additions

`AUDIT_REPORT_ADDENDUM.md` consolidates five further findings files into 35 new distinct defects,
three of them Critical (C15–C17). They are sequenced into the gates below by the same rule. No
existing item is renumbered, reworded or removed. Each addition takes the next free number in its
gate and is marked *(Phase 2b)*. The IDs `N*` and `R*` are the addendum's.

Where the Criticals went, and why:

- **C15 (dashboard and Approvals Centre ungated) → G2.9, in Gate 2 and not a gate of its own.**
  It needs no machinery: `hasPermission` and `EmptyState` exist, and a page that returns
  `EmptyState` never throws, so it does not depend on Gate 1 at all. It is the same early-return
  every module page already carries. It sits in Gate 2 marked independent, as C3 does (G2.5). It
  is not in Gate 0, which has been executed and held the anonymous-visitor exposure. Run it first
  among the remaining work.
- **[X2] (crew-request workflow buttons) → no new item.** It is C6. G2.4 already closes
  workflow-logic's finding that the detail page renders every transition unfiltered, and [X2] is
  the live confirmation. See the note after G2.12.
- **C16 (unscoped assignment fails open) → G1.4, in Gate 1.** G2.1 applies
  `listProjectsForUser` everywhere. While that function returns every project for an unscoped
  yard or external role, G2.1 changes nothing for those roles, so C16 is a foundation as well as a
  Critical.
- **C17 (designated authoriser not enforced) → G2.11.** G2.3 closes the `transitionJob` side
  door. C17 is the ceremony's own door admitting the wrong signer. **G2.3 as scoped does not fix
  it.**

Other placements:

- Seven existing defects that Phase 2b re-observed had no closing item. The ungated comment
  actions, now seen on seven roles, go to G2.12. The admin directory rendering and the unguarded
  suppliers page go to G2.9. The remaining four land in G3.17–G3.19.
- GUEST's `change_order.view` and the other grant-fit findings go to one review (G3.15). That
  review must precede G6.7, which removes the 14 dead keys (the notifications pass's twelve are
  among them), and G6.9, which seeds GUEST.
- The design-consistency work sits in Gate 3 (G3.17–G3.19), because it changes markup that
  Gate 5 measures.

---

## Gate 0 — Stop the bleeding (no dependencies, ship immediately)

Two items that need nothing built first and should not wait behind a single other line of work.

| | Item | Sources | Severity |
|---|---|---|---|
| **G0.1** | **Delete `DemoHint` and remove it from the login page.** Replace the seed's shared `"password"` with a per-account random password printed once by the seed script to stdout. Update the README's seeded-login table (which lists 9 of 12 users) to say where credentials come from rather than listing them. | C1 | Critical |
| **G0.2** | **Resolve the dependency advisories.** `npm audit` reports two Critical and three High against production dependencies. Upgrade; where a major bump is required, record the breaking change and take it now rather than at the end. | dead-code `[DEPENDENCIES]` | High |

G0.1 is roughly twenty minutes of work and is the difference between "an internal tool with bugs"
and "an open door". It goes first.

---

## Gate 1 — Foundations (everything downstream depends on these)

These three build the machinery Gates 2–4 use. None is itself a Critical; all three block
Criticals. **This is the dependency-before-severity inversion the protocol calls for.**

### G1.1 — Error boundary and one failure convention

Blocks: C11 and every guard added in Gate 2.

- Add `src/app/error.tsx`, `src/app/(app)/error.tsx`, `src/app/global-error.tsx` and
  `src/app/not-found.tsx`. The `(app)` boundary keeps the shell and renders the failure inside it.
- Introduce a typed `ActionError` (`kind: "forbidden" | "not-found" | "invalid" | "conflict"`,
  plus a user-facing message and an optional field map) and a `failAction()` helper.
- Convert the change-order and crew-request actions from `throw new Error(string)` to `ActionError`.
  Leave the jobs/auth `redirect(?error=...)` convention alone for now; G3.6 unifies them once the
  boundary is proven.
- The boundary must never render an exception message in production.

Closes: C11, data-api `[ERRORS] × 2`, ui-ux `[ERROR STATES]`, forms-validation
`[VALIDATION-MESSAGES] — no error boundary`, `[VALIDATION-MESSAGES] — raw zod messages`.

### G1.2 — The scoping primitive

Blocks: C4 (fourteen call sites), C5, and the tenancy Highs.

- `requireProjectAccess(user, projectId)` — throws `ActionError("forbidden")` unless the project is
  in `listProjectsForUser`. This is the write-path guard.
- `scopedProjectFilter(user)` — returns a Prisma `where` fragment. **Critically, it must return a
  never-matching filter, not `undefined`, when the user can reach no project.** The current
  `projectId ? { projectId } : undefined` ternary in the export route is exactly the bug this
  prevents.
- Unit tests for both, including the zero-project case, the vessel-scoped case and the unscoped
  owner-side case.
- Do **not** apply them yet. Application is G2.1.

### G1.3 — One transition write path

Blocks: C2, C5, C7, C8 — four Criticals that are all the same defect.

- `applyTransition({ entity, from, to, actor, permission })` in `src/lib/workflow/`, which asserts
  the transition is legal, asserts the permission, asserts project access via G1.2, and performs
  the status write **conditionally on the status that was read** (`updateMany` with `where: { id,
  status: from }`, then assert one row affected). That conditional write also closes T5's
  lost-update class for status.
- Every status write in the application routes through it. No exceptions, including the approval
  path.
- Move `NOT_OFFERED` out of `jobActions` and into the transition map itself, so the server and the
  screen genuinely cannot disagree — the thing `lib/jobs/workflow.ts`'s header comment already
  claims.

### G1.4 — Unscoped role assignments fail closed *(Phase 2b)*

Blocks: C16, and G2.1's effect for every yard, external and vessel-side account. Parallel with
G1.2; must land before G2.1. Unlike G1.1–G1.3, this item is itself a Critical. It sits here because
G2.1 depends on it.

- `listProjectsForUser` grants every active project to any assignment that names neither project
  nor vessel, for any role (`src/lib/project.ts:36-39`). Limit that branch to an explicit list of
  platform-wide role keys. The file's own comment says owner-side staff. Which roles belong on the
  list is a product decision, and it should be recorded in code rather than left as the default.
  Any other unscoped assignment resolves to no project, through the existing zero-project path
  (`:49`), which G1.2's `scopedProjectFilter` already turns into a never-matching filter.
- Scope the seed. Every yard, external and vessel-side account gets a `projectId` or `vesselId`;
  `prisma/seed.ts:164` currently sets neither. The seven accounts G6.9 adds follow the same rule.
- No in-product path exists to set a scope (`/admin` is read-only; see auth-security's admin
  finding). Seed and SQL stay the provisioning path, and G6.3's README says so. Do not wait for an
  admin UI.
- Unit tests alongside G1.2's:
  - an unscoped external role resolves to no project;
  - an unscoped platform-wide role resolves to every project (unchanged);
  - a scoped role resolves to its own project only.

Closes: C16.

---

## Gate 2 — The Criticals (depend on Gate 1)

### G2.1 — Apply project scoping across all fourteen call sites
Depends on G1.2. Change orders, crew requests, suppliers, search, notifications fan-out, both
print views, both PDF exports, the change-order spreadsheet export, `updateProjectAction`, and the
`projectId`-from-form creates (take it from the active project, never from the submitted form).
Add the missing `archivedAt: null` on the export while in the file.
Closes: C4, C5 (partly), auth-security `[TENANCY] × 4` + `[RBAC] — updateProjectAction`,
workflow-logic `[NOTIFICATIONS] — recipient lookups are global`, data-api `[EXPOSURE] × 3`.

### G2.2 — Rewrite `decideChangeOrderApproval`
Depends on G1.1, G1.2, G1.3. This is the money path and it carries five distinct Criticals. It is
a rewrite, not a patch:
- Validate the decision with `ApprovalDecisionSchema` (currently dead code).
- A `REJECTED` stage must terminate the chain, not stop blocking the count.
- Enforce the stage `order` that is stored but never read.
- Route the status write through `applyTransition`.
- Wrap all five writes in `prisma.$transaction`.
- Notify on every stage and on rejection, not just the first stage.
Closes: C5, C7, C8, C9, C10, workflow-logic `[CHANGE ORDERS] × 3`.

### G2.3 — Close the `transitionJob` acceptance side door
Depends on G1.3. `CLIENT_ACCEPTED` must be unreachable from the generic transition action; the
only route to it is the ceremony in `jobs/[id]/accept/actions.ts`. Add an e2e regression that posts
the transition directly and asserts it is refused.
Closes: C2.

### G2.4 — Complete the crew-request permission coverage
Depends on G1.3. All nine statuses, with an exhaustive `switch` the type checker can verify, and no
silent `else`. Fix `assignCrewRequest`, which bypasses the map entirely and can reopen a closed
request.
Closes: C6, workflow-logic `[CREW REQUESTS] × 2`.

### G2.5 — Authorise the object, not just the session, on uploads
Independent of Gate 1. The local route checks the session and then serves any key. Attachments must
be looked up, their parent record's project checked, and the key derived server-side rather than
accepted from the client.
Closes: C3, auth-security `[UPLOADS] × 2`, data-api `[VALIDATION] — attachment metadata`,
forms-validation `[SCHEMA] — attachUploads`.

### G2.6 — Fix the storage default that loses uploads
Independent. `.env.example` presents local-disk as the default, which on most deployments means
uploads land on ephemeral disk. Make `STORAGE_DRIVER` required with no default, and fail startup
when it is unset. Document `MAIL_OUTBOX_DIR` and `E2E_PORT` while in the file.
Closes: C14, docs `[ENV] × 3`.

### G2.7 — Make the app usable on a phone
Independent of everything else; can run in parallel with G2.1–G2.6. The 240px sidebar becomes a
drawer below `md`, with the project switcher moved into it rather than hidden.
Closes: C12, ui-ux `[RESPONSIVE] × 2`.

### G2.8 — Optional fields that are blank must be `NULL`
Independent. A `blankToNull` preprocessor on every optional field in `lib/validators.ts`, so `""`
becomes `undefined` before coercion. Fixes the blank due date outright and stops `""` being stored
where `NULL` belongs. A data migration for rows already written with `""`.
Closes: C13, forms-validation `[REQUIRED-FIELDS] × 2`.

### Phase 2b additions to Gate 2

`dashboard/page.tsx:35-77` and `approvals/page.tsx:33-61` are in data-api's C4 location list but
not among G2.1's enumerated sites. G2.9 below adds only the permission half. Those two pages still
need G1.2's scoped filter in the same pass as G2.1.

### G2.9 — Every page gates on the permission of the data it renders *(Phase 2b)*
Independent of Gate 1; may run immediately, ahead of G1.2. Follows `DESIGN_CONSISTENCY_SPEC.md`
§4: return `EmptyState`, or omit the panel, before any query runs, and never throw from the page.
- `/dashboard`:
  - change-order stats and the status donut under `CO_VIEW`;
  - crew-request stats under `CR_VIEW`;
  - upcoming milestones under `SCH_VIEW`;
  - the approvals table under `CO_VIEW`, filtered to what its title claims;
  - top risks under `RSK_VIEW`;
  - recent activity under `AUDIT_VIEW`.

  Skip each query when the permission is absent rather than fetching and hiding; G4.4 inherits the
  saving.
- `/approvals`: a page gate on `CO_VIEW`. "Pending with Other Approvers" must not fall through to
  every stage for a user who holds none.
- `/suppliers` and the search supplier branch: add a `SUP_VIEW` key, grant it where `CON_VIEW` is
  granted, and let G3.15 revisit the grant.
- `/admin`: render the user directory only under `ADM_USERS`, and the audit log only under
  `AUDIT_VIEW`. Until G6.9 grants `admin.users`, nobody sees the directory, which is the
  fail-closed outcome.
- e2e: as `crew@`, `/dashboard` shows no change-order number, risk title or audit row, and
  `/approvals` renders the no-access state.
Closes: C15, workflow-functional `[APPROVALS]`, auth-security `[RBAC]` suppliers page,
auth-security `[RBAC]` admin directory (the rendering half; the grant decision stays with G6.9).

### G2.10 — Money renders only under `FIN_VIEW` *(Phase 2b)*
Independent; runs after G2.9, which touches the same files. Mirror `canSeeMoney` from
`print/change-orders/[id]/page.tsx:39` on:
- `change-orders/page.tsx:170`;
- `change-orders/[id]/page.tsx:112,115`;
- `approvals/page.tsx:134,208,261`;
- the dashboard approvals table;
- `crew-requests/[id]/page.tsx:109`.

Ten roles hold `CO_VIEW` without `FIN_VIEW`, and today they see every figure the print page and
the export withhold.
Closes: N1.

### G2.11 — The ceremony checks the signer is the designated authoriser *(Phase 2b)*
Independent of Gate 1 and of G2.3. Land it in the same release as G2.3 so that both doors into the
ceremony close together. **G2.3 as scoped does not fix this.** G2.3 makes `CLIENT_ACCEPTED`
unreachable from `transitionJob`, but C17 runs through the ceremony itself with every internal
check passing.
- Require `job.designatedAuthoriserId === user.id` in:
  - `accept/page.tsx:30`;
  - `requestAcceptanceCode` (`accept/actions.ts:50`);
  - `confirmAcceptance` (`:127`);
  - the job page's Authorise panel (`jobs/[id]/page.tsx:493`).
- `rejectQuote` (`:261`) gets the same check. It is gated on `JOB_CANCEL`, which YARD_PM holds.
- Delegation is a product decision. If it is allowed, make it explicit: a named override (for
  example, OWNERS_REP), recorded as a delegation in the `APPROVE` audit row, with the named
  authoriser notified. Otherwise refuse.
- e2e: `pm@` is refused on a quote addressed to `captain@`.
Closes: C17.

### G2.12 — Gate the change-order and crew-request comment actions *(Phase 2b)*
Depends on G1.2. Runs after G2.2 and G2.4, which touch the same files and supply the record
loaders. auth-security's fixes for both C5 (`loadChangeOrder` "…and `addChangeOrderComment`") and
C6 ("all four crew-request actions") name the comment actions, but G2.2's and G2.4's bullets do
not. The change:
- assert `CO_VIEW` / `CR_VIEW`;
- load the parent;
- apply `requireProjectAccess`;
- refuse a missing parent rather than writing an orphan row;
- render the comment forms on both detail pages only for users who pass the same check.

Closes: auth-security `[RBAC]` comment actions (Medium, **[verified]**; re-observed on CONTRACTOR,
CLASS_SURVEYOR, FLAG_SURVEYOR, AUDITOR and OWNER), and the authorisation half of data-api
`[VALIDATION]` "Four write paths".

**Note on G2.4 ([X2]).** G2.4 closes workflow-logic `[CREW REQUESTS]` "Four of the nine
transitions", whose fix includes filtering the detail page's buttons by permission
(`crew-requests/[id]/page.tsx:137-149`). [X2] confirms that this half is live through the ordinary
UI: CREW is shown Start Work, Mark Blocked and Await Approval. Source shows the server would
accept all three; the walkthrough did not click them. It stays inside G2.4, which is not done
until a CREW session is shown no transition it cannot perform.

---

## Gate 3 — Integrity and correctness (depend on Gate 2)

Sequenced after Gate 2 because several of these touch the same files the Critical rewrites land in.

| | Item | Closes |
|---|---|---|
| **G3.1** | **One migration for schema constraints**: foreign keys on the ~36 orphan `*Id` columns, `CHECK` constraints on the 41 free-text status columns, indexes on every FK and filter column. Run after G2.8's data cleanup — the FK additions will fail on `""` rows otherwise. | data-api `[SCHEMA] × 3`, `[INDEXES]`, performance `[DB]` |
| **G3.2** | **Money to `Decimal`** across 21 columns. Separate migration; touches the exports, the XLSX number formats and the charts. | data-api `[SCHEMA] — money as double` |
| **G3.3** | **Sequence allocation** via a `Counter` table with an atomic increment, replacing `count() + 1`. Also fixes the acceptance attempt counter's read-modify-write. | T5, forms-validation `[DOUBLE-SUBMIT]`, data-api, workflow-logic |
| **G3.4** | **Wrap the five remaining non-atomic multi-step writes** in transactions. | data-api `[TRANSACTIONS] × 2` |
| **G3.5** | **Form pending states.** A shared `SubmitButton` using `useFormStatus`, applied to all 28 server-action forms. Prevents the double-create that G3.3 makes merely a conflict rather than a duplicate. | T7, forms-validation `[DOUBLE-SUBMIT] × 2`, ui-ux `[DEAD BUTTONS]` |
| **G3.6** | **Unify the two failure conventions** on `ActionError` now that the boundary is proven. Preserve submitted values on validation failure instead of discarding the form. Mirror server minimums on the client. | T3, T8, forms-validation `[VALIDATION-MESSAGES] × 3` |
| **G3.7** | **The dead controls**: "Mark all read" (a permanent no-op that destroys unread state on render), the Approvals Centre generic queue (no decision controls, no links), five of seven search result types linking to a list instead of the record, job attachments that are uploaded and stored but never displayed, the PDF button that drops the user into raw JSON. | ui-ux `[DEAD BUTTONS] × 2`, `[DEAD LISTS]`, `[DEAD LINKS]`, `[DATA NOT RENDERED]`, `[ERROR STATES]` |
| **G3.8** | **Loading states**: `loading.tsx` per route segment and `<Suspense>` around the slow panels. | ui-ux `[LOADING STATES]` |
| **G3.9** | **Workflow gaps that are not security**: `EXPIRED` is never set by anything (and the acceptance audit records a false `wasExpired`); `MINOR_DEFICIENCY` has no route back to the yard; progress can be set on any job in any status; a quote can never be revised or re-issued; "Request more information" and "Revise" lead nowhere. | workflow-logic, 5 × High/Medium |
| **G3.10** | **Currency.** Money renders as euros everywhere regardless of the project's configured currency. | ui-ux `[CURRENCY]` |

### Phase 2b additions to Gate 3

Numbered in dependency order. G3.15 must precede G3.16 and G3.17, and G3.18 must precede G3.19.

| | Item | Closes |
|---|---|---|
| **G3.12** | **Every decision records why** *(Phase 2b)*. Add the comment field to the Approvals Centre's inline decision form; G2.2's `ApprovalDecisionSchema` already carries `comment`. Thread a reason through every crew-request transition, required for Reject and Block; the action already accepts `comment` and no caller passes one. Make the cancellation reason required. Give Report minor deficiency a required description, and add a column for it in its own migration after G3.1. Land the deficiency part with G3.9, so the description travels in the yard notification G3.9 adds. Depends on G1.3, G2.2, G2.4. | N3, N4, N5, N13 |
| **G3.13** | **The countersignature as its own action** *(Phase 2b)*. Take `ACCEPTED` out of the generic `transitionJob` button and give it a dedicated action with a required note and an `APPROVE`-class audit row, matching the evidential weight of the client ceremony without requiring a second factor. Depends on G1.3, G2.3. | N6 |
| **G3.14** | **Crew-request assignment** *(Phase 2b)*. Limit the assignee list to users who hold a crew-request permission on the request's project; `assignCrewRequest` validates the id against the same list. Make the create form's caption state that choosing an assignee skips triage. Depends on G2.1, G2.4. | N7, N14 |
| **G3.15** | **Role-grant review** *(Phase 2b)*. One pass with a product owner over R1–R13, recorded as the decision behind each change to `ROLE_PERMISSIONS`. Includes GUEST's `CO_VIEW`, SUPPLIER's purpose, the `SUP_VIEW` grant from G2.9, and whether `EXPORT` is wired or removed. Depends on G1.4, G2.9, G2.10, so that a new view grant never widens a surface that is still ungated. **Precedes G6.7 and G6.9.** G6.7 must not delete a key this review keeps, and G6.9 must not seed GUEST, SUPPLIER and the other five roles with grants this review rejects. | R1–R13 |
| **G3.16** | **Scope below the project** *(Phase 2b)*. Decide which of department (HOD, using the unused `UserRole.departmentId`), trade (YARD_TRADE_LEAD) and contracted scope (CONTRACTOR, a job-to-party assignment) exist. Add them to the G1.2 primitive, and bound `JOB_VIEW`, `JOB_PROGRESS` and `CR_VIEW` by them. Its own migration. Depends on G1.2, G1.4, G2.1, G3.1, G3.15. | N2 |
| **G3.17** | **One no-access experience** *(Phase 2b)*. One shell for "you cannot do this", with the copy naming who to ask. Drop "Try again" from the `forbidden` branch of `(app)/error.tsx`. Page components check `hasPermission` before any `assertPermission` (`DESIGN_CONSISTENCY_SPEC.md` §4). Filter the sidebar by permission. On `/approvals`, distinguish "you hold no approval stage" from "all caught up". Show "No role" rather than "GUEST" in the top bar. Depends on G3.6, G3.15. | N8, N12, N15, R13 (copy), ui-ux `[CONSISTENCY]` four wordings, auth-security `[RBAC]` sidebar |
| **G3.18** | **Rebuild the change-order and crew-request create forms** *(Phase 2b)* on `SectionCard`, with the `jobs/new` submit row (primary + Cancel, left-aligned), per `DESIGN_CONSISTENCY_SPEC.md` §7. Depends on G3.5 and G3.6, which rewrite the same two forms. | N10, ui-ux `[CONSISTENCY]` no Cancel |
| **G3.19** | **Design-spec conformance** *(Phase 2b)*, per `DESIGN_CONSISTENCY_SPEC.md`: `SectionCard` as the one titled section (retire `Panel`, keep `.eyebrow` above `<h1>` only); `MiniStat` for the seven stat-tile copies; `FilterBar` on jobs and inventory; the auth pages' card wrapper; delete the bottom back links; `row-hover` only where the whole row navigates; a `ConfirmButton` for every destructive transition, composed with G3.5's `SubmitButton`. Depends on G3.8, G3.11, G3.18. **Precedes Gate 5**, which measures this markup. | N9, N11, N16–N19, accessibility `[SEMANTICS]` `row-hover` |

---

## Gate 4 — Performance (depends on G3.1's indexes)

Measuring before the indexes exist produces the wrong answers, so this gate follows G3.1.

| | Item |
|---|---|
| **G4.1** | `take` + cursor pagination on the seven unbounded list pages and the two exports. |
| **G4.2** | Jobs list: one grouped aggregate instead of seven `COUNT`s; order in SQL, not in Node. |
| **G4.3** | Request-level memoisation of `requireUser` and `getActiveProject` (React `cache`), removing the 7 duplicate queries per `/jobs` render. |
| **G4.4** | Dashboard: 24 calls down, and the five sequential awaits into one `Promise.all`. |
| **G4.5** | Job detail: bound the comment, history and attachment trail. |
| **G4.6** | Search: trigram indexes for the leading-wildcard `ILIKE` scans, or drop the leading wildcard. |
| **G4.7** | PDF: pool the Chromium instance and bound concurrent renders. Configure the Prisma connection pool. |
| **G4.8** | Stream the upload driver instead of buffering whole files; throttle `FileDrop`'s parallel uploads. |

---

## Gate 5 — Accessibility (after Gate 3's UI churn settles)

Deliberately after Gate 3: `faint` has 98 uses across 34 files and G3.7/G3.8 will add more.

| | Item |
|---|---|
| **G5.1** | Raise `faint` to pass WCAG AA on all five surfaces, or restrict it to large text. 98 uses. |
| **G5.2** | Skip link, and an `id` on `<main>` — currently 24 tab stops before content on every page. |
| **G5.3** | Restore focus visibility: the project switcher's `focus:outline-none` with no replacement, and the form fields that downgrade the 9.29:1 ring to 1.50:1. |
| **G5.4** | Unnest `FileDrop` from `Field`'s `<label>` — three labelable controls in one label. |
| **G5.5** | The remaining 11 Medium semantics/ARIA items: `EmptyState`'s `<h3>` leaving pages with no `<h1>`, the 4-header/5-column table, unannounced upload progress, unnamed search inputs, row-action buttons with no row context, `scope` on table headers. |

---

## Gate 6 — Documentation and dead code (last, because it describes the result)

| | Item |
|---|---|
| **G6.1** | Install ESLint, add a config, wire `npm run lint` into CI. Currently the script exists and cannot run. |
| **G6.2** | Add Prettier and a `format` script. |
| **G6.3** | Rewrite `README.md`: working e2e instructions from a clean clone, all 13 npm scripts, deployment documentation (there is none), and the seeded-login table per G0.1. |
| **G6.4** | Retire `QA_TEST_REPORT.md` and `PROJECT_REVIEW_AND_BUILD_PLAN.md`, or rewrite them. Both are substantially false and the README points at the latter as the architecture document. |
| **G6.5** | Add `CLAUDE.md` / a contributor guide explaining the refit domain a new maintainer has to learn. |
| **G6.6** | Correct the lying comments: `notifications.ts` points at a file that does not exist; the storage comments claim uploads never pass through the server when with the default driver they always do; `playwright.config.ts` describes CI behaviour CI contradicts. |
| **G6.7** | Remove the dead code: 4 unreferenced models, 14 unenforced permission keys, the duplicated user-lookup helper (4 copies, one unbounded), the shadowed `cn`, 11 unused imports, the `console.log`s in `email.ts`. |
| **G6.8** | Remove the invented customer logos from the marketing page and the roadmap notes shipped in user-facing subtitles. |
| **G6.9** | Grant `admin.users` / `admin.roles` / `admin.settings` to a role, or delete them. Seed the seven roles that have no account, so a role walkthrough can actually exercise them. |

*(Phase 2b)* Two constraints from the additions:
- **G6.7.** The 14 unenforced keys include the notifications-permissions pass's twelve
  granted-but-unchecked keys. `PERMISSION_MATRIX.md` gives the per-role grant lines. G6.7 runs
  after G3.15 and removes only the keys that review did not keep.
- **G6.9.** It seeds the seven accounts scoped per G1.4 and with G3.15's grants. Seeding GUEST or
  SUPPLIER before G2.9 and G3.15 would turn C15 and R10 into live exposures.

---

## Gate 7 — Regression (Phase 6)

Not a fix gate. After Gate 6:

- Walk every route as each of the 19 roles. G6.9 is a prerequisite — seven roles currently have no
  seeded account and have therefore never been walked.
- Re-run all nine specialist audits against the fixed tree and diff the findings.
- Confirm every closed item and record anything that regressed.
- Verify `audit/findings-phase5.md` is empty or triaged.
- *(Phase 2b)* The role walk now has a baseline: `audit/findings-role-walkthrough-vessel.md` and
  `audit/findings-role-walkthrough-yard-external.md`. Diff against them. Their seven reasoned
  sections become live walks once G6.9 seeds the missing accounts. Re-check C15, C16 and the G3.15
  grant decisions for every role.

---

## Decisions taken

Recorded here because both change the shape of the plan.

**Next.js stays on 14 for this pass.** The two remaining Critical advisories are both Next and both
need 14.2.35 → 16.3.5, a React 19 migration touching every async request API in the application.
Taking it mid-remediation would stall the plan and destabilise a suite that currently passes. Real
exposure is low: one advisory is a self-hosted Image Optimizer DoS and the app has no images at
all; the other is request smuggling in rewrites and the app has no rewrites. **The migration
becomes Gate 8**, after regression, with every fix and test in place behind it.

**The ten scaffold modules are labelled, not hidden and not built.** They keep their sidebar
entries and gain an explicit "not yet built" state; the empty-state copy that instructs users to
perform actions the UI does not offer is rewritten. This is **G3.11**, added below. Building them
out remains out of scope — absent features from `BRIDGE_ALIGNMENT_PLAN.md` are not audit findings.

| | Item | Closes |
|---|---|---|
| **G3.11** | **Label the ten scaffold modules as unbuilt.** A shared `ComingSoon` state replacing the misleading empty states on schedule, financials, logistics, inventory, drawings, documents, meetings, risks, contractors and suppliers. Keep the sidebar entries; make the state honest. | ui-ux `[SCAFFOLDS]`, `[EMPTY STATES]` |

---

## Gate 8 — Next.js 16 migration (after regression)

Deferred from G0.2. Closes the last two Critical advisories and the two High `postcss` advisories
that ship inside Next. Taken as one dedicated piece of work against a green suite: React 19, the
async `cookies()` / `headers()` / `params` APIs, and a full re-run of the e2e suite.
