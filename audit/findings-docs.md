# Documentation consistency audit — OceancOS

Sub-agent: `docs-consistency`. Scope: documentation accuracy against actual behaviour.
Verified against the working tree at `036175e`.

---

### [ENV] — `.env.example` documents local-disk storage as the silent production default, which loses uploaded files
Severity: Critical
Location: /home/user/OceancOS/.env.example:7-12, /home/user/OceancOS/src/lib/storage/index.ts:33-38, /home/user/OceancOS/src/app/api/uploads/local/route.ts:14-19
Found by: docs-consistency

Description:
`.env.example:11` ships `STORAGE_DRIVER=` empty and `.env.example:17` ships `S3_BUCKET=` empty, and the comment at `.env.example:10` states the rule: "Leave unset to infer: s3 when S3_BUCKET is present, otherwise local." `storageDriverName()` (`src/lib/storage/index.ts:34-37`) implements exactly that — with neither variable set it returns `"local"`, and `localRoot()` (`src/lib/storage/index.ts:95`) resolves `./uploads` inside the deployment's working directory.

Nothing warns that this is wrong for production. The only statement on the subject asserts the opposite as if enforced: `src/app/api/uploads/local/route.ts:17-18` says "In production the s3 driver is used instead and the browser talks to Cloudflare R2 directly, so this route never handles the bytes." That is a wish, not a check — `localOnly()` on line 21 gates on the *inferred* driver, so on a deployment with no `S3_BUCKET` the route stays live and writes bytes to container-local disk. The README has no deployment section at all, so an operator who does what `.env.example` shows gets a running, apparently healthy app whose drawings, quote attachments and documents are written to an ephemeral filesystem. `.gitignore:6` already ignores `/uploads`, reinforcing that this is a scratch area.

Impact:
A fresh deploy that copies `.env.example` and fills in only `DATABASE_URL` and `SESSION_SECRET` — the only path any document describes — silently stores every uploaded file on the container filesystem. On any container platform, and on any redeploy or restart, those files are gone while the `Attachment`/`JobNote` rows still reference the keys. Uploads then 404 through `src/app/api/uploads/local/route.ts:66` with no error anywhere to explain it. Silent, unrecoverable data loss caused by following the documentation.

Suggested fix:
Make the failure loud. Have `storageDriverName()` throw when `NODE_ENV === "production"` and neither `STORAGE_DRIVER` nor `S3_BUCKET` is set. In `.env.example`, replace the "leave unset to infer" comment with an explicit "`local` is for development and CI only — it writes to container-local disk and those files do not survive a restart. Production must set `STORAGE_DRIVER=s3` and the `S3_*` block below." Correct the comment at `src/app/api/uploads/local/route.ts:17-18` so it describes the guard that exists. Add a "Deploying" section to the README.

---

### [ENV] — `MAIL_OUTBOX_DIR` is read by the app and the e2e suite but absent from `.env.example`
Severity: Medium
Location: /home/user/OceancOS/.env.example, /home/user/OceancOS/src/lib/email.ts:34
Found by: docs-consistency

Description:
Confirmed. `outboxDir()` at `src/lib/email.ts:34` reads `process.env.MAIL_OUTBOX_DIR`, falling back to `./.mail`. Two end-to-end specs read the same variable to find the messages they assert on — `e2e/jobs.spec.ts:5` and `e2e/passwordReset.spec.ts:7` — so it is part of the test contract. It appears nowhere in `.env.example`, the README, or `QA_TEST_REPORT.md`. `.gitignore:16-17` mentions `/.mail` but does not name the variable.

I enumerated every `process.env.X` under `src/`, `prisma/`, `scripts/`, `e2e/` and the config files and compared both directions:
- Used but undocumented: `MAIL_OUTBOX_DIR`, `E2E_PORT`, plus framework-supplied `NODE_ENV` and `CI`.
- Documented but unused: **none**. Every variable in `.env.example` is read somewhere.

Impact:
A maintainer who needs to redirect the development outbox (shared CI workspace, read-only working directory, container where `./.mail` is not writable) has no way to discover the knob short of grepping. Because `sendEmail()` swallows its own failures (`src/lib/email.ts:77-82`) and `notify()` swallows them again (`src/lib/notifications.ts:44-46`), an unwritable outbox produces no visible error — password-reset mails simply never appear.

Suggested fix:
Add to the "Outbound notifications" block of `.env.example`:
```
# Where the development "outbox" transport writes messages when SMTP_HOST is
# unset. The end-to-end tests read this directory.
MAIL_OUTBOX_DIR="./.mail"
```

---

### [ENV] — `APP_URL` is documented as a PDF-only setting but also determines the password-reset link
Severity: High
Location: /home/user/OceancOS/.env.example:33-34, /home/user/OceancOS/src/app/forgot/page.tsx:48
Found by: docs-consistency

Description:
`.env.example:33-34` documents `APP_URL` solely as "Absolute URL the PDF renderer navigates back to. Required behind a proxy." That is one of two uses. `src/app/forgot/page.tsx:48` reads the same variable to build the password-reset URL that is emailed to the user: `const base = process.env.APP_URL || "http://localhost:3000";`. The fallback is hard-coded. Nothing validates it and nothing logs when it is taken. The other consumer, `appBaseUrl()` at `src/lib/export/pdf.ts:107`, at least falls back to the incoming request's own host — so the PDF path degrades gracefully and the password-reset path does not.

