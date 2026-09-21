# Dead-code audit — OceancOS

Scope: unused code, orphaned routes, stale dependencies, debug statements,
duplicated logic. Every "unused" claim below was verified by grepping for
importers/references across `src/`, `prisma/`, `scripts/`, `tests/` and `e2e/`,
not inferred.

---

### [DEPENDENCIES] — Production dependencies carry two Critical and three High security advisories
Severity: High
Location: /home/user/OceancOS/package.json
Found by: dead-code-cleanup

Description:
`npm audit` reports 14 vulnerabilities (2 critical, 5 high, 6 moderate, 1 low)
against the installed tree. The direct dependencies implicated are:

- `next@^14.2.35` — **Critical**. Advisories include DoS via Image Optimizer
  `remotePatterns` configuration and an HTTP request-handling issue. Fix requires
  `next@16.x` (semver-major).
- `vitest@^2.1.9` — **Critical** (devDependency). Arbitrary file read/execute when
  the Vitest UI server is listening, plus path traversal via `@vitest/mocker`.
  Fix requires `vitest@5.x` (semver-major).
- `nodemailer@^6.10.1` — **High**. Recipient-domain validation bypass via RFC 5322
  comment mis-parsing (mail can be delivered to an attacker-controlled domain) and
  SMTP command injection. This package is reachable in production: it is
  dynamically imported by `src/lib/email.ts:58` whenever `SMTP_HOST` is set, and
  `sendEmail` is called from the password-reset flow
  (`src/app/forgot/page.tsx:53`) and the quote-acceptance flow
  (`src/app/(app)/jobs/[id]/accept/actions.ts:110`). Fix requires
  `nodemailer@10.x` (semver-major).
- `postcss@^8.4.47` — **High**. XSS via unescaped `</style>` in stringify output
  and arbitrary `.map` file disclosure via attacker-controlled `sourceMappingURL`.
- `exceljs@^4.4.0` — **Moderate**, via a vulnerable transitive `uuid` (<11.1.1).
  Used by the spreadsheet export path (`src/lib/export/xlsx.ts:23`).

Transitively: `browserslist` (High), `nanoid` (High), `vite` (High),
`esbuild`, `@vitest/mocker`, `vite-node`, `baseline-browser-mapping`, `uuid`
(all Moderate), `postcss-selector-parser` (Low).

Impact:
The `nodemailer` advisory is directly exploitable through a user-facing form: the
password-reset flow sends a reset token by email, and a recipient-domain bypass
means a reset link could be delivered to a domain the attacker controls. The
`next` critical advisories affect the self-hosted runtime. The `vitest`/`vite`
advisories are dev/CI-only but CI runs `npm test` on every push
(`.github/workflows/ci.yml`), so a malicious dependency or test fixture has a
path to file read/execute on the runner.

Suggested fix:
Run `npm audit fix` for the non-breaking subset first (`browserslist`,
`baseline-browser-mapping`, `postcss-selector-parser`, `nanoid`). Then schedule
the three semver-major bumps deliberately: `nodemailer@10` first (smallest
surface, highest real-world exposure — it is used in exactly two call sites),
then `next@16`, then `vitest@5`. Pin `postcss` to `>=8.5.23` via an override if
the Next.js bump cannot land immediately. Add `npm audit --audit-level=high` as
a CI step so this does not silently re-accumulate.

---

### [DATABASE] — Four Prisma models are never read or written anywhere in the application
Severity: Medium
Location: /home/user/OceancOS/prisma/schema.prisma
Found by: dead-code-cleanup

Description:
All 46 models were cross-checked against `src/` for direct client access
(`prisma.<model>.*` / `db.<model>.*`) **and** for indirect access through nested
`include`/`select` relation traversal. Four models have neither, and are not
populated by `prisma/seed.ts` or `prisma/seedJobs.ts` either:

- `CostCode` (`prisma/schema.prisma`) — referenced only by `PurchaseOrder.costCodeId`,
  which is itself dead. No relation field, no query, no seed row.
