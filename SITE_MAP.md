# OceancOS — Site map

Ground truth as of 2026-09-21, built in Phase 1 of the platform audit. Read-only inventory: no
judgements here, only what exists. Findings live in `AUDIT_REPORT.md`.

## Platform configuration

| | |
|---|---|
| **Platform** | OceancOS — operational command centre for superyacht refit, new build and conversion |
| **Repo** | `digbyberriman-collab/OceancOS`, branch `claude/charming-bell-36iht1` |
| **Stack** | Next.js 14.2.35 (App Router), TypeScript, Prisma 5.22, PostgreSQL 16, Tailwind 3.4 |
| **Auth** | First-party cookie session, bcrypt password hashes, no third-party identity provider |
| **Design system** | Dark-mode-first. Tokens `ink` / `line` / `accent` / `marine` / `ok` / `warn` / `bad` / `muted` / `faint` in `tailwind.config.ts`; component classes in `src/app/globals.css` |
| **Size** | 14,285 lines of TypeScript across `src/`, 33 pages, 6 API routes, 46 Prisma models, 33 components |
| **Tests** | 238 unit (Vitest), 42 end-to-end (Playwright), 17 database QA checks |

### Known pain points carried into this audit

- Most modules outside Jobs, Change Orders, Crew Requests and Approvals are **list-only scaffolds**
  from the original build: no detail page, no create form, no server actions.
- `admin.users`, `admin.roles` and `admin.settings` permissions exist but are **granted to no role**.
- The spreadsheet import of a yard's quote pack is specified but not built.
- The email path is exercised only through a file outbox, never a real SMTP server.

### Out of scope this pass

- Phases 3–11 of `BRIDGE_ALIGNMENT_PLAN.md` (Inbox, Yard Home, After Sales, yard invoicing, minutes,
  locations, planning). Absent features from that plan are **not** audit findings; incomplete or
  misleading *implementations* are.

---

## Routes

### Public

| Route | File | Notes |
|---|---|---|
| `/` | `src/app/page.tsx` | Marketing landing page |
| `/login` | `src/app/login/page.tsx` | Sign-in; inline server action |
| `/forgot` | `src/app/forgot/page.tsx` | Password-reset request |
| `/reset/[token]` | `src/app/reset/[token]/page.tsx` | Password-reset completion |

### Authenticated (`(app)` group — layout enforces `requireUser()`)

| Route | Detail page | Create form | Server actions | State |
|---|---|---|---|---|
| `/dashboard` | — | — | — | Built |
| `/jobs` | ✅ `[id]` | ✅ `new` | ✅ `actions.ts` | Built |
| `/jobs/[id]/quote` | — | — | via `jobs/actions.ts` | Built (yard) |
| `/jobs/[id]/accept` | — | — | ✅ `accept/actions.ts` | Built (client) |
| `/change-orders` | ✅ `[id]` | ✅ `new` | ✅ `actions.ts` | Built |
| `/crew-requests` | ✅ `[id]` | ✅ `new` | ✅ `actions.ts` | Built |
| `/approvals` | — | — | reuses CO actions | Built |
| `/notifications` | — | — | inline | Built |
| `/admin` | — | — | — | Read-only lists |
| `/admin/projects` | — | — | ✅ `actions.ts` | Built |
| `/search` | — | — | — | Built |
| `/schedule` | ❌ | ❌ | ❌ | **List only** |
| `/financials` | ❌ | ❌ | ❌ | **List only** |
| `/logistics` | ❌ | ❌ | ❌ | **List only** |
| `/inventory` | ❌ | ❌ | ❌ | **List only** |
| `/drawings` | ❌ | ❌ | ❌ | **List only** |
| `/documents` | ❌ | ❌ | ❌ | **List only** |
| `/meetings` | ❌ | ❌ | ❌ | **List only** |
| `/risks` | ❌ | ❌ | ❌ | **List only** |
| `/contractors` | ❌ | ❌ | ❌ | **List only** |
| `/suppliers` | ❌ | ❌ | ❌ | **List only** |

Ten of the twenty authenticated modules are list-only. Each appears in the sidebar as a peer of the
working modules.

### Print views (rendered to PDF by the export routes)

| Route | Purpose |
|---|---|
| `/print/change-orders/[id]` | Change order as a printable document |
| `/print/jobs/[id]` | Quote as a printable document |