Impact:
A deployment that skips `APP_URL` because it does not use PDF export — a reasonable reading of the current comment — emails every user a reset link pointing at `http://localhost:3000/reset/<token>`. The token is minted, stored and audited (`src/app/forgot/page.tsx:39-60`), the UI reports success via the `?sent=1` redirect on line 64, and the user receives a link that cannot work. Password reset is silently broken in production with no error surface. This is the clearest required-but-undocumented-and-fails-silently case in the repository.

Suggested fix:
Move `APP_URL` out of the "PDF export" block into its own block: "The app's own public base URL. Used for links in outbound email (password reset) and by the PDF renderer. Required in any deployment not reached at http://localhost:3000." Better, make `src/app/forgot/page.tsx:48` refuse to send when `APP_URL` is unset outside development.

---

### [ENV] — `SESSION_SECRET` falls back to a hard-coded `"dev-secret"`, and its documented purpose is wrong
Severity: High
Location: /home/user/OceancOS/.env.example:5, /home/user/OceancOS/src/lib/storage/index.ts:113, /home/user/OceancOS/src/lib/jobs/acceptance.ts:27
Found by: docs-consistency

Description:
Two problems in one variable.

First, the fallback. Both consumers default to the same literal when missing: `src/lib/storage/index.ts:113` (`const secret = process.env.SESSION_SECRET || "dev-secret";`, minting the token that authorises a local upload) and `src/lib/jobs/acceptance.ts:27` (same fallback, hashing the six-digit quote-acceptance code). Neither throws. A deployment that omits `SESSION_SECRET` runs normally on a secret published in this repository.

Second, the name and comment mislead. `.env.example:5` presents it as `SESSION_SECRET`, which reads as the session-cookie secret — but `src/lib/auth.ts` never touches it. Session tokens are random bytes stored in the `Session` table (`src/lib/auth.ts:17-27`) and the cookie carries the raw token. Its actual jobs are the local-upload HMAC and the acceptance-code hash, i.e. the secret protecting a signature on money (`src/lib/jobs/acceptance.ts:20-28`).

Impact:
A maintainer concludes this secret protects login sessions and that rotating it logs everyone out; neither is true. An operator who forgets it gets no error, and the acceptance-code hash — the thing making a quote acceptance non-replayable — is keyed on a value anyone can read. `README.md:9` never mentions setting it, only `cp .env.example .env`.

Suggested fix:
Throw at startup when `NODE_ENV === "production"` and `SESSION_SECRET` is unset or equals the placeholder. Rewrite the comment to say what it keys ("Signs local-upload authorisations and quote-acceptance codes. Must be set in production."), or rename to `APP_SECRET`. Add it to the README setup steps as a required edit.

---

### [ENV] — `E2E_PORT` is undocumented
Severity: Low
Location: /home/user/OceancOS/.env.example, /home/user/OceancOS/playwright.config.ts:4
Found by: docs-consistency

Description:
`playwright.config.ts:4` reads `process.env.E2E_PORT ?? 3210` to choose the port the Playwright web server binds and the base URL the tests hit. Not in `.env.example`, not in the README.

Impact:
Minor. A contributor whose machine already has 3210 in use has no documented way to move the suite.

Suggested fix:
Note it in the README's testing notes, or add a commented `# E2E_PORT=3210` to `.env.example`.

---

### [README] — `npm run test:e2e` cannot work from a clean clone as documented
Severity: High
Location: /home/user/OceancOS/README.md:24, /home/user/OceancOS/playwright.config.ts:30-37
Found by: docs-consistency

Description:
The README lists `npm run test:e2e` in its command table with no prerequisites. From a clean clone it fails twice:

1. **No browser.** `@playwright/test` is a devDependency (`package.json:31`) but `npm install` does not download browser binaries. `playwright.config.ts:11` probes `/opt/pw-browsers/chromium` and otherwise leaves `executablePath` undefined, at which point Playwright looks for its own download and errors. CI gets this right with `npx playwright install --with-deps chromium`; the README omits it.
2. **No build.** `playwright.config.ts:33` starts the web server with `npm run start -- -p ${PORT}`, i.e. `next start`, which requires a prior `next build`. `reuseExistingServer: !process.env.CI` (line 35) means locally the config only reuses a server if one is already listening; otherwise it runs `next start` against a missing `.next`. CI runs `npm run build` first; the README never mentions `npm run build` or `npm start` anywhere.

The suite also needs a seeded database (`e2e/shell.spec.ts` signs in with seeded credentials) and reads the mail outbox (`e2e/jobs.spec.ts:5`, `e2e/passwordReset.spec.ts:7`). None stated.

Impact:
Every new contributor who runs the documented command hits an opaque Playwright or `next start` error. The README is the only onboarding document in the repository.

Suggested fix:
Replace the table row with an explicit block: `npx playwright install chromium` (once), `npm run build`, `npm run test:e2e`, and note the suite expects the seeded database.

---

### [README] — No deployment documentation of any kind
Severity: High
Location: /home/user/OceancOS/README.md
Found by: docs-consistency