- `Invoice` — reachable in the schema only via `Supplier.invoices`, and
  `src/app/(app)/suppliers/page.tsx:10` does a bare `findMany` with no include.
- `PurchaseOrder` — reachable only via `Supplier.pos`, likewise never included.
- `Setting` — a `key`/`value` table with zero references; the matching
  `PERMISSIONS.ADM_SETTINGS` permission key is also never checked.

For the record, these models looked dead on a naive `db.<model>` grep but are in
fact live through nested relations, and should **not** be removed:
`BudgetCategory` (`include: { category: true }`, `src/app/(app)/financials/page.tsx:23`),
`MeetingAction` (`include: { actions: true }`, `src/app/(app)/meetings/page.tsx:17`),
`DrawingRevision` (`include: { revisions: ... }`, `src/app/(app)/drawings/page.tsx:17`),
`JobVariation` (`variation: true`, `src/app/(app)/jobs/[id]/page.tsx:54`),
`Role` / `Permission` / `RolePermission` (nested role-permission queries in
`src/app/(app)/jobs/actions.ts:75`, `src/app/(app)/change-orders/actions.ts:119`,
`src/app/(app)/jobs/new/page.tsx:37`, `src/app/(app)/jobs/[id]/accept/actions.ts:237`,
`src/app/(app)/admin/page.tsx:17`).

Impact:
Four tables are created and migrated on every deploy for features that do not
exist. A maintainer reading the schema will reasonably conclude that purchase
orders, invoicing and a settings store are implemented — the suppliers page even
advertises "Linked to purchase orders and invoices"
(`src/app/(app)/suppliers/page.tsx:17,24`) against tables that are always empty.
That is the kind of dead weight that misleads rather than merely costs bytes.

Suggested fix:
Either drop `CostCode`, `Invoice`, `PurchaseOrder` and `Setting` (plus
`Supplier.invoices`, `Supplier.pos` and `PurchaseOrder.costCodeId`) in a
migration, or add a schema comment marking them as reserved for a named,
scheduled phase. If they are kept, soften the suppliers-page copy so it does not
claim a link that cannot exist.

---

### [RBAC] — Two parallel permission systems; fourteen permission keys are never enforced
Severity: Medium
Location: /home/user/OceancOS/src/lib/rbac.ts
Found by: dead-code-cleanup

Description:
Permissions are modelled twice.

1. A static matrix `ROLE_PERMISSIONS` in `src/lib/rbac.ts:80` backing
   `hasPermission` / `assertPermission` — used in 57 call sites.
2. The database tables `Role` / `Permission` / `RolePermission`, queried directly
   with hand-rolled traversals in five places:
   `src/app/(app)/jobs/actions.ts:75-78` and `:131`,
   `src/app/(app)/change-orders/actions.ts:119`,
   `src/app/(app)/jobs/new/page.tsx:37`,
   `src/app/(app)/jobs/[id]/accept/actions.ts:237`.

`src/app/(app)/jobs/actions.ts:75-78` is the clearest case: the file imports
`hasPermission` (line 8) and then never uses it, because the same question — "does
this user hold `JOB_ACCEPT`?" — is re-answered against the DB with a four-level
nested include. The unused import is the fossil of the switchover.

Separately, fourteen keys declared in `PERMISSIONS` are never passed to any check
outside `rbac.ts`: `FIN_EDIT_BUDGET`, `FIN_APPROVE`, `SCH_EDIT`, `LOG_EDIT`,
`INV_EDIT`, `DRW_UPLOAD`, `DRW_APPROVE`, `DOC_UPLOAD`, `CON_EDIT`, `MTG_EDIT`,
`RSK_EDIT`, `ADM_ROLES`, `ADM_SETTINGS`, `EXPORT`.

Impact:
Two sources of truth for authorisation will drift, and the DB path can disagree
with the static matrix for the same user. The fourteen unenforced keys read as
guarantees in the role matrix — a maintainer adding an edit form to
`/inventory` or `/risks` would reasonably assume `INV_EDIT` / `RSK_EDIT` are
already wired and skip adding the guard. Note also that `EXPORT` is declared but
the export routes gate on `CO_VIEW` / `JOB_VIEW` instead
(`src/app/api/export/change-orders/route.ts:29`, `src/app/api/export/jobs/route.ts:21`).

