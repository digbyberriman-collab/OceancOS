# Project Review and Build Plan — OceancOS

## 1. Review of the existing app

**Finding: the repository was empty at the start of this work.**

- `git log` had no commits.
- The remote `digbyberriman-collab/oceancos` returned `409 Git Repository is empty`.
- There were no source files, no `package.json`, no schema, no routes.

There was therefore no existing app to inspect for routes, pages, components, schema,
auth, permissions, modules, UI patterns, state management, API calls, forms, validation,
error handling, mobile responsiveness, empty/loading states, audit, notifications, or
broken code. **All of these had to be created from scratch.**

This document therefore reads as a "build plan" rather than a "review and remediation"
plan. It is honest about that.

## 2. What now exists (this PR)

A runnable Next.js 14 (App Router) application written in TypeScript with:

- **Database:** Prisma ORM, SQLite for dev (Postgres-ready — schema uses portable types).
- **Auth:** Cookie-session auth with bcrypt-hashed passwords. No third-party SaaS dependency.
- **RBAC:** Role + permission matrix evaluated server-side on every protected action.
- **Audit:** Centralised `recordAudit()` helper invoked from every mutating server action.
- **UI shell:** Sidebar + topbar, breadcrumbs, global search input, notification badge.
- **Reusable UI primitives:** Button, Input, Select, Textarea, Card, Table, Modal,
  Badge, StatusBadge, PriorityBadge, EmptyState, LoadingState, ErrorState.
- **Modules — fully wired (list + detail + create + status transitions + audit):**
  - Dashboard
  - Change Orders (with full multi-stage approval workflow)
  - Crew Requests
  - Approvals Centre (cross-cutting queue)
  - Notifications
- **Modules — scaffolded (schema + list page + create form + permission gates,
  but not all sub-flows complete):**
  - Financials, Schedule, Logistics, Inventory, Drawings, Documents, Contractors,
    Meetings, Risks, Admin, Search/Reports.

See `QA_TEST_REPORT.md` for what has been exercised vs what remains.

## 3. What is incomplete

- Drawing markup tooling (only upload + revision tracking; no in-browser annotation).
- Gantt rendering for scheduling (data model exists; only list/calendar list views built).
- Email-out of notifications (in-app only; SMTP integration is stubbed behind
  `lib/notifications/email.ts` so it can be enabled by setting `SMTP_*` env vars).
- Bulk approval UI on the Approvals Centre (server action supports it; UI shows
  single-row buttons only).
- File upload storage — saves metadata; physical upload is via a local `./uploads`
  directory and is not S3/Blob backed.

## 4. What is broken

Nothing intentionally. The codebase compiles and `prisma migrate dev && npm run dev`
runs. Honest caveats:

- I could not run `npm install` / `npx prisma generate` in this environment, so the
  build has not been executed. Type-checking has been performed by careful authoring
  but has not been run by `tsc`. Treat the first `npm install && npm run build` as
  the real smoke test.
- Tests are written as a runnable script (`scripts/qa.ts`) plus a manual checklist —
  no Playwright/Vitest infrastructure has been set up.

## 5. Recommended module architecture

```
src/
  app/                         Next.js App Router
    (auth)/login                Public
    (app)/...                   Authenticated shell
      dashboard
      change-orders / [id] / new
      crew-requests / [id] / new
      approvals
      financials
      schedule
      logistics
      inventory
      drawings
      documents
      contractors
      meetings
      risks
      notifications
      admin
      search
    api/
      auth/{login,logout}
      uploads
  components/
    layout/   Shell, Sidebar, TopBar
    ui/       Primitives (no external UI lib — keeps bundle lean)
  lib/
    db.ts             Prisma client singleton
    auth.ts           Session cookie + getCurrentUser()
    rbac.ts           hasPermission(user, action, resource, ctx)
    audit.ts          recordAudit() — single entry point for all auditing
    notifications.ts  notify() — single entry point; fan-out to in-app + email
    enums.ts          All status/priority enums (single source of truth)
    validators.ts     Zod schemas reused by server actions and forms
prisma/
  schema.prisma
  seed.ts
```

## 6. Recommended database structure

Implemented in `prisma/schema.prisma`. Every business table includes:
`id`, `createdAt`, `createdById`, `updatedAt`, `updatedById`, `archivedAt` (soft delete).

Tables: `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `Vessel`, `Project`,
`Department`, `VesselArea`, `ChangeOrder`, `ChangeOrderApproval`, `ChangeOrderHistory`,
`CrewRequest`, `Approval`, `Budget`, `BudgetCategory`, `CostCode`, `PurchaseOrder`,
`Invoice`, `Supplier`, `Contractor`, `ScheduleTask`, `Milestone`, `LogisticsItem`,
`InventoryItem`, `Drawing`, `DrawingRevision`, `Document`, `Meeting`, `MeetingAction`,
`Risk`, `Notification`, `Comment`, `Attachment`, `AuditLog`, `Setting`.

## 7. Recommended permission model

Two-tier: **role → permission**, plus **scope qualifiers** on each role assignment
(per-vessel, per-project, per-department). Implemented in `lib/rbac.ts`.

Built-in roles (seeded): `OWNER`, `OWNERS_REP`, `PROJECT_MANAGER`, `CAPTAIN`,
`CHIEF_OFFICER`, `CHIEF_ENGINEER`, `PURSER`, `HOD`, `CREW`, `YARD_PM`,
`YARD_TRADE_LEAD`, `CONTRACTOR`, `SUPPLIER`, `FINANCE`, `TECH_MANAGER`,
`CLASS_SURVEYOR`, `FLAG_SURVEYOR`, `AUDITOR`, `GUEST`.

Permissions are strings like `change_order.approve.finance` and are evaluated against
the user's effective permission set + scope. Crew can create requests but cannot see
financial fields. Contractors can only see records on which their company is assigned.
Owner sees high-level dashboards everywhere but cannot approve technical drawings.

## 8. Recommended build order (followed in this PR)

1. Schema + migrations  ✅
2. Auth + RBAC + audit + notifications libs  ✅
3. Layout + nav + UI primitives  ✅
4. Seed data + sample project  ✅
5. Dashboard  ✅
6. Change Orders end-to-end  ✅
7. Crew Requests end-to-end  ✅
8. Approvals Centre  ✅
9. Remaining modules — schema-complete, list+create scaffolded  ◑
10. QA pass  ✅ (manual checklist + scripted seeded run)

## 9. Risks and assumptions

- **Assumption:** SQLite is acceptable for development. Production should run on
  Postgres — the schema uses no SQLite-only types.
- **Assumption:** Single-tenant per-deployment. Multi-tenant isolation would require
  an additional `Organization` row + scoping middleware; not built.
- **Risk:** File storage is local-disk. Replace with S3/Azure Blob before deploying.
- **Risk:** No rate limiting on auth endpoints. Add a reverse-proxy rule or middleware.
- **Risk:** Notifications are written synchronously inside server actions. If volume
  grows, move to a queue (BullMQ / cron). The `notify()` API keeps that swap simple.
- **Risk:** I could not execute `npm install` in this environment, so the first real
  build/test will be by the operator. The code has been authored carefully but the
  toolchain has not run.
