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
Closes: C15, docs `[ENV] × 3`.

### G2.7 — Make the app usable on a phone
Independent of everything else; can run in parallel with G2.1–G2.6. The 240px sidebar becomes a
drawer below `md`, with the project switcher moved into it rather than hidden.
Closes: C12, ui-ux `[RESPONSIVE] × 2`.

### G2.8 — Optional fields that are blank must be `NULL`
Independent. A `blankToNull` preprocessor on every optional field in `lib/validators.ts`, so `""`
becomes `undefined` before coercion. Fixes the blank due date outright, stops the unselected
"linked change order" select from crashing the database with a foreign-key violation (reproduced
directly in G1.3's e2e test — see `audit/findings-forms-validation.md`'s retraction), and stops
`""` being stored where `NULL` belongs on the columns with no relation. A data migration for rows
already written with `""`.
Closes: C13, C14, forms-validation `[REQUIRED-FIELDS] × 2`.

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

---

## Gate 7 — Regression (Phase 6)

Not a fix gate. After Gate 6:

- Walk every route as each of the 19 roles. G6.9 is a prerequisite — seven roles currently have no
  seeded account and have therefore never been walked.
- Re-run all nine specialist audits against the fixed tree and diff the findings.
- Confirm every closed item and record anything that regressed.
- Verify `audit/findings-phase5.md` is empty or triaged.

---

## Decisions taken

Recorded here because each changes the shape of the plan.

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
| **G3.12** | ~~**Give suppliers a permission gate.** `suppliers/page.tsx` is the one list page with no `hasPermission` check at all — every other module has one. No `PERMISSIONS.SUP_VIEW` key exists yet, so this needs a small RBAC decision (which key, which roles) that the other nine pages' copy-paste fix doesn't need; that's why it wasn't folded into G2.1 alongside the rest of the scoping pass. Discovered in Phase 2 (`auth-security`, `[RBAC] — the suppliers page has no permission check`, Medium) but never assigned a gate in Phase 4 — noted here rather than silently left untracked.~~ **Folded into 10.3.** The permission matrix makes the RBAC decision this item was waiting on: a `supplier.view` key, granted by default to OWNER, OWNERS_REP, PROJECT_MANAGER, CAPTAIN, PURSER, FINANCE and AUDITOR (`PERMISSIONS_MATRIX_MASTER_PROMPT.md` §6.2). | auth-security `[RBAC] — suppliers` |

**Access control becomes an admin-editable permission matrix.** Found after Gate 7: permissions
are still unioned across every role assignment regardless of its project scope (`auth.ts:75-77`),
so a per-project role leaks onto every reachable project, and the static role matrix cannot be
adjusted without a code change. Rather than patch the union, access moves to a typed permission
catalog (112 keys across 24 modules), per-project per-person overrides on top of editable access
sets, and a Users & Access screen. The decisions are:
- overrides are per project;
- admin is tiered with no escalation: an account admin edits the templates, a project admin edits
  their own projects and can only grant what they hold;
- job prices get their own key;
- the most specific assignment wins;
- there is no blanket "Approve" level.

The full brief, including the defects it fixes and the verified defaults, is
`PERMISSIONS_MATRIX_MASTER_PROMPT.md`. It is **Gates 9–11** below. They do not depend on Gate 8,
and because the scope leak is live, they may run first. Its findings are logged at the end of
`audit/findings-phase5.md`.

---

## Gate 8 — Next.js 16 migration (after regression)

Deferred from G0.2. Closes the last two Critical advisories and the two High `postcss` advisories
that ship inside Next. Taken as one dedicated piece of work against a green suite: React 19, the
async `cookies()` / `headers()` / `params` APIs, and a full re-run of the e2e suite.

---

## Gate 9 — Access foundations

Full scope and acceptance criteria for each item are in `PERMISSIONS_MATRIX_MASTER_PROMPT.md` §15.
Independent of Gate 8.

| | Item |
|---|---|
| **9.1** | Typed permission catalog (`src/lib/permissions/keys.ts`, `catalog.ts`); `rbac.ts` becomes a façade. 42 existing + 70 new keys, with zero call-site edits. |
| **9.2** | System access-set defaults (20 sets including ACCOUNT_ADMIN), separation-of-duties rules and category ceilings. |
| **9.3** | Migration `access_matrix`: access-set metadata, per-project and account overrides, `AuditLog.projectId`, department order. |
| **9.4** | Seed via a pure `planSync`, so admin edits survive re-seeding; the D1 regression fixture. |
| **9.5** | Pure effective-permission policy (most specific assignment wins, overrides, closure, deny cascade). |
| **9.6** | Project-aware `getCurrentUser` and guards (`assertPermissionOn`); closes the scope leak. |
| **9.7** | One holder lookup (`holdersOf`) behind `usersWithPermissionOnProject`, the authoriser dropdown and its validation. |

---

## Gate 10 — Access enforcement

| | Item |
|---|---|
| **10.1** | Check permissions after loading the record, against the record's project, at every action. |
| **10.2** | Sidebar filtered by module view key; TopBar shows the active project's access sets. |
| **10.3** | `supplier.view` on the suppliers page and search. **Closes G3.12.** |
| **10.4** | Dedicated comment keys for change orders and crew requests. |
| **10.5** | Per-module export keys; money in exports by price keys; PDF routes checked before render. |
| **10.6** | Money redaction by price/cost keys on every page that shows it. |
| **10.7** | Project-scoped audit log and Recent activity; `/admin` directory account-scoped; `/admin/projects` narrowed to projects the user can edit. |
| **10.8** | Approvals page gate and typed stage map; crew-request progress key. |
| **10.9** | Static coverage test: every enforced key guarded, every page and action guarded. |

---

## Gate 11 — Users & Access screen (after Gates 9 and 10)

| | Item |
|---|---|
| **11.1–11.5** | Admin authority rules (no escalation, self-edit, rank, last admin, reasons, SoD) and the server actions for project access, access sets and admins. |
| **11.6–11.10** | `/admin/access`: shell, tabs and URL state; the matrix grid with staging; the Review & save dialog. |
| **11.11–11.14** | Filter chips, List view, Access sets tab, Admins tab. |
| **11.15** | Full e2e suite plus a 100-person performance check. |
| **11.16** | Docs, including `CLAUDE.md`'s "Roles and permissions" section. |