Suggested fix:
Pick one source of truth. If the static matrix wins, replace the five nested
role-permission queries with `hasPermission(...)` against a loaded user and treat
the DB tables as seed-time documentation. If the DB wins, move the traversal into
a single `userHasPermission(userId, key)` helper in `src/lib/rbac.ts` and route
every check through it. Then delete permission keys with no enforcement point, or
add the guards they imply.

---

### [DUPLICATION] — User-id-to-name lookup re-implemented four times, one of them unbounded
Severity: Medium
Location: /home/user/OceancOS/src/app/(app)/change-orders/[id]/page.tsx
Found by: dead-code-cleanup

Description:
Four pages build the same "resolve actor ids to display names" map, with four
different shapes:

- `src/app/(app)/change-orders/[id]/page.tsx:52-60` — collects ids from comments,
  history, approvals and `createdById`, then `findMany({ where: { id: { in } } })`
  into a `Map`.
- `src/app/print/change-orders/[id]/page.tsx:29-37` — the same pattern, narrowed to
  approval deciders plus `createdById`.
- `src/app/(app)/jobs/[id]/page.tsx:69-89` — same intent, but stores an array and
  resolves with `people.find(...)` (O(n) per lookup) behind a local `nameOf` closure.
- `src/app/(app)/crew-requests/[id]/page.tsx:32-33` — **loads every active user in
  the system** (`findMany({ where: { active: true } })`) and maps them, rather than
  querying only the ids the page actually renders.

Impact:
Four copies means four places to fix when the display rule changes (for example,
falling back to email for a deleted user, or masking names from a contractor
account). The `crew-requests/[id]` variant is also a latent performance problem:
it is an unbounded table scan on every detail-page render to resolve at most a
handful of comment authors, and it will leak the full user roster into the RSC
payload of a page a contractor can open.

Suggested fix:
Add one helper — e.g. `resolveUserNames(ids: string[]): Promise<Map<string,string>>`
in `src/lib/project.ts` or a new `src/lib/users.ts` — that de-duplicates ids,
filters nulls and does a single `findMany({ where: { id: { in } }, select: { id, name } })`.
Replace all four sites with it; the `crew-requests` page in particular should pass
only the ids it renders.

---

### [UNUSED EXPORT] — `ApprovalDecisionSchema` is defined but no approval path validates against it
Severity: Medium
Location: /home/user/OceancOS/src/lib/validators.ts
Found by: dead-code-cleanup

Description:
`ApprovalDecisionSchema` (`src/lib/validators.ts:52`) is exported and never
referenced anywhere — the only occurrence of the identifier in the entire
repository is its own definition. Meanwhile the approval decision action
`decideChangeOrderApproval` in `src/app/(app)/change-orders/actions.ts` handles
its `FormData` without it, unlike `createChangeOrder` and `createCrewRequest`,
which do use their sibling schemas (`ChangeOrderCreateSchema`,
`CrewRequestCreateSchema`).

Impact:
This is dead code that actively misleads: a maintainer grepping `validators.ts`
will see a schema named for the approval decision and conclude that approval
decisions are validated. They are not. The inconsistency also means the approval
path is the one mutation in the change-order workflow with no schema boundary.

Suggested fix:
Wire `ApprovalDecisionSchema` into `decideChangeOrderApproval` (the preferable
fix — it closes a real gap), or delete it. Do not leave it declared and unused.

---

### [DUPLICATION] — Local `cn` helper shadows `@/lib/utils` in a file that already imports from it
Severity: Low
Location: /home/user/OceancOS/src/app/(app)/change-orders/[id]/page.tsx
Found by: dead-code-cleanup

Description:
`src/app/(app)/change-orders/[id]/page.tsx:364` defines a module-local
`function cn(...classes)` that joins truthy class names. The canonical
`cn` lives at `src/lib/utils.ts:3` and wraps `clsx`, and this same file already
imports `fmtMoney` and `fmtDateTime` from `@/lib/utils` on line 9. This is the
only duplicate of `cn` in the codebase.

