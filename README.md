# OceancOS

Operational command centre for superyacht refit, new build and conversion projects.

## Quick start

Requires PostgreSQL 14 or newer.

```bash
cp .env.example .env          # point DATABASE_URL at your database
createdb oceancos
npm install
npm run db:migrate            # applies prisma/migrations
npm run db:seed
npm run dev
```

Other commands:

| Command | Does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) |
| `npm run qa` | Database integrity checks against the seed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | Drop, re-migrate and re-seed |

Open http://localhost:3000.

### Seeded accounts

`npm run seed` creates twelve accounts, one per role, all sharing the same password. In
development and test that password is `password`; it is a fixture, and the e2e suite depends on
it. **It is never shown in the application** — the sign-in page has no credential hint, in any
environment.

| Email | Role | | Email | Role |
|---|---|---|---|---|
| `owner@oceancos.dev` | Owner | | `yard@oceancos.dev` | Yard PM |
| `rep@oceancos.dev` | Owner's Rep | | `finance@oceancos.dev` | Finance |
| `pm@oceancos.dev` | Project Manager | | `tech@oceancos.dev` | Technical Manager |
| `captain@oceancos.dev` | Captain | | `class@oceancos.dev` | Class Surveyor |
| `eng@oceancos.dev` | Chief Engineer | | `flag@oceancos.dev` | Flag Surveyor |
| `crew@oceancos.dev` | Crew | | `contractor@oceancos.dev` | Contractor |

Seven of the nineteen roles — Chief Officer, Purser, HOD, Yard Trade Lead, Supplier, Auditor and
Guest — have no seeded account and have therefore never been walked through the application.

To seed a deployed database, set `SEED_PASSWORD`. With `NODE_ENV=production` and no
`SEED_PASSWORD`, the seed refuses to run rather than create accounts whose password is written
down in this repository.

See `PROJECT_REVIEW_AND_BUILD_PLAN.md` for architecture and `QA_TEST_REPORT.md` for QA.