### API routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/uploads/sign` | POST | Session + project access + type/size | Presign an upload |
| `/api/uploads/local` | PUT, GET | Session + signed token (PUT) | Local-disk storage driver |
| `/api/export/change-orders` | GET | Session + `change_order.view` | Change orders as XLSX or CSV |
| `/api/export/change-orders/[id]` | GET | Session + `change_order.view` | One change order as PDF |
| `/api/export/jobs` | GET | Session + `job.view` | Worklist as XLSX or CSV |
| `/api/export/jobs/[id]` | GET | Session + `job.view` | One quote as PDF |

### Server action modules

`src/app/(app)/_actions.ts` · `admin/projects/actions.ts` · `change-orders/actions.ts` ·
`crew-requests/actions.ts` · `jobs/actions.ts` · `jobs/[id]/accept/actions.ts`, plus inline actions in
`login/page.tsx`, `forgot/page.tsx`, `reset/[token]/page.tsx`, `notifications/page.tsx`, and the two
detail pages.

---

## Data model

46 Prisma models, 4 migrations, PostgreSQL.

**Identity and access** — `User`, `Session`, `Role`, `Permission`, `RolePermission`, `UserRole`,
`PasswordReset`

**Organisation** — `Vessel`, `Project`, `Department`, `VesselArea`

**Jobs and quotes (Phase 1)** — `JobSection`, `Job`, `JobLine`, `JobNote`, `JobVariation`,
`JobHistory`, `JobFavourite`, `AcceptanceChallenge`

**Change orders** — `ChangeOrder`, `ChangeOrderApproval`, `ChangeOrderHistory`

**Crew requests** — `CrewRequest`

**Cross-cutting** — `Approval`, `Comment`, `Attachment`, `Notification`, `AuditLog`, `Setting`

**Scaffolded, backing list-only modules** — `BudgetCategory`, `CostCode`, `Budget`, `Supplier`,
`PurchaseOrder`, `Invoice`, `ScheduleTask`, `Milestone`, `LogisticsItem`, `InventoryItem`, `Drawing`,
`DrawingRevision`, `Document`, `Contractor`, `Meeting`, `MeetingAction`, `Risk`

---

## Roles and permissions

19 roles, 56 permission keys, matrix in `src/lib/rbac.ts`.

**Vessel and owner side** — `OWNER`, `OWNERS_REP`, `PROJECT_MANAGER`, `CAPTAIN`, `CHIEF_OFFICER`,
`CHIEF_ENGINEER`, `PURSER`, `HOD`, `CREW`

**Yard side** — `YARD_PM`, `YARD_TRADE_LEAD`

**External** — `CONTRACTOR`, `SUPPLIER`, `CLASS_SURVEYOR`, `FLAG_SURVEYOR`, `AUDITOR`, `GUEST`

**Functional** — `FINANCE`, `TECH_MANAGER`

Seeded accounts cover 12 of the 19 roles. `CHIEF_OFFICER`, `PURSER`, `HOD`, `YARD_TRADE_LEAD`,
`SUPPLIER`, `AUDITOR` and `GUEST` have **no seeded account**, so no role-based walkthrough has ever
exercised them.

---

## Environment variables

Documented in `.env.example`: `DATABASE_URL`, `SESSION_SECRET`, `STORAGE_DRIVER`, `UPLOAD_DIR`,
`MAX_UPLOAD_BYTES`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`, `PLAYWRIGHT_CHROMIUM_PATH`, `PDF_CHROME_CHANNEL`,
`APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Referenced in code: the above plus `MAIL_OUTBOX_DIR` and `NODE_ENV`.

**`MAIL_OUTBOX_DIR` is used but undocumented.**

---

## Dependencies

**Runtime** — `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@prisma/client`, `bcryptjs`,
`clsx`, `exceljs`, `lucide-react`, `next`, `nodemailer`, `playwright-core`, `react`, `react-dom`,
`zod`

**Development** — `@playwright/test`, `@types/*`, `autoprefixer`, `postcss`, `prisma`, `tailwindcss`,
`tsx`, `typescript`, `vitest`

---

## Test coverage by area

| Area | Unit | End-to-end |
|---|---|---|
| Job codes, workflow, acceptance | 78 | 11 |
| Change-order workflow | 18 | — |
| RBAC matrix | 15 | 2 |
| Charts | 33 | 2 |
| Exports | 20 | 5 |
| Password reset | 19 | 6 |
| Project dates | 21 | 5 |
| Storage keys | 18 | 5 |
| Project metrics | 16 | — |
| **Untested** | Schedule, financials, logistics, inventory, drawings, documents, meetings, risks, contractors, suppliers, approvals, notifications, search, admin, crew requests | |