Impact:
The local copy does not handle the object/array `ClassValue` forms that `clsx`
supports, so a future edit that passes `cn({ "text-red": bad })` will silently
render `[object Object]` as a class name in this one file and work everywhere
else. A same-named helper with subtly different semantics is worse than none.

Suggested fix:
Delete lines 364-366 and add `cn` to the existing `@/lib/utils` import on line 9.

---

### [DEAD CODE] — Unused exported functions in the PDF and storage modules
Severity: Low
Location: /home/user/OceancOS/src/lib/export/pdf.ts
Found by: dead-code-cleanup

Description:
Four exported functions have no reference anywhere in the repository other than
their own definition (verified with a whole-word grep across `src`, `prisma`,
`scripts`, `tests`, `e2e`):

- `closePdfRenderer()` — `src/lib/export/pdf.ts:85`
- `pdfAvailable()` — `src/lib/export/pdf.ts:96`
- `downloadUrl(key)` — `src/lib/storage/index.ts:182`
- `deleteObject(key)` — `src/lib/storage/index.ts:245`

Impact:
`closePdfRenderer` is the more consequential one: `src/lib/export/pdf.ts` keeps a
module-level cached Chromium `Browser`, and the only function that would release
it is never called — so nothing in the app ever tears the browser down, and the
existence of an unused teardown function makes it look as though something does.
`downloadUrl` and `deleteObject` pull in `@aws-sdk/client-s3` and
`@aws-sdk/s3-request-presigner` code paths (`GetObjectCommand`,
`DeleteObjectCommand`) that no feature exercises, so the S3 driver's read and
delete paths are entirely untested by use.

Suggested fix:
Either call `closePdfRenderer` from a shutdown/`process.on("beforeExit")` hook or
remove it and document that the browser is intentionally process-lifetime.
Remove `pdfAvailable`, `downloadUrl` and `deleteObject`, or keep them and add the
attachment download/delete feature they were clearly written for.

---

### [DEAD CODE] — Four exported enum constants in `src/lib/enums.ts` have no consumer
Severity: Low
Location: /home/user/OceancOS/src/lib/enums.ts
Found by: dead-code-cleanup

Description:
Each of these is referenced exactly once in the repository — at its own
definition:

- `VARIATION_DUE_TO` (`src/lib/enums.ts:109`)
- `VARIATION_AFFECTING` (`src/lib/enums.ts:117`)
- `APPROVAL_RESOURCES` (`src/lib/enums.ts:152`)
- `PROJECT_TYPES` (`src/lib/enums.ts:180`)

`VARIATION_DUE_TO` / `VARIATION_AFFECTING` mirror the `JobVariation.dueTo` and
`JobVariation.affecting` columns. Those columns are read in
`src/app/(app)/jobs/[id]/page.tsx:251-254` but `JobVariation` is never created or
updated anywhere in `src/` — only the seed writes it — so no form ever offers
these options. `APPROVAL_RESOURCES` lists ten resource types including
`PURCHASE_ORDER`, which maps to a dead model.

Impact:
Low in weight, but these are the schema-shaped constants a maintainer would reach
for when building the variation form, and their presence implies a picker exists
somewhere. `APPROVAL_RESOURCES` in particular overstates what the approvals queue
actually handles.

Suggested fix:
Remove them, or use them: `VARIATION_DUE_TO` / `VARIATION_AFFECTING` should drive
`<Select>` options on the quote form if variation capture is in scope.

---

### [DEBUG] — `console.log` / `console.error` left in application code in `src/lib/email.ts`
Severity: Low
Location: /home/user/OceancOS/src/lib/email.ts
Found by: dead-code-cleanup

Description:
A full sweep of `src/` for `console.*` and `debugger` found exactly two
occurrences, both in `src/lib/email.ts`:

- line 54: `console.log(\`[email:outbox] ${message.subject} → ${message.to} (${name})\`)`
- line 80: `console.error(\`[email] failed to send "${message.subject}" to ${message.to}: ${error}\`)`

