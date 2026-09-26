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
| `npm run vessels:import` | Load the vessel register workbook (see below) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | Drop, re-migrate and re-seed |

Open http://localhost:3000.

### Vessel register

Every vessel shows the same particulars — identity and registry, dimensions and tonnage, design,
machinery, accommodation, class — laid out by the field catalogue in
`src/lib/vessels/fields.ts`. A field with no value renders as a "Not recorded" placeholder, so gaps
are visible and every vessel reads alike. The active project's vessel is at `/vessel`; every vessel
is in the fleet register at `/vessels`.

The Oceanco Y700 register (22 vessels, Y701–Y726; edition 1.1, audited) is committed at
`prisma/data/Oceanco_Y700_Vessel_Register_2026-09-25_v1.1.xlsx` and loaded by the seed. Each vessel
gets a project coded by its yard number. To load it — or a newer edition — into a deployed database:

```bash
npm run vessels:import                              # the committed workbook
npm run vessels:import -- path/to/newer.xlsx        # a newer edition
npm run vessels:import -- path/to/newer.xlsx --overwrite
```

Vessels are matched by IMO. Without `--overwrite` the import only fills blank fields, so values
entered in the application are never replaced. Sourced observations and data gaps are only ever
added, and a gap's status set in the application survives a re-import. Figures are public-source
and not certificate-verified until a vessel is marked otherwise.

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
