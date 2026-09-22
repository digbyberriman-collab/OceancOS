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

**Required in production** (`NODE_ENV=production`), with no inferred fallback — the app throws at
startup rather than silently defaulting:

- `DATABASE_URL` — include `connection_limit` and `pool_timeout` explicitly (see the comment in
  `.env.example`); Prisma's per-process default multiplies badly once more than one instance runs
  against the same database. Put a pooler (PgBouncer, or the provider's own) in front and add
  `&pgbouncer=true` if you're scaling past a handful of instances or running serverless.
- `SESSION_SECRET` — a long random string.
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

## Seeded accounts

`npm run db:seed` creates thirteen accounts, one per commonly-used role, all sharing the same
password. In development and test that password is `password`; it is a fixture, and the e2e suite
depends on it. **It is never shown in the application** — the sign-in page has no credential hint,
in any environment.

| Email | Role | | Email | Role |
|---|---|---|---|---|
| `owner@oceancos.dev` | Owner | | `yard@oceancos.dev` | Yard PM |
| `rep@oceancos.dev` | Owner's Rep | | `finance@oceancos.dev` | Finance |
| `pm@oceancos.dev` | Project Manager | | `tech@oceancos.dev` | Technical Manager |
| `captain@oceancos.dev` | Captain | | `class@oceancos.dev` | Class Surveyor |
| `eng@oceancos.dev` | Chief Engineer | | `flag@oceancos.dev` | Flag Surveyor |
| `crew@oceancos.dev` | Crew | | `contractor@oceancos.dev` | Contractor |

Plus `scoped@oceancos.dev`, a Project Manager scoped to only one of the two seeded projects
(every account above reaches both) — used by `e2e/tenancy.spec.ts` to prove one project's data
never leaks into another's.

Seven of the nineteen roles — Chief Officer, Purser, HOD, Yard Trade Lead, Supplier, Auditor and
Guest — have no seeded account and have therefore never been walked through the application.

## Further documentation

- `BRIDGE_ALIGNMENT_PLAN.md` — the product and architecture reference: what OceancOS's refit-project
  surface is aligned against, the open design decisions, and the progress log.
- `SITE_MAP.md` — every route, who can reach it, and what it does.
- `AUDIT_REPORT.md` / `ACTION_PLAN.md` — the point-in-time platform audit this codebase was brought
  up from, and the sequenced remediation plan executed against it. A development record, not living
  documentation — check the current code and the two files above for how the app actually behaves
  today.