There are no `debugger` statements anywhere. The only other logging is in
`prisma/seed.ts`, `prisma/seedJobs.ts:337` and `scripts/qa.ts`, all of which open
with `/* eslint-disable no-console */` and are intentional.

Impact:
Line 54 fires only on the development "outbox" transport, so it is low risk, but
it prints a recipient address to stdout. Line 80 fires on the **production** SMTP
path and logs the recipient address and the subject of a failed message into
application logs — for the password-reset mail that is a user email address plus
a "Reset your password" subject line in plaintext logs, which is more than a log
line should carry. Both lines carry `// eslint-disable-next-line no-console`
comments that do nothing, because ESLint is not installed (see the next finding).

Suggested fix:
Route both through a small logger that redacts the recipient (`to: <user 3f9a…>`)
and can be silenced by level, or at minimum drop the address from line 80 and log
the user id instead. If `console` is the intended logger here, delete the two
inert `eslint-disable` comments so they do not imply a linter is watching.

---

### [TOOLING] — `npm run lint` cannot run: ESLint is not installed and no config exists
Severity: Low
Location: /home/user/OceancOS/package.json
Found by: dead-code-cleanup

Description:
`package.json` declares `"lint": "next lint"`, but there is no `eslint` or
`eslint-config-next` in `dependencies` or `devDependencies`, nothing matching
`eslint` under `node_modules/`, and no `.eslintrc*` / `eslint.config.*` at the
repository root. `.github/workflows/ci.yml` runs `typecheck`, `test`, `build`,
`db:seed`, `qa` and the e2e job — it never runs `lint`.

Consequently the five `eslint-disable` comments in the tree are inert:
`src/lib/email.ts:53`, `src/lib/email.ts:79`, `prisma/seed.ts:1`,
`prisma/seedJobs.ts:1`, `scripts/qa.ts:1`.

Impact:
A contributor running `npm run lint` gets an interactive Next.js setup prompt or
a failure, not a lint pass. More to the point, the `eslint-disable` comments are
documentation of a rule that is not enforced — the exact pattern where dead
debug statements accumulate unnoticed.

Suggested fix:
Either add `eslint` + `eslint-config-next`, commit a config, and add a `lint` step
to CI; or delete the `lint` script and the five dead `eslint-disable` comments so
the repo does not claim a linting posture it does not have.

---

### [DUPLICATION] — The job line-item table is hand-written three times
Severity: Low
Location: /home/user/OceancOS/src/app/(app)/jobs/[id]/page.tsx
Found by: dead-code-cleanup

Description:
The same quantity / unit / unit-price / total row rendering appears in three
files with only class-name differences:

- `src/app/(app)/jobs/[id]/page.tsx:192-199`
- `src/app/(app)/jobs/[id]/accept/page.tsx:147-154`
- `src/app/print/jobs/[id]/page.tsx:125-131`

All three call `line.quantity.toLocaleString("en-GB")` and
`fmtMoney(line.unitPrice, currency)` / `fmtMoney(line.total, currency)` in the
same order.

Impact:
The accept page and the print page are the two surfaces a client signs against.
If the money formatting or the column order changes in one and not the others,
the figures a client accepts on screen will not match the PDF they countersign.
That is a correctness risk carried by copy-paste, not just tidiness.

Suggested fix:
Extract a `JobLineTable({ lines, currency, variant })` component (the print
variant differs only in `className`) into `src/components/workflow/` and use it
in all three places.

---

### [DUPLICATION] — Export route scaffolding duplicated, with a behavioural drift between the two
Severity: Low
Location: /home/user/OceancOS/src/app/api/export/jobs/route.ts
Found by: dead-code-cleanup

