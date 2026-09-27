# OceancOS

Operational command centre for superyacht refit, new build and conversion projects: change
orders, multi-stage approvals, crew requests, budgets, schedules, drawings and documents — one
project-scoped surface with a full audit trail.

## Requirements

- Node.js 20
- PostgreSQL 14 or newer, with a role that can `CREATE EXTENSION` on the target database (one
  migration enables `pg_trgm` for search)

## Quick start (development)

```bash
git clone <this repo>
cd OceancOS
npm install
cp .env.example .env          # defaults work as-is once DATABASE_URL points at a real database
createdb oceancos
npm run db:migrate            # applies prisma/migrations, generates the Prisma client
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in with any account from [Seeded accounts](#seeded-accounts)
below.

`npm run db:reset` does the above three database steps in one shot (drop, re-migrate, re-seed) —
the fast path when the schema or seed changes under you.

## npm scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` then `next build` — required before `npm start` or `test:e2e` |
| `npm start` | Serve the production build (`next start`) |
| `npm run lint` | ESLint (`next lint`) |
| `npm run format` | Format the repo with Prettier |
| `npm run format:check` | Check formatting without writing (what CI would fail on) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Push `schema.prisma` straight to the database, no migration file (prototyping only) |
| `npm run db:migrate` | Create/apply a migration in development (`prisma migrate dev`) |
| `npm run db:deploy` | Apply pending migrations non-interactively (`prisma migrate deploy`) — what production and CI use |
| `npm run db:seed` | Run `prisma/seed.ts` |
| `npm run db:reset` | Drop the database, re-migrate, re-seed (`prisma migrate reset --force`) |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:e2e` | Browser tests (Playwright) — see [End-to-end tests](#end-to-end-tests) |
| `npm run qa` | Read-only database integrity checks against the seed |
| `npm run vessels:import` | Load the vessel register workbook — see [Vessel register](#vessel-register) |
| `npm run yardperiods:import` | Load the yard-period register: each vessel's history — see [Yard history](#yard-history) |
| `npm run demo:consolidate` | Move a database seeded before September 2026 onto the current demo workspace — see [Demo workspace](#demo-workspace) |

## End-to-end tests

Playwright's `webServer` runs the **production** build (`npm start`), not the dev server, so the
app has to be built first. From a clean clone, with a database already migrated:

```bash
npx playwright install --with-deps chromium   # once, downloads the browser
npm run build
npm run db:reset                              # or db:migrate + db:seed if you want to keep data
STORAGE_DRIVER=local npm run test:e2e
```

`STORAGE_DRIVER` is required because `next start` sets `NODE_ENV=production`, and the app refuses
to infer a storage driver in production (see [Deployment](#deployment)). `.env` already sets it for
local use; export it explicitly if your shell doesn't load `.env` into the Playwright process.

Playwright reuses an already-running server on `http://127.0.0.1:3210` if one is up (handy while
iterating on a single spec); in CI it always starts a fresh one. Override the port with `E2E_PORT`
if `3210` is taken.

## Deployment

There's no hosting-specific config here (no Dockerfile, no platform manifest) — this section covers
what the app itself needs to be told, regardless of where it runs.

**Required in production** (`NODE_ENV=production`). `STORAGE_DRIVER` and `SEED_PASSWORD` throw at
startup / refuse to run rather than silently defaulting; the others don't have that guard yet and
should still be set deliberately:

- `DATABASE_URL` — include `connection_limit` and `pool_timeout` explicitly (see the comment in
  `.env.example`); Prisma's per-process default multiplies badly once more than one instance runs
  against the same database. Put a pooler (PgBouncer, or the provider's own) in front and add
  `&pgbouncer=true` if you're scaling past a handful of instances or running serverless.
- `SESSION_SECRET` — a long random string. **No fail-fast guard**: if unset, the app silently falls
  back to a hard-coded development literal instead of refusing to start. Always set this explicitly
  in production.
- `STORAGE_DRIVER` — `s3` or `local`. `local` writes to `UPLOAD_DIR` on the container's own disk,
  which is ephemeral on most platforms; use `s3` (any S3-compatible service — Cloudflare R2 is the
  default target) for anything that isn't a single persistent-disk VM. See `.env.example` for the
  `S3_*` variables `s3` needs.
- `SEED_PASSWORD` — only if you intend to run `db:seed` against this environment at all. With no
  `SEED_PASSWORD` set, seeding refuses to run in production rather than create accounts whose
  password (`password`) is written down in this repository.

**Migrations**: run `npm run db:deploy` (`prisma migrate deploy`), not `db:migrate` — it applies
pending migrations non-interactively and never generates a new one.

**Optional**:

- `APP_URL` — the app's own externally-reachable base URL. Required if the app sits behind a proxy
  and PDF export is in use (the PDF renderer navigates back to the app over HTTP to print a page).
- `PLAYWRIGHT_CHROMIUM_PATH` / `PDF_CHROME_CHANNEL` — PDF export prints the real page in headless
  Chromium, so the server needs a browser available. Point at a binary or name an installed channel;
  with neither set, PDF export reports itself unavailable (503) rather than failing at request time.
- `SMTP_HOST` and friends — outbound notification email. With no `SMTP_HOST`, email is written as
  JSON files to `MAIL_OUTBOX_DIR` instead of sent; fine for a demo environment, not for real use.

See `.env.example` for the complete list with defaults and further comments.

## Vessel register

Every vessel shows the same particulars — identity and registry, dimensions and tonnage, design,
machinery, accommodation, class — laid out by the field catalogue in
`src/lib/vessels/fields.ts`. A field with no value renders as a "Not recorded" placeholder, so gaps
are visible and every vessel reads alike. The active project's vessel is at `/vessel`; every vessel
is in the fleet register at `/vessels`.

The Oceanco Y700 register (22 vessels, Y701–Y726) is committed at
`prisma/data/Oceanco_Y700_Vessel_Register_2026-09-25.xlsx` and loaded by the seed. Each vessel gets a
project coded by its yard number. To load it — or a newer edition — into a deployed database:

```bash
npm run vessels:import                              # the committed workbook
npm run vessels:import -- path/to/newer.xlsx        # a newer edition
npm run vessels:import -- path/to/newer.xlsx --overwrite
```

Vessels are matched by IMO. Without `--overwrite` the import only fills blank fields, so values
entered in the application are never replaced. Sourced observations and data gaps are only ever
added, and a gap's status set in the application survives a re-import. Figures are public-source
and not certificate-verified until a vessel is marked otherwise.

## Yard history

What has been done to each vessel since delivery — refits, rebuilds, repairs, surveys and significant
yard stays — shown on every vessel page (`/vessels/[id]`, "Yard history"), in the fleet-wide register
at `/projects`, and period by period at `/projects/[id]`.

Each historical period is a `Project` with status `COMPLETED` and a `YardPeriodRecord` beside it holding
what the source published: the period type, the dates, the yard and place, the name the vessel went by
then, the scope, contractors, cost, confidence and notes. Its scope is broken into lines by discipline
(`ProjectScopeItem`), and `YardPeriodEvidence` keeps the sources behind it, where sources disagree, and
the claims the register considered and left out. A completed project is a record: no change order,
crew request or quote can be raised against it, and the dashboard shows no clock for it.

The Oceanco Y7xx Refit & Historical Yard-Period Register (research cutoff 26 September 2026) is committed
at `prisma/data/Oceanco_Y7xx_Refit_Yard_Period_Register_2026-09-26.xlsx`, with its narrative report
beside it, and loaded by the seed after the vessel register. To load it — or a newer edition — into a
deployed database:

```bash
npm run yardperiods:import                              # the committed workbook
npm run yardperiods:import -- path/to/newer.xlsx        # a newer edition
npm run yardperiods:import -- --check                   # what would change; exits 1 if anything would
npm run yardperiods:import -- path/to/newer.xlsx --overwrite
```

The rules the import holds to:

- **Vessels are matched by yard number only.** Names collide across hulls — Man of Steel (Y706) was
  Seven Seas, and Y720 is Seven Seas; Samsara (Y710) was Infinity, and Y719 is Infinity; SHODAN (Y716)
  was DreAMBoat, and Y726 is DreAMBoat. A period whose vessel is not in the database stops the import.
- **Dates stay at the precision published.** "2012-Q2", "2017-Spring", "2023-06 approx." and "Date
  unverified" are stored and shown as labels; the days they cover are used only to order and filter.
  The six exact yard-period dates that drive the timing cards are never set from a label.
- **A yard is named only where the source names one.** "Unverified" and "Unspecified USA yard" are kept
  on the record as published and shown as "Yard not identified in public sources".
- **Cost bands are planning estimates, never spend.** Every period's reported cost is "Undisclosed";
  the indicative band ("€30m–€70m+") is stored with its basis, shown only to roles with financial
  access and always labelled as a planning estimate, and never touches a budget or a total.
- **Scope is classified by hand.** The workbook's Detailed Scope sheet splits clauses by keyword and
  misfiles and drops some (KAOS's "Largest Lürssen refit at the time" under Electrical/AV-IT; Draak's
  helideck removal missing), so `src/lib/yardPeriods/scope.ts` classifies each period's published Scope
  clause by clause, and a test holds every clause to exactly one entry.
- **45 rows make 44 periods.** Proyacht's 1,420 hours on Draak are listed as a row of their own but
  were worked inside the 2023–26 rebuild, so they are recorded as part of it
  (`src/lib/yardPeriods/merges.ts`, which also says which period each conflict and gap is about).
- **Nothing is taken away or overwritten by a re-import.** A period is found again by its import key;
  without `--overwrite` a record only has blanks filled; scope lines, evidence, gaps and observations
  are only ever added. A scope line removed in the application is hidden, not deleted, so it does not
  come back.
- **The vessel's latest refit becomes evidence.** It is recorded beside "Latest refit / rebuild" and
  fills that particular only where it is blank, so a disagreement with the vessel register shows as a
  second value rather than replacing the first.

Five vessels have no period in the register (SHODAN, Seven Seas, Koru, Leviathan, DreAMBoat); their
history says so as an evidence gap, not as proof that no work was done. Periods the register does not
have — from maintenance logs, class survey history or yard invoices — are added from the vessel page
("Add a yard period") by a role with `project.edit` that covers the whole vessel, and any period can be
corrected at `/projects/[id]/edit`.

## Demo workspace

The seed ships a worked example — a yard period with quotes, change orders, crew requests, budgets,
milestones, risks, inventory and areas — so every screen has something to show. It is fictional, and
it is parked on **Draak (Y709)**: two projects, `DEMO-01` (in progress, July 2026 to February 2027) and
`DEMO-02` (booked for 2027), both marked `isDemo`, dated after Draak's real rebuild.

- While a demo project is active, a banner says so, and every list and total covers only the demo
  workspace (`projectScope()` in `src/lib/project.ts`). While a real project is active, no demo record
  appears in a list or adds to a total. Opening a demo record by link still works, and it is badged.
- Demo projects are grouped apart in the switcher, badged wherever they are named, watermarked on PDFs
  and stamped `DEMO — fictional` on every row of a spreadsheet export.
- A role scoped to a vessel never reaches the demo projects parked on it.
- The fleet register, vessel pages and `/projects` always show the real vessels and their history.

Until September 2026 the demo sat on two invented vessels, M/Y Solstice and M/Y Northern Light. On a
database seeded before then, `npm run demo:consolidate` moves it onto Draak, shifts the dates the seed
derived from the old arrival (only those — anything a person did keeps its real timestamp), and deletes
the invented vessels. It refuses if either holds a real project or a role scoped to it, since deleting a
vessel would turn a vessel-scoped role into one that reaches every project. `-- --check` reports what
would change. A fresh seed needs none of this.

## Seeded accounts

`npm run db:seed` creates one account per role — all nineteen — sharing the same password. In
development and test that password is `password`; it is a fixture, and the e2e suite depends on it.
**It is never shown in the application** — the sign-in page has no credential hint, in any
environment.

| Email | Role | | Email | Role |
|---|---|---|---|---|
| `owner@oceancos.dev` | Owner | | `tradelead@oceancos.dev` | Yard Trade Lead |
| `rep@oceancos.dev` | Owner's Rep | | `contractor@oceancos.dev` | Contractor |
| `pm@oceancos.dev` | Project Manager | | `supplier@oceancos.dev` | Supplier |
| `captain@oceancos.dev` | Captain | | `finance@oceancos.dev` | Finance |
| `officer@oceancos.dev` | Chief Officer | | `tech@oceancos.dev` | Technical Manager |
| `eng@oceancos.dev` | Chief Engineer | | `class@oceancos.dev` | Class Surveyor |
| `purser@oceancos.dev` | Purser | | `flag@oceancos.dev` | Flag Surveyor |
| `hod@oceancos.dev` | HOD | | `auditor@oceancos.dev` | Auditor |
| `crew@oceancos.dev` | Crew | | `guest@oceancos.dev` | Guest |
| `yard@oceancos.dev` | Yard PM | | | |

Plus `scoped@oceancos.dev`, a Project Manager scoped to only one of the two demo projects, `DEMO-01`
(every account above reaches every project) — used by `e2e/tenancy.spec.ts` to prove one project's
data never leaks into another's.

## Further documentation

- `BRIDGE_ALIGNMENT_PLAN.md` — the product and architecture reference: what OceancOS's refit-project
  surface is aligned against, the open design decisions, and the progress log.
- `SITE_MAP.md` — every route, who can reach it, and what it does. A point-in-time snapshot, not
  living documentation — check the current code (`src/app`, `src/lib/rbac.ts`) for how routing and
  permissions actually behave today.
- `AUDIT_REPORT.md` / `ACTION_PLAN.md` — the point-in-time platform audit this codebase was brought
  up from, and the sequenced remediation plan executed against it. A development record, not living
  documentation — check the current code and the two files above for how the app actually behaves
  today.