Description:
The README (43 lines) documents development only. It never mentions:
- `npm run build` / `npm start` — the actual way to run the app outside `next dev`. It does not document how to run the app beyond `npm run dev`.
- `npm run db:deploy` (`prisma migrate deploy`, `package.json:16`) — the non-interactive migration command a deployment must use. It documents `npm run db:migrate` (`prisma migrate dev`) instead, a development-only command that can prompt and can generate migrations from schema drift.
- `SESSION_SECRET` needing a real value, `APP_URL` needing to be set.
- `STORAGE_DRIVER` / the `S3_*` block — so the Critical storage finding has no counterweight anywhere.
- Chromium being required for PDF export. `src/lib/export/pdf.ts:8-10` explains it in a code comment and `.env.example:28-31` in an env comment; no document a deployer reads explains it. Without it the `[id]` export routes return 503 (`src/app/api/export/jobs/[id]/route.ts:44`, `src/app/api/export/change-orders/[id]/route.ts:58`).
- SMTP as a production requirement. With `SMTP_HOST` unset, `emailTransportName()` (`src/lib/email.ts:30`) returns `"outbox"` and every message — including password resets and acceptance codes — is written to a JSON file instead of delivered.

Impact:
A maintainer cannot deploy this correctly from its documentation. The most consequential settings all have safe-looking silent defaults, so a misconfigured deployment looks healthy: uploads vanish, reset links point at localhost, acceptance codes pile up in `.mail`, PDF downloads 503.