Description:
`src/app/api/export/jobs/route.ts` and
`src/app/api/export/change-orders/route.ts` share the same shape: auth,
permission check, `getActiveProject`, build `Sheet`, emit. But they have drifted:
`change-orders/route.ts:33` supports `?format=csv`, and `jobs/route.ts` does not —
so `/api/export/jobs?format=csv` silently returns XLSX. The two per-id PDF routes
(`src/app/api/export/change-orders/[id]/route.ts`,
`src/app/api/export/jobs/[id]/route.ts`) are likewise near-identical wrappers
around `appBaseUrl` + `renderPdf`.

Impact:
A caller (or a future UI "Download CSV" button) will reasonably expect the
`format` parameter to work uniformly across exports. The silent fallback is the
worst outcome: a wrong-content-type file with no error.

Suggested fix:
Lift the shared pieces into `src/lib/export/` — a `respondWithSheet(sheets, format, filename)`
helper and a `respondWithPdf(request, path, filename)` helper — and have all four
routes call them, which makes the CSV support uniform by construction.

---

### [STALE] — Comment in `src/lib/notifications.ts` points at a file that does not exist
Severity: Low
Location: /home/user/OceancOS/src/lib/notifications.ts
Found by: dead-code-cleanup

Description:
Line 38 reads:
`// Email fan-out is deliberately a no-op until SMTP is configured. See lib/notifications/email.ts.`

There is no `src/lib/notifications/` directory — `notifications.ts` is a flat
file. The dynamic import on line 42 actually resolves `./email`, i.e.
`src/lib/email.ts`, and `sendEmailBatch` does exist there
(`src/lib/email.ts:89`), so the code works. Only the comment is wrong. The
comment is also stale in substance: the fan-out is no longer a no-op.

Impact:
A maintainer chasing the email path will look for a directory that was never
created and may conclude the feature is unimplemented, when in fact
`sendEmailBatch` runs whenever `SMTP_HOST` is set.

Suggested fix:
Rewrite the comment to point at `src/lib/email.ts` and describe the actual
behaviour (fan-out runs when `SMTP_HOST` is set, failures are swallowed because
in-app notifications are the source of truth).

---

### [UNUSED IMPORT] — Eleven imports bound but never referenced
Severity: Cosmetic
Location: /home/user/OceancOS/src/app/(app)/change-orders/[id]/page.tsx
Found by: dead-code-cleanup

Description:
Every `import` specifier in the repository was checked against the rest of its own
file. Eleven are dead:

| File | Unused specifier |
|---|---|
| `src/app/(app)/change-orders/[id]/page.tsx:30` | `GitMerge` (lucide-react) |
| `src/app/(app)/approvals/page.tsx:10` | `Clock` (lucide-react) |
| `src/app/(app)/contractors/page.tsx:6` | `Phone` (lucide-react) |
| `src/app/(app)/jobs/[id]/page.tsx:17` | `EmptyState` |
| `src/app/(app)/approvals/page.tsx` | `EmptyState` |
| `src/app/(app)/jobs/page.tsx:15` | `JOB_STATUS_LABELS` |
| `src/app/(app)/jobs/page.tsx` | `JobStatus` (type) |
| `src/app/(app)/meetings/page.tsx:6` | `fmtDateTime` |
| `src/app/(app)/jobs/actions.ts:8` | `hasPermission` |
| `src/app/(app)/crew-requests/actions.ts:6` | `hasPermission` |
| `src/lib/jobs/views.ts:12` | `JOB_PENDING_STATUSES` |

`src/components/ui/FileDrop.tsx` and the marketing components were checked and are
clean.

Impact:
Mostly noise. Three cases are worth more than a tidy-up, though: the two unused
`hasPermission` imports sit beside hand-rolled DB permission checks (see the RBAC
finding above) and read like a guard that was removed; and the unused
`EmptyState` on `approvals` and `jobs/[id]` suggests an empty state that was
planned and never rendered on two pages that can legitimately return no rows.
Unused lucide icons are tree-shaken by the Next.js build, so there is no bundle
cost.

Suggested fix:
Delete the ten genuinely-unneeded specifiers. Before deleting the `EmptyState`
imports, confirm those two pages render something sensible when their lists are
empty — if not, use the import rather than remove it.

---

