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

Open http://localhost:3000. Seeded logins:

| Email                       | Password   | Role            |
|-----------------------------|------------|-----------------|
| owner@oceancos.dev          | password   | Owner           |
| rep@oceancos.dev            | password   | Owner's Rep     |
| pm@oceancos.dev             | password   | Project Manager |
| captain@oceancos.dev        | password   | Captain         |
| eng@oceancos.dev            | password   | Chief Engineer  |
| crew@oceancos.dev           | password   | Crew            |
| yard@oceancos.dev           | password   | Yard PM         |
| finance@oceancos.dev        | password   | Finance         |
| contractor@oceancos.dev     | password   | Contractor      |

See `PROJECT_REVIEW_AND_BUILD_PLAN.md` for architecture and `QA_TEST_REPORT.md` for QA.