Suggested fix:
Add a "Deploying" section: build and start commands, `npm run db:deploy` for migrations, the required environment (`DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `STORAGE_DRIVER=s3` + `S3_*`, `SMTP_*`), and the Chromium requirement with both ways to satisfy it.

---

### [SCRIPTS] — `npm run lint` is broken; ESLint is not installed and CI never runs it
Severity: High
Location: /home/user/OceancOS/package.json:8, /home/user/OceancOS/.github/workflows/ci.yml
Found by: docs-consistency

Description:
`package.json:8` declares `"lint": "next lint"`. Neither `eslint` nor `eslint-config-next` is in `dependencies` or `devDependencies`, and neither is present in `node_modules`. There is no `.eslintrc*` or `eslint.config.*`. I ran it:

```
> next lint
? How would you like to configure ESLint? …
❯  Strict (recommended)
   Base
   Cancel
```

It drops into Next.js's interactive first-run wizard, which hangs forever in any non-TTY context and, if answered, mutates the contributor's `package.json`.

Unnoticed because `.github/workflows/ci.yml` runs `typecheck`, `test`, `build`, `db:seed`, `qa` and `test:e2e` — but never `lint`. Meanwhile the source is written as though a linter runs: `src/lib/email.ts:53`, `src/lib/email.ts:79` and `prisma/seed.ts:1` carry `eslint-disable` directives for a linter that is not installed.

Impact:
A contributor who runs the advertised lint script gets a hang or an unexpected dependency install and a dirty `package.json`. The `eslint-disable` comments imply a lint gate that does not exist, so no one discovers the script is dead.

Suggested fix:
Either add `eslint` and `eslint-config-next` with a checked-in `.eslintrc.json` and a `Lint` step in the `verify` CI job, or remove the script and the orphaned `eslint-disable` comments.

---

### [SCRIPTS] — README documents 5 of the 13 npm scripts; the omitted ones include the production commands
Severity: Medium
Location: /home/user/OceancOS/README.md:20-27, /home/user/OceancOS/package.json:5-18
Found by: docs-consistency

Description:
`package.json` defines 13 scripts. The README setup block names `db:migrate`, `db:seed`, `dev`; the table adds `test`, `test:e2e`, `qa`, `typecheck`, `db:reset`. Undocumented: `build`, `start`, `lint`, `db:push`, `db:deploy`, `test:watch`.

Not evenly harmless. `build` and `start` are how the app runs in production and are a prerequisite of the documented `test:e2e`. `db:deploy` is what a deployment must use instead of the documented `db:migrate`. `db:push` (`prisma db push`) is a schema-drift command that is now actively dangerous — versioned migrations exist under `prisma/migrations/`, and using `db:push` desynchronises the history `db:deploy` depends on. Nothing warns against it.

Impact:
Contributors pick the wrong command. The one genuinely hazardous script is undocumented and unguarded next to four documented safe ones; the two production-critical ones are invisible.

Suggested fix:
Extend the table to cover every script, mark `db:push` as "development scratch only — do not use on a database with applied migrations", and give `build` / `start` / `db:deploy` a place in the deployment section.

---

### [SCRIPTS] — No `format` script and no formatter configuration
Severity: Low
Location: /home/user/OceancOS/package.json:5-18
Found by: docs-consistency

Description:
No `format` or `format:check` script, no `prettier` dependency, no `.prettierrc`, `.prettierignore` or `.editorconfig`. The codebase is nevertheless formatted very consistently (2-space indent, double quotes, ~100 column wrap), so the convention exists only as habit.

Impact:
A contributor cannot reproduce the house style mechanically and CI cannot enforce it, so diffs drift as soon as a second person or a different editor touches the code.

Suggested fix:
Add `prettier` with a `.prettierrc` capturing the existing style, add `"format"` and `"format:check"`, wire `format:check` into CI, document both in the README table.

---

### [DOCS] — `PROJECT_REVIEW_AND_BUILD_PLAN.md` is substantially stale and the README sends readers to it as the architecture document
Severity: High
Location: /home/user/OceancOS/PROJECT_REVIEW_AND_BUILD_PLAN.md
Found by: docs-consistency

Description:
`README.md:43` says "See `PROJECT_REVIEW_AND_BUILD_PLAN.md` for architecture". That document is unchanged since the initial commit, across the eleven commits that followed. Claims now false:

- **`:23`** — "Database: Prisma ORM, SQLite for dev (Postgres-ready)". Moved to PostgreSQL in `1c0c91b`. `prisma/schema.prisma:8` reads `provider = "postgresql"`, `prisma/migrations/migration_lock.toml` pins `postgresql`, all four migrations are Postgres DDL.
- **`:150-151`** — "**Assumption:** SQLite is acceptable for development. Production should run on Postgres." Same contradiction restated as a live assumption.
- **`:63-64`** — "no Playwright/Vitest infrastructure has been set up." There are 11 Vitest files (238 passing tests, verified by running the suite) and 5 Playwright specs (42 tests), both in CI.
- **`:58-62`, `:158-159`** — "I could not run `npm install` / `npx prisma generate`… the build has not been executed." Contradicted by CI, by `BRIDGE_ALIGNMENT_PLAN.md:777-793`, and by the tests passing today.
- **`:47-48`** — "SMTP integration is stubbed behind `lib/notifications/email.ts`". No such file. Email is implemented at `src/lib/email.ts` with two real transports (`src/lib/email.ts:29-31`).
- **`:51-52`, `:154`** — "physical upload is via a local `./uploads` directory and is not S3/Blob backed" / "**Risk:** File storage is local-disk. Replace with S3/Azure Blob before deploying." Both drivers exist in `src/lib/storage/index.ts` with presigned S3 uploads and a signing route at `src/app/api/uploads/sign/route.ts`.
- **`:36-39`** — the "scaffolded" module list is stale both ways: `Suppliers` exists (`src/app/(app)/suppliers/page.tsx`, `Sidebar.tsx:43`) and appears in neither list, and the entire Jobs & Quotes module — the largest thing in the codebase, with `src/lib/jobs/`, `src/app/(app)/jobs/`, the acceptance flow and four migrations — is absent altogether.

Impact:
This is the document the README nominates as the architecture reference. A new maintainer believes the app is on SQLite, has no tests, no file storage and no email — four claims that each send them down a wrong path, and the SQLite one would send them to write a migration that already happened. It gives no hint that the app's central object is now `Job`.

Suggested fix:
Retire it (move to `docs/history/`, relabel "Original build plan, 2026-09-18 — superseded by BRIDGE_ALIGNMENT_PLAN.md") and repoint `README.md:43`, or add a dated banner listing the superseded claims.

---

### [DOCS] — `PROJECT_REVIEW_AND_BUILD_PLAN.md` §5 describes a directory layout that does not match the repository
Severity: Medium
Location: /home/user/OceancOS/PROJECT_REVIEW_AND_BUILD_PLAN.md:66-106
Found by: docs-consistency

Description:
The "Recommended module architecture" tree is wrong in both directions:
- **`:72`** shows `app/(auth)/login`. No `(auth)` route group exists; login is `src/app/login/page.tsx`.
- **`:90`** shows `api/auth/{login,logout}`. No such routes. `src/app/api/` contains only `export/` (4 routes) and `uploads/` (2). Authentication uses server actions.
- **`:91`** shows a bare `api/uploads`; the real shape is `api/uploads/sign` and `api/uploads/local`.
- Missing: the `jobs/` module (`new`, `[id]`, `[id]/quote`, `[id]/accept`), the print views (`src/app/print/jobs/[id]`, `src/app/print/change-orders/[id]`) that the PDF renderer navigates to, the export API, `admin/projects`, `suppliers`, `src/app/forgot`, `src/app/reset/[token]`.
- Missing from `lib/`: `storage/`, `export/`, `jobs/`, `charts/`, `metrics/`, `email.ts`, `passwordReset.ts`, `project.ts`, `projectDates.ts`, `workflow/`.
- **`:103-106`** omits `prisma/migrations/` and `prisma/seedJobs.ts`.

Impact:
A maintainer orienting from this tree looks for `api/auth/login` and an `(auth)` group that do not exist, and has no idea the print routes exist or why (they are the PDF template — `src/lib/export/pdf.ts:3-6`).

Suggested fix:
Regenerate from the current `src/`, or delete §5 when retiring the document, noting that `BRIDGE_ALIGNMENT_PLAN.md` §4 carries the current data model.

---

### [DOCS] — `QA_TEST_REPORT.md` test counts are stale by roughly 5x
Severity: Medium
Location: /home/user/OceancOS/QA_TEST_REPORT.md:3-7, /home/user/OceancOS/QA_TEST_REPORT.md:91-116
Found by: docs-consistency

Description:
The banner at `:4-5` claims "49 Vitest unit tests and 6 Playwright end-to-end tests"; the table at `:93-97` repeats it. Verified by running `npx vitest run` and counting `test(` in `e2e/`:

| | Documented | Actual |
|---|---|---|
| Vitest | 49 | **238** (11 files, all passing) |
| Playwright | 6 | **42** (5 spec files) |
| `npm run qa` | 17 | 17 (correct) |

`BRIDGE_ALIGNMENT_PLAN.md:1160-1164` already records the correct figures, so the two documents contradict each other.

The narrative is stale the same way. `:101-111` lists three unit-test files; there are eleven — undocumented: `chartGeometry`, `exportTable`, `jobAcceptance`, `jobCodes`, `jobWorkflow`, `passwordReset`, `projectDates`, `storageKeys`. `:113` says "**End-to-end tests** (`e2e/shell.spec.ts`)" as though that were the only spec; there are also `adminProjects.spec.ts`, `exports.spec.ts`, `jobs.spec.ts`, `passwordReset.spec.ts`.

Impact:
Understates coverage fivefold and names the wrong files, so a maintainer looking for an existing test will not find it and will duplicate work. `:118-120` compounds this by listing as "not yet covered" things that now are.

Suggested fix:
Regenerate counts and file lists from the suite, or replace the hand-maintained table with a pointer to the CI run.

---

### [DOCS] — `QA_TEST_REPORT.md` "Remaining issues" and "Recommended next steps" list work that is finished
Severity: High
Location: /home/user/OceancOS/QA_TEST_REPORT.md:140-163
Found by: docs-consistency

Description:
Six of nine items are done:
- **`:142-145`** — "No `npm install` or build executed… swapping to Postgres is a `.env` change plus `provider = "postgresql"`." Happened in `1c0c91b`; `prisma/schema.prisma:8` is already `postgresql` with four Postgres migrations.
- **`:146-147`** — "no S3/disk write code is wired into the forms — drawings and documents currently expect an external URL." Contradicted by `src/lib/storage/index.ts`, `src/app/api/uploads/sign/route.ts`, and `src/components/ui/FileDrop.tsx:59-79`, which signs and PUTs directly.
- **`:149`** — "Email notifications: stub present, real SMTP transport not wired." Contradicted by `src/lib/email.ts:58-76`.
- **`:156-157`** — next step 1, "Replace local-disk file storage with S3… add an `/api/uploads` route that returns signed URLs." Done: `src/app/api/uploads/sign/route.ts`.
- **`:158`** — next step 2, "Add Vitest + Playwright". Both in place and in CI.
- **`:161`** — next step 5, "Add CSV export". `src/lib/export/table.ts` provides `toCsv`, `src/lib/export/xlsx.ts` provides workbooks, four export routes exist.

Genuinely open: bulk approve, drawing markup, Gantt (`:148`), the `Approval` decision UI (`:159-160`), tenant scoping (`:163`).

Impact:
Worse than count drift, because it is a work list. A maintainer picking up the project from here would start building S3 storage, an uploads route, a test harness and CSV export — all of which exist. `README.md:43` points here for QA, so it is a first-stop document.

Suggested fix:
Strike the six completed items with the date and commit that closed each — the file already uses `~~strikethrough~~ Resolved <date>` at `:150-152`, so the convention exists.

---

### [DOCS] — `QA_TEST_REPORT.md` manual checklist covers none of the app's newest screens
Severity: High
Location: /home/user/OceancOS/QA_TEST_REPORT.md:23-89
Found by: docs-consistency

Description:
The banner at `:6-7` says the checklist "is kept as a regression reference for the areas the automated tests do not yet reach". Measured against the real navigation (`src/components/layout/Sidebar.tsx:28-48`) and route tree, it misses most of what was built after it was written:

- **Quotes & requests / Jobs** — the sidebar's second entry (`Sidebar.tsx:30`) and the largest module: `/jobs`, `/jobs/new`, `/jobs/[id]`, `/jobs/[id]/quote`, `/jobs/[id]/accept`. Not one checklist line. The three-step acceptance flow with the emailed six-digit code, the quote-fingerprint check, the five-attempt lock and the change-order governance gate (`src/lib/jobs/acceptance.ts`, `src/app/(app)/jobs/[id]/accept/`) is the highest-risk flow in the product and is entirely unlisted.
- **Password reset** — `/forgot` and `/reset/[token]`. The "Auth / login" section at `:25-30` lists five items, none of them reset.
- **Project switcher** — `src/components/layout/ProjectSwitcher.tsx`, now the shell-wide scoping mechanism. Absent; the Dashboard section at `:32-38` still reads as though every page queries across all projects.
- **Admin → Projects** — `/admin/projects` (`Sidebar.tsx:47`). The Admin section at `:86-89` covers only users and the audit log.
- **Exports and print views** — the four `/api/export/*` routes and two `/print/*` pages. No item, and none covering the 503 both `[id]` PDF routes return when Chromium is missing.
- **File uploads** — `FileDrop` on the job request form, the sign route, the local route, the type and size limits in `src/lib/storage/keys.ts`. Nothing.

What is on the checklist still broadly matches: `/login`, dashboard (four stat cards at `src/app/(app)/dashboard/page.tsx:154-163` — matches `:33`), change orders, crew requests, approvals, financials, notifications (`markRead` on visit, `src/app/(app)/notifications/page.tsx:34` — matches `:79`), search, admin. The checklist is not wrong so much as frozen at Phase 0.

Impact:
Presented as the regression net for whatever automation does not reach, and the areas it does not reach are precisely the ones it omits. Anyone doing a release check against it signs off having never opened the module that handles money.

Suggested fix:
Add sections for Jobs & Quotes (list sub-views, section tabs, favourites, the quote form, the three-step acceptance including a wrong code and an expired quote, yard countersign, progress), password reset, the project switcher, admin projects, exports/print, and uploads. Cross-reference which of `e2e/jobs.spec.ts`, `e2e/passwordReset.spec.ts`, `e2e/adminProjects.spec.ts`, `e2e/exports.spec.ts` already automate each, so the manual list shrinks rather than grows.

---

### [DOCS] — `QA_TEST_REPORT.md` setup block contradicts the README and omits PostgreSQL
Severity: Medium
Location: /home/user/OceancOS/QA_TEST_REPORT.md:14-21
Found by: docs-consistency

Description:
The report opens with its own setup block (`cp .env.example .env`, `npm install`, `npx prisma migrate dev --name init`, `npm run db:seed`, `npm run qa`, `npm run dev`). It never mentions that PostgreSQL must be installed and a database created, which `README.md:7-13` correctly does. Running this on a machine with no Postgres fails at step 3 with a Prisma connection error. `--name init` is also wrong now that `prisma/migrations/` holds four named migrations — the flag is meaningful only when creating one, and a migration named init already exists as `20260921154345_init_postgres`.

Impact:
Two setup procedures in two documents, one missing the database prerequisite. A reader who starts from the QA report — plausible, since `README.md:43` links to it — fails at the third command with an error that does not name the cause.

Suggested fix:
Delete the block and point at the README's Quick start.

---

### [DOCS] — `BRIDGE_ALIGNMENT_PLAN.md` §2 "Where OceancOS stands today" is now several phases behind
Severity: Medium
Location: /home/user/OceancOS/BRIDGE_ALIGNMENT_PLAN.md:113-152
Found by: docs-consistency

Description:
§2 is framed as current state — "Honest mapping. 'Exists' means wired end to end" — but has not been updated as phases landed. Rows now false:
- **`:120`** "Project context switcher in header → no UI switcher | **Missing**" — built (`src/components/layout/ProjectSwitcher.tsx`, covered by `e2e/shell.spec.ts`).
- **`:135`** "File uploads as Media → `Attachment` metadata only; no upload route, no storage | **Partial**" — built.
- **`:139`** "Summary / Detailed PDF, spreadsheet export → **Missing**" — built (`src/lib/export/pdf.ts`, `src/lib/export/xlsx.ts`, four routes).
- **`:146`** "Notification settings → SMTP stubbed | **Missing**" — SMTP is no longer stubbed; the settings UI is still genuinely missing, so the row needs splitting rather than deleting.
- **`:147`** "Password reset by email → None | **Missing**" — built.
- Most Job-object rows (`:121-130`) predate the Jobs module and still describe `ChangeOrder` as the nearest equivalent.

The rest of the document is in good shape — §7 decisions are current, §9's progress log is detailed, and its totals (238 unit / 42 e2e / 17 QA) match reality exactly. §8's SQLite line at `:787` is a dated record of a 2026-09-18 run and reads correctly as history.

Impact:
Lower than the other two documents because §9 below it tells the true story, but §2 is the section a reader consults for "where are we", and it understates the project by four phases.

Suggested fix:
Add a "Status as of" date to the §2 heading and refresh the rows §9 has closed, or mark §2 as a 2026-09-18 baseline snapshot pointing at §9 for current state.

---

### [COMMENTS] — `notifications.ts` points at a file that does not exist and describes email fan-out that no longer matches `email.ts`
Severity: High
Location: /home/user/OceancOS/src/lib/notifications.ts:38-47, /home/user/OceancOS/src/lib/email.ts:1-11
Found by: docs-consistency

Description:
Two contradictions in eight lines.

`src/lib/notifications.ts:38` reads: `// Email fan-out is deliberately a no-op until SMTP is configured. See lib/notifications/email.ts.` There is no `lib/notifications/email.ts`; the module is `src/lib/email.ts`. The same phantom path is cited in `PROJECT_REVIEW_AND_BUILD_PLAN.md:48`, so the error has propagated.

More seriously, the comment and the guard beneath it contradict the design stated at `src/lib/email.ts:1-11`, which says the outbox transport is the default and exists precisely "so development, CI and the end-to-end tests exercise the same code path as production without a mail server." But `notifications.ts:39` gates the whole fan-out on `if (process.env.SMTP_HOST)`. With `SMTP_HOST` unset — the documented default — `sendEmailBatch()` is never reached, so the outbox path is *not* exercised for notifications. The two modules describe opposite behaviours and the guard wins.

The consequence: notification emails are dead in development and CI, while password-reset mail (which calls `sendEmail()` directly from `src/app/forgot/page.tsx:53`, bypassing `notify()`) does land in the outbox. That is why `e2e/passwordReset.spec.ts` can assert on outbox contents and no equivalent notification test exists.

Impact:
A maintainer reading `email.ts` believes every outbound message flows through one code path the tests cover; a maintainer reading `notifications.ts` believes email is an unfinished stub in a file they will not find. Neither can predict what an operator receives, and the gap — notification email untested in CI because the guard skips it — is invisible from either comment.

Suggested fix:
Fix the path to `./email`. Then reconcile: either drop the `SMTP_HOST` guard at `notifications.ts:39` so notifications use the same outbox transport as password resets and become testable, or amend the `email.ts` header to say the outbox covers direct `sendEmail()` callers only and `notify()` fan-out requires SMTP.

---

### [COMMENTS] — Storage comments claim uploads never pass through the server; with the default driver they always do
Severity: Medium
Location: /home/user/OceancOS/src/lib/storage/index.ts:11-12, /home/user/OceancOS/src/app/api/uploads/sign/route.ts:27-28
Found by: docs-consistency

Description:
`src/lib/storage/index.ts:11-12` states without qualification: "Uploads go straight from the browser to storage using a presigned PUT, so large drawings never pass through the Next.js server." `src/app/api/uploads/sign/route.ts:27-28` repeats it.

True for the `s3` driver. False for `local`, the default whenever `S3_BUCKET` is unset (`src/lib/storage/index.ts:37`) — i.e. in development, in CI, and in any production deploy that follows `.env.example` as shipped. On that path `signUpload()` returns a URL pointing at the app's own route (`src/lib/storage/index.ts:144`: `url: \`/api/uploads/local?${params}\``), and `PUT` on that route buffers the entire body into memory before writing (`src/app/api/uploads/local/route.ts:44`: `Buffer.from(await request.arrayBuffer())`). Every byte passes through the Next.js server, held whole in RAM, up to the 25 MiB ceiling in `src/lib/storage/keys.ts:26`.

Impact:
The comment is the reassurance a maintainer relies on when deciding not to worry about body-size limits, proxy timeouts or memory during an upload. Under the default driver that reassurance is wrong, and the failure mode it hides — a 25 MiB buffer per concurrent upload — appears exactly where the comment says it cannot.

Suggested fix:
Qualify both: "With the `s3` driver the browser PUTs straight to storage and bytes never reach this server. The `local` driver signs a URL back to `/api/uploads/local`, which does buffer the whole body — development and CI only."

---

### [COMMENTS] — `playwright.config.ts` comment describes CI behaviour that CI contradicts
Severity: Low
Location: /home/user/OceancOS/playwright.config.ts:9-13, /home/user/OceancOS/.github/workflows/ci.yml
Found by: docs-consistency

Description:
The comment says the provisioned binary is used when present, "otherwise let Playwright resolve its own, which is what happens in CI." CI does the opposite: the e2e job has a step named "Locate Chromium for the PDF renderer" that resolves `chromium.executablePath()` and writes `PLAYWRIGHT_CHROMIUM_PATH` into `$GITHUB_ENV`. Line 11 then reads that value, `existsSync` succeeds, and `executablePath` is set explicitly. Playwright never resolves its own binary in CI.

Impact:
Small, but it concerns the one environment a contributor cannot easily observe, and will mislead anyone debugging a browser-launch failure in CI. The variable is also doing double duty — CI sets it for the PDF renderer, the Playwright config quietly consumes it for the test browser — which nothing documents.

Suggested fix:
Rewrite to match: "CI sets `PLAYWRIGHT_CHROMIUM_PATH` explicitly (see the workflow's Chromium step, which the PDF renderer also needs), so this branch is taken there too. The fallback is for sandboxes with a pre-provisioned binary."

---

### [COMMENTS] — Two comparable secret comparisons, opposite comments, only one constant-time
Severity: Low
Location: /home/user/OceancOS/src/lib/storage/index.ts:119-121, /home/user/OceancOS/src/lib/jobs/acceptance.ts:34-40
Found by: docs-consistency

Description:
`verifyLocalUploadToken` compares the presented token with `===` and justifies it: "Lengths are fixed, so a plain comparison is adequate here." `verifyAcceptanceCode`, in a different file, does the same class of comparison on a value derived the same way (SHA-256 keyed on `SESSION_SECRET`) and uses `timingSafeEqual` with an explicit length check.

Fixed length is the precondition for `timingSafeEqual`, not an argument against needing it, so the stated reasoning does not support the conclusion — and the codebase's own other answer to the same question disagrees.

Impact:
Documentation-scope: a maintainer following the comment's reasoning will use `===` for the next token comparison they add, while the surrounding code sets the opposite precedent. The security merits belong to whoever audits `src/lib/storage/`; the defect here is a comment asserting a rule the codebase does not follow.

Suggested fix:
Use `timingSafeEqual` in both places and delete the justification, or state plainly why this one token does not warrant it.

---

### [DOCS] — No `CLAUDE.md`, no contributor guide, and no explanation of the domain a new maintainer must learn
Severity: Medium
Location: /home/user/OceancOS (repository root)
Found by: docs-consistency

Description:
There is no `CLAUDE.md`, `CONTRIBUTING.md`, `AGENTS.md` or `docs/` directory. `.agents/skills/` contains unrelated third-party skill packages (`gpt-taste`, `impeccable`, `web-design-guidelines`) and is not project documentation. The README is 43 lines of setup. Everything beyond `npm run dev` lives in code comments or in a 1,165-line planning document written for a different purpose.

Concretely undocumented:
- **What the roles mean.** 19 role keys and ~60 permission keys in `src/lib/rbac.ts` and `src/lib/enums.ts`, seeded by `prisma/seed.ts`. Nothing explains why a `CAPTAIN` may approve one change-order stage and not another, what `OWNERS_REP` is for, or that `YARD_PM`/`YARD_TRADE_LEAD` are the yard-side gate described in `BRIDGE_ALIGNMENT_PLAN.md` §3.1. The README's login table lists nine emails with role names and no explanation of what any of them can do.
- **How the workflows work.** Two independent state machines — `src/lib/workflow/changeOrder.ts` and `src/lib/jobs/workflow.ts` — each own their legal transitions, the permission each requires, and what the UI may offer. That single-source-of-truth pattern is the most important convention in the codebase and is described only inside `BRIDGE_ALIGNMENT_PLAN.md`.
- **How the PDF renderer works.** That `/print/*` pages are the PDF template, that `renderPdf()` launches Chromium and navigates back to the app with the user's session cookie (`src/lib/export/pdf.ts:50-62`), that this needs `APP_URL` behind a proxy, and that a missing browser degrades to 503.
- **How storage drivers are chosen** — see the Critical finding.
- **The job code scheme.** `src/lib/jobs/codes.ts` implements MB92-style `X.NNNN.NN` with per-project override and tens-gap numbering. Unexplained outside the planning document.
- **Conventions a contributor must follow**: `recordAudit()` on every mutation, `notify()` as the single notification entry point, Zod validators in `src/lib/validators.ts` shared between server actions and forms, `src/lib/enums.ts` as the single source of status enums.

Impact:
Onboarding requires reading a 1,165-line plan whose §2 is four phases stale and whose §4 is a proposal rather than a description. The conventions keeping the codebase coherent are enforced by nothing but habit, so the first contributor to miss one will not be told.

Suggested fix:
Add a `CLAUDE.md` covering: the module map (one line per `src/lib/` responsibility), the two state machines and the rule that transitions live in exactly one module, the RBAC model and what each seeded role represents, the storage driver rule, the PDF/print-route mechanism, the audit and notification conventions, the enum single-source rule, and the commands to run before pushing (`typecheck`, `test`, `build`). Link out to `BRIDGE_ALIGNMENT_PLAN.md` §4 for the data model rather than duplicating it.

---

### [README] — Quick-start credentials do not match what `.env.example` provides
Severity: Medium
Location: /home/user/OceancOS/README.md:9-11, /home/user/OceancOS/.env.example:3
Found by: docs-consistency

Description:
The Quick start runs `cp .env.example .env` then `createdb oceancos`. `.env.example:3` ships `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/oceancos?schema=public"` — the `postgres` superuser with password `postgres`. `createdb oceancos`, however, runs as the invoking OS user and creates a database owned by that user. On a stock Homebrew, Postgres.app or `apt` install the `postgres` role either has no password or uses peer authentication, so the next command (`npm run db:migrate`) fails with `P1000: Authentication failed`. The repository's own working `.env` uses a different password again (`postgres:oceancos@…`), evidence the shipped example did not work as-is for the author either.

The README's one line of guidance — "point `DATABASE_URL` at your database" on line 9 — is a comment inside the code block, easy to read past when the block then hands you a concrete command.

Impact:
The first failure a new contributor hits is an authentication error on step four of a five-step Quick start, with a `.env` that looks already filled in.

Suggested fix:
Either make the example match the command (`postgresql://localhost:5432/oceancos?schema=public`), or make the step explicit: "Edit `DATABASE_URL` in `.env` to match your PostgreSQL user before running the migration." A `docker run postgres` one-liner as an alternative would remove the ambiguity.

---

### [README] — Seeded-login table lists 9 of the 12 seeded users
Severity: Low
Location: /home/user/OceancOS/README.md:29-41, /home/user/OceancOS/prisma/seed.ts:116-129
Found by: docs-consistency

Description:
`prisma/seed.ts:116-129` creates twelve users; the README table lists nine. Missing: `tech@oceancos.dev` (`TECH_MANAGER`), `class@oceancos.dev` (`CLASS_SURVEYOR`), `flag@oceancos.dev` (`FLAG_SURVEYOR`). The nine listed are accurate — emails, roles and the shared password `password` (`prisma/seed.ts:115`) all match.

The three omitted accounts are not decorative: `CO_APPROVE_TECH`, `CO_APPROVE_CLASS` and `CO_APPROVE_FLAG` are distinct change-order approval stages in `src/lib/rbac.ts`, so these are the only logins that can exercise those stages.

Impact:
Anyone manually testing the change-order approval chain — which `QA_TEST_REPORT.md:45-47` asks them to do — cannot complete it, because the logins for three of the stages are undocumented. They will conclude the stages are unreachable rather than that the table is short.

Suggested fix:
Add the three rows.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 7 |
| Medium | 9 |
| Low | 5 |
| Cosmetic | 0 |
| **Total** | **22** |

**Cross-cutting observation.** Every High and Critical finding shares one shape: a default that is safe in development and wrong in production, with nothing that says so. Local storage, the `"dev-secret"` fallback, `APP_URL` defaulting to localhost, and the outbox mail transport all let a misconfigured deployment look completely healthy. The repository has no deployment document, so there is no single place where that pattern would have been caught.

**On the three planning documents.** `BRIDGE_ALIGNMENT_PLAN.md` is genuinely well maintained — its §9 progress log matches the code and its test totals are exact. The problem is that `README.md:43` points new readers at the two documents that are *not* maintained, and nominates the staler of the two as the architecture reference. Repointing that one line would do more for a new maintainer than rewriting either document.