### [UNUSED EXPORT] — Module-internal helpers exported without an external consumer
Severity: Cosmetic
Location: /home/user/OceancOS/src/lib/storage/index.ts
Found by: dead-code-cleanup

Description:
These are used inside their own module but exported to nobody:

- `localUploadToken` — `src/lib/storage/index.ts:112` (consumed by
  `verifyLocalUploadToken` on line 119 and by `signUpload`)
- `DEFAULT_MAX_UPLOAD_BYTES` — `src/lib/storage/keys.ts:26`
- `emailTransportName` — `src/lib/email.ts:29`
- `outboxDir` — `src/lib/email.ts:33`
- `codeRegex` — `src/lib/jobs/codes.ts:19` (used by line 37)
- `ringSegmentPath` — `src/lib/charts/geometry.ts:77`

Plus twenty-four exported **types** with no importer:
`JobAction`, `CodeRules`, `JobViewKey`, `JobView`, `JobGroup`, `StoredChallenge`,
`ChallengeProblem`, `ProjectTiming`, `WeightedProgressItem`, `StoredReset`,
`PasswordProblem`, `ChangeOrderCreateInput`, `CrewRequestCreateInput`,
`PdfOptions`, `ColumnType`, `Column`, `SignedUpload`, `StorageDriverName`,
`AllowedUploadType`, `UploadTarget`, `YardPeriodInput`, `DateProblem`,
`NotifyKind`, `ChangeOrderAction`, `EmailMessage`, `SendResult`,
`CrewRequestStatus`, `ArcSlice`, `PlotBox`, `Scales`, `UploadedFile`, `SeriesKey`,
`StepSeries`.

Impact:
Negligible at runtime. The value exports widen each module's public surface —
`localUploadToken` in particular is a token *minting* function exposed next to the
verifier, which is the kind of export that eventually gets called from the wrong
place. Exported types are harmless and often deliberate.

Suggested fix:
Drop `export` from the six value helpers (keep `verifyLocalUploadToken` public).
Leave the types alone unless the module is being tidied for other reasons.

---

### [DUPLICATION] — Three brand lockups and two `Row` components with the same names
Severity: Cosmetic
Location: /home/user/OceancOS/src/components/marketing/Logo.tsx
Found by: dead-code-cleanup

Description:
The gradient "O" brand mark is implemented three times:
`src/components/marketing/Logo.tsx:11-16` (marketing nav/footer),
`src/components/auth/BrandMark.tsx:4-15` (login/forgot/reset), and inline in
`src/components/layout/Sidebar.tsx:56-58` (app shell). All three render a
`bg-brand-gradient` rounded square containing `O` with `shadow-glow`, differing
only in radius, size units and whether the wordmark is attached.

Separately, two unrelated local components are both called `Row`:
`src/components/charts/ProgressRings.tsx:86` and
`src/app/print/change-orders/[id]/page.tsx:158`.

Also: `src/lib/enums.ts:183` defines `export const STATUS_LABELS: Record<string,string> = { ...JOB_STATUS_LABELS }`
— a pure alias that copies one map into another with no additions, consumed only
by `src/components/ui/Badge.tsx:27`. And `formatChartValue`'s `"money"` branch
(`src/components/charts/format.ts:12-16`) restates `fmtMoney`
(`src/lib/utils.ts:9`) exactly, though the file's header comment explains why
(charts are client components and cannot receive a server-side formatter).

Impact:
Cosmetic. The brand duplication means a logo change needs three edits and will
likely be applied to two of them. The `STATUS_LABELS` alias is a redundant
indirection that makes the status-label lookup harder to follow than it needs
to be.

Suggested fix:
Consolidate the mark into one `BrandMark` with size/variant props and have
`Logo` compose it; use it in `Sidebar` too. Rename one of the `Row` components.
Either fold `STATUS_LABELS` into `JOB_STATUS_LABELS` or, if non-job statuses are
expected to be added to it later, add a comment saying so.

---

### [ROUTES] — No orphaned routes; `/print/*` is intentionally unlinked
Severity: Cosmetic
Location: /home/user/OceancOS/src/components/layout/Sidebar.tsx
Found by: dead-code-cleanup

