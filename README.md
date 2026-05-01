# OceancOS

Operational command centre for superyacht refit, new build and conversion projects.

## Quick start

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

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