Description:
All 32 `page.tsx` routes were cross-referenced against every internal `href`,
`redirect()` and `page.goto()` in `src/` and `e2e/`. Every route is reachable:

- Nineteen are in the sidebar `NAV` array (`src/components/layout/Sidebar.tsx:27-47`).
- `/jobs/new`, `/change-orders/new`, `/crew-requests/new` are linked from their
  list pages; `/jobs/[id]`, `/jobs/[id]/quote`, `/jobs/[id]/accept`,
  `/change-orders/[id]`, `/crew-requests/[id]` from their rows.
- `/login`, `/forgot`, `/reset/[token]` form the auth flow.
- `/print/change-orders/[id]` and `/print/jobs/[id]` are deliberately not linked
  from any UI — they are fetched by the headless-Chromium PDF renderer
  (`src/app/api/export/change-orders/[id]/route.ts:38`,
  `src/app/api/export/jobs/[id]/route.ts:28`) and exercised directly by
  `e2e/exports.spec.ts:75` and `e2e/jobs.spec.ts:274`.

Worth noting rather than flagging: nine sidebar destinations (`/documents`,
`/drawings`, `/inventory`, `/logistics`, `/meetings`, `/suppliers`,
`/contractors`, `/risks`, `/schedule`) are navigational dead ends — they are
read-only list views whose underlying models have **zero write paths anywhere in
`src/`** (verified: no `create`/`update`/`upsert`/`delete` against `Document`,
`Drawing`, `InventoryItem`, `LogisticsItem`, `Meeting`, `Supplier`, `Contractor`,
`Risk`, `ScheduleTask`, `Milestone`, `Budget`, `Approval`). Their contents come
entirely from `prisma/seed.ts`.

Impact:
Not dead code — but a reader of the sidebar will assume nine working modules
where there are nine seeded read-only views. The route layer is clean; the
expectation the nav sets is not.

Suggested fix:
No route changes needed. Consider marking the read-only sections in the nav (a
"view only" affordance) until write paths exist, so the sidebar does not overstate
the product.

---

### [STALE] — Superseded planning documents kept at the repository root
Severity: Cosmetic
Location: /home/user/OceancOS/PROJECT_REVIEW_AND_BUILD_PLAN.md
Found by: dead-code-cleanup

Description:
Three planning documents sit at the root, in different states of currency:

- `PROJECT_REVIEW_AND_BUILD_PLAN.md` (7.1 KB) — describes the initial
  build-from-empty-repo, opening "the repository was empty at the start of this
  work". Superseded in substance by `BRIDGE_ALIGNMENT_PLAN.md`.
- `QA_TEST_REPORT.md` (8.2 KB) — carries an inline "Update, 2026-09-19. The
  caveat below is closed" header above text that still describes the pre-test
  state, so the document contradicts itself for a reader who skips the header.
- `BRIDGE_ALIGNMENT_PLAN.md` (69 KB) — the live plan; §9 holds the progress log
  the other two defer to.

No commented-out code blocks were found anywhere in `src/`, `prisma/`,
`scripts/`, `tests/` or `e2e/` — the only `//` and `/* */` comments are prose or
JSX section markers.

Build/runtime leftovers on disk are all correctly gitignored and not tracked:
`.mail/` (46 development outbox JSON files), `.next/`, `uploads/`,
`test-results/.last-run.json`, `tsconfig.tsbuildinfo`, `.env`.

Impact:
Cosmetic. Three overlapping plans at the root make it ambiguous which one a new
contributor should read, and `QA_TEST_REPORT.md` reads as stale until its first
paragraph is parsed carefully.

Suggested fix:
Move `PROJECT_REVIEW_AND_BUILD_PLAN.md` and `QA_TEST_REPORT.md` into a `docs/history/`
folder, or fold their still-relevant content into `BRIDGE_ALIGNMENT_PLAN.md` and
delete them. Point `README.md` at the single live plan. Optionally add a
`.mail/` cleanup line to the dev docs, since it accumulates one JSON file per
development email indefinitely.
