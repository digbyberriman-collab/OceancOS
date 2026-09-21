# Data & API audit — OceancOS

Sub-agent: `data-api`. Verified against commit `036175e` and the live dev database
(12 users / 16 jobs / 11 change orders). `npx prisma validate` passes.

---

### [VALIDATION] — Approval decisions are written unvalidated and unscoped
Severity: Critical
Location: src/app/(app)/change-orders/actions.ts:139-211
Found by: data-api

Description:

`decideChangeOrderApproval` is the only write path that moves money through the approval
chain, and it validates nothing. Line 142 reads the decision straight off the form and casts it:

    const decision = String(formData.get("decision") ?? "") as "APPROVED" | "REJECTED" | "MORE_INFO";

`ApprovalDecisionSchema` exists in src/lib/validators.ts:63-68 and enumerates exactly these
values. It is never imported here (`grep -rn ApprovalDecisionSchema src/` returns only the
definition). The raw string is written to `ChangeOrderApproval.decision` at line 152-160, and
there is no CHECK constraint on that column (`select count(*) from pg_constraint where
contype='c'` returns 0), so any string persists.

The branch logic at lines 180-207 then treats anything that is not the literal `"REJECTED"` or
`"MORE_INFO"` as an approval: it falls to the `else`, counts the remaining `decision: "PENDING"`
rows, and — because the garbage value is no longer `PENDING` — can find zero remaining and set
the change order to `APPROVED` with `approvedCost: approval.changeOrder.estimatedCost` (line 189-192).

Separately, the only authorisation is `hasPermission(user, permKey)` at line 150. There is no
`listProjectsForUser` check and no comparison of `approval.changeOrder.projectId` against
anything the caller can reach. Every other job/change-order path does perform that check
(src/app/(app)/jobs/actions.ts:29-32, src/app/(app)/jobs/[id]/page.tsx:67). This one does not,
so a user holding e.g. `change_order.approve.finance` on one project can approve a change order
belonging to any other project by posting its `approvalId`.

Impact:

A malformed or hand-crafted `decision` advances the approval chain and can mark a change order
fully `APPROVED`, committing `approvedCost` — an irreversible financial decision — without any
legitimate approval being recorded. The stored decision value is then meaningless to every
reader. Combined with the missing project scope, the approval gate the whole change-order
workflow rests on is not enforced.

Suggested fix:

Parse with the existing `ApprovalDecisionSchema` before any write and reject on failure. Load
the approval with `include: { changeOrder: { select: { projectId: true } } }` and assert that
project is in `listProjectsForUser(user.id)`. Add a Postgres CHECK (or a real `enum` type) on
`ChangeOrderApproval.decision` so the database refuses an unknown value even if a future caller
forgets.

---

### [TRANSACTIONS] — The approval decision is five separate writes with no transaction
Severity: Critical
Location: src/app/(app)/change-orders/actions.ts:152-207
Found by: data-api

Description:

Deciding an approval is one logical change made of up to five unwrapped statements:

- line 152 `changeOrderApproval.update` — record the decision
- line 162 `changeOrderHistory.create` — record the event
- line 171 `recordAudit` -> `auditLog.create`
- line 181 / 183 / 189 / 202 `changeOrder.update` — move the parent status
- line 185 `changeOrderApproval.count` — the "is everything approved" read

None are inside `prisma.$transaction`. The same file uses `$transaction` correctly for
`transitionChangeOrder` (line 72-87), so this is an omission rather than a convention.

The `count` at line 185 is also a read-then-write with no locking: two approvers deciding the
last two required stages concurrently can both read `remaining > 0` and both write
`UNDER_REVIEW`, leaving a change order with every stage approved that never reaches `APPROVED`.

`decideChangeOrderApproval` is invoked straight from the approvals queue
(src/app/(app)/approvals/page.tsx:144) and from the detail page, so it is on the hot path.

Impact:

A failure between line 152 and line 189 leaves an approval marked `APPROVED` on a change order
still sitting in `UNDER_REVIEW`, with no history row and no audit entry. The approval chain then
stalls invisibly: the stage no longer appears in the pending queue (it is not `PENDING`) so no
one is prompted, and the change order never advances. In the opposite ordering a change order
reaches `APPROVED` with `approvedCost` committed while `ChangeOrderHistory` has no record of who
approved it — the audit trail for a financial commitment is lost. The concurrent-decision race
produces the same stall with no failure at all.

Suggested fix:

Wrap the whole decision in `prisma.$transaction(async (tx) => { ... })` — approval update,
history, the remaining-count read and the parent status update — and take the count inside the
transaction at `Serializable`, or re-derive the parent status from the approval rows in a single
`updateMany` guarded on the expected current status. Move `recordAudit` inside the same
transaction or make it an explicit post-commit step that cannot silently vanish.

---

### [EXPOSURE] — List pages, search and the change-order export ignore project scope
Severity: Critical
Location: src/app/(app)/change-orders/page.tsx:31-47, src/app/(app)/crew-requests/page.tsx:30-50, src/app/(app)/financials/page.tsx:22-25, src/app/(app)/dashboard/page.tsx:35-77, src/app/(app)/approvals/page.tsx:33-61, src/app/(app)/search/page.tsx:44-72, src/app/(app)/risks/page.tsx:30, src/app/(app)/documents/page.tsx:16, src/app/(app)/drawings/page.tsx:16, src/app/(app)/meetings/page.tsx:16, src/app/(app)/schedule/page.tsx:132-133, src/app/(app)/logistics/page.tsx:71, src/app/(app)/inventory/page.tsx:77, src/app/api/export/change-orders/route.ts:13-35
Found by: data-api

Description:

`src/lib/project.ts` builds a careful per-user project scope: `listProjectsForUser` (line 28-64)
returns only the projects a user's role assignments reach, and `getActiveProject` (line 73-90)
resolves the one in play. Exactly one list page uses it — `/jobs`
(src/app/(app)/jobs/page.tsx:34, 41-47). Every other list page builds its `where` without a
`projectId`:

- change-orders/page.tsx:31 — `const where: any = { archivedAt: null }`
- crew-requests/page.tsx:30 — same
- financials/page.tsx:22 — `prisma.budget.findMany({ include: ... })`, no `where` at all
- dashboard/page.tsx:58 — `prisma.budget.findMany()`, bare; the five headline counts at lines
  35-43 and `myApprovals` at 65-69 carry no project filter either
- approvals/page.tsx:33, 45, 57 — no project filter on any of the three queries
- risks / documents / drawings / meetings / schedule / logistics / inventory — no project filter
- search/page.tsx:44-72 — every branch is global; line 66 searches `Supplier` with **no
  permission check at all**, unlike its six siblings

The spreadsheet export is worse than unscoped — it is conditionally unscoped:

    // src/app/api/export/change-orders/route.ts:13-18
    async function loadRows(projectId?: string) {
      return prisma.changeOrder.findMany({ where: projectId ? { projectId } : undefined, ... });
    }
    // line 34-35
    const project = await getActiveProject(user.id);
    const rows = await loadRows(project?.id);

`getActiveProject` returns `null` for a user with no reachable project (src/lib/project.ts:80).
That `null` becomes `where: undefined`, so the user with the *least* access downloads a workbook
of **every change order in the system**, across every vessel and every owner.

Impact:

The application is multi-project by design — a yard-side user, an owner's rep and a captain are
scoped by `UserRole.projectId`/`vesselId` — but that scope is enforced on one page out of
fifteen. Any signed-in user with a module permission sees titles, descriptions, costs, schedule
impact, risks, documents, drawings, meeting minutes, budgets and inventory belonging to vessels
and owners they have no relationship with. Yacht refit commercials are confidential between one
owner and one yard; this is a cross-tenant disclosure on the primary screens. The export route
turns it into a one-click bulk download.

Suggested fix:

Give every list query the same treatment `/jobs` already has: resolve
`getActiveProject(user.id)`, refuse when it is null, and put `projectId: project.id` in the
`where`. For genuinely cross-project screens (financials says "across all active projects")
scope to `{ projectId: { in: (await listProjectsForUser(user.id)).map(p => p.id) } }` instead of
dropping the filter. In `loadRows`, make `projectId` required and return 404 when there is no
active project, rather than letting `undefined` mean "everything". Add the missing
`CON_VIEW`-style permission check to the supplier branch of search.

---

### [QUERIES] — The jobs list fans out seven unbounded COUNTs and one unbounded findMany
Severity: High
Location: src/app/(app)/jobs/page.tsx:49-67, src/lib/jobs/views.ts:88-118
Found by: data-api

Description:

The brief flagged "a count per view". Assessed: it is not a per-row N+1 — it is a fixed fan-out
of seven, one per entry in `JOB_VIEWS` (src/lib/jobs/views.ts:33-77):

    Promise.all(
      JOB_VIEWS.map(async (v) => ({
        key: v.key,
        count: await prisma.job.count({ where: jobWhere({ projectId: project.id, view: v }) }),
      }))
    )

Seven round trips on every render of `/jobs`, plus the row query and the sections query — nine
queries for one page. They run concurrently, so wall-clock cost is bounded by the slowest, but
each takes a connection from the pool, so the page consumes nine at once. That is the real risk:
src/lib/db.ts creates a default `PrismaClient` with no `connection_limit` tuning, and
`export const dynamic = "force-dynamic"` (line 22) means every navigation re-runs all nine.

Two compounding problems in the same block:

1. The row query at line 50-57 has **no `orderBy` and no `take`**. Postgres returns rows in
   whatever order the plan yields, so group ordering depends entirely on the in-memory sort in
   `groupJobs` (src/lib/jobs/views.ts:145-157) — but the *set* of rows is unbounded. A project
   with thousands of jobs loads all of them, with `section`, `favourites` and a `_count` of
   comments, then sums `job.total` in JS at line 71.
2. The search filter (src/lib/jobs/views.ts:109-114) is four `contains ... mode: "insensitive"`
   predicates OR'd together, including over `description`. On Postgres that compiles to
   `ILIKE '%q%'`, which no B-tree index can serve; every search is a sequential scan of the
   project's jobs, executed once for the rows and again inside whichever counts match.

Impact:

Nine concurrent queries per page view, all re-run on every navigation, on a connection pool with
no headroom configured. Today the table holds 16 rows so nothing shows; at a realistic refit
worklist (The Bridge's own quote packs run to several hundred jobs per project, and this is a
multi-project system) the page loads every row with three joined relations and totals them in
application memory. Concurrent users multiply the connection pressure directly.

Suggested fix:

Replace the seven counts with one grouped query —
`prisma.job.groupBy({ by: ['status', 'contractType'], where: { projectId, archivedAt: null }, _count: true })`
— and derive each view's badge from that single result set in JS, reusing the same `JOB_VIEWS`
definitions so list and counts still cannot drift. Add an explicit
`orderBy: [{ groupCode: 'asc' }, { code: 'asc' }]` and a `take` with pagination to the row query.
For search, add a `pg_trgm` GIN index on `Job(title)` / `Job(code)` or a generated `tsvector`
column, and drop `description` from the default search predicate.

---

### [INDEXES] — No index on any foreign key or filter column outside the Jobs tables
Severity: High
Location: prisma/schema.prisma:14-615, prisma/migrations/20260921154345_init_postgres/migration.sql:577-736
Found by: data-api

Description:

Postgres does not create an index for a foreign-key column automatically. The init migration
creates 52 FK constraints and 15 unique indexes and **zero** plain indexes. Only the later Jobs
migrations add any (`Job_projectId_status_idx`, `Job_projectId_groupCode_idx`, `JobLine_jobId_idx`,
`JobNote_jobId_kind_idx`, `JobHistory_jobId_idx`, `Comment_jobId_idx`, `Attachment_jobId_idx`,
`Attachment_commentId_idx`, `AcceptanceChallenge_jobId_userId_idx`). Confirmed live:

    Notification        | Notification_pkey          <- only the PK
    ChangeOrder         | ChangeOrder_number_key, ChangeOrder_pkey
    ChangeOrderApproval | ChangeOrderApproval_pkey   <- only the PK
    Comment             | Comment_jobId_idx, Comment_pkey
    AuditLog            | AuditLog_pkey
    Budget              | Budget_pkey
    Session             | Session_token_key, Session_pkey
    CrewRequest         | CrewRequest_number_key, CrewRequest_pkey

Matching those against the where/orderBy the code actually issues, the missing ones that matter:

| Query (file:line) | Predicate | Index |
|---|---|---|
| src/lib/notifications.ts:58 `unreadCount` | `Notification(userId, readAt IS NULL)` | none |
| src/app/(app)/change-orders/page.tsx:43-46 | `ChangeOrder(archivedAt, status, priority)` order by `createdAt desc` | none |
| src/app/(app)/approvals/page.tsx:33-53 | `ChangeOrderApproval(decision, stage)` order by `createdAt` | none |
| src/app/(app)/change-orders/actions.ts:185 | `ChangeOrderApproval(changeOrderId, decision, required)` | none |
| src/app/(app)/crew-requests/page.tsx:46-49 | `CrewRequest(archivedAt, status, dueDate)` | none |
| src/app/(app)/dashboard/page.tsx:44-54 | `Milestone(date, status)`, `Risk(status)` order by `rating`, `AuditLog` order by `createdAt desc` | none |
| src/app/(app)/change-orders/[id]/page.tsx:44-46 | `Comment(changeOrderId)`, `ChangeOrderHistory(changeOrderId)` | none |
| src/lib/project.ts:29-32 | `UserRole(userId)` | none |
| src/lib/auth.ts:118 | `Session(userId)` for the reset-time `deleteMany` | none |
| src/app/(app)/jobs/page.tsx:41-47 | `Job(projectId, archivedAt)` — archived filter not in either Job index | partial |

The worst is the notification count: src/app/(app)/layout.tsx:9-13 calls `unreadCount(user.id)`
in the app layout, so **every page render of the entire application** runs
`SELECT count(*) FROM "Notification" WHERE "userId" = $1 AND "readAt" IS NULL` against a table
with nothing but a primary key. `notify` (src/lib/notifications.ts:27-37) fans out one row per
recipient per event, so this is the fastest-growing table in the schema.

Impact:

Every one of these is a sequential scan. The notification count scans the largest table in the
system on every single page view, by every user, for the whole session. Approval, change-order
and crew-request lists scan their tables on every render (all pages are `force-dynamic`). None
of this is visible at 16 rows; all of it degrades linearly and hits the busiest paths first.

Suggested fix:

Add and migrate: `@@index([userId, readAt])` on Notification; `@@index([projectId, status])` and
`@@index([archivedAt, createdAt])` on ChangeOrder; `@@index([changeOrderId, decision])` and
`@@index([decision, stage])` on ChangeOrderApproval; `@@index([projectId, status])` and
`@@index([dueDate])` on CrewRequest; `@@index([changeOrderId])` on Comment, ChangeOrderHistory
and Attachment; `@@index([crewRequestId])` on Comment and Attachment; `@@index([projectId])` on
Budget, Risk, Milestone, ScheduleTask, LogisticsItem, Document, Drawing, Meeting, InventoryItem;
`@@index([userId])` on UserRole, Session and PasswordReset; `@@index([createdAt])` and
`@@index([resource, resourceId])` on AuditLog. Extend `Job_projectId_status_idx` to
`@@index([projectId, archivedAt, status])`. As a standing rule, every FK column in this schema
needs an index — there are 52 constraints and 9 indexes.

---

### [VALIDATION] — Document numbers are generated from a row count, so they collide
Severity: High
Location: src/lib/utils.ts:24-27, src/app/(app)/change-orders/actions.ts:34, src/app/(app)/crew-requests/actions.ts:18
Found by: data-api

Description:

    // src/lib/utils.ts:24-27
    export async function nextSequence(prefix: string, fetchCount: () => Promise<number>) {
      const n = (await fetchCount()) + 1;
      return `${prefix}-${String(n).padStart(4, "0")}`;
    }

Called as `nextSequence("CO", () => prisma.changeOrder.count())` and
`nextSequence("REQ", () => prisma.crewRequest.count())`. The count and the subsequent `create`
are two separate statements with no transaction, no advisory lock and no sequence. Both
`ChangeOrder.number` and `CrewRequest.number` are `@unique` (migration.sql:595, 598).

Two failure modes, both reachable in normal use:

1. **Concurrency.** Two users submitting at once both read `count() = 11`, both build `CO-0012`,
   and the second `create` violates `ChangeOrder_number_key`. Prisma raises `P2002`, which
   nothing catches — see the error-handling finding below for what the user then sees.
2. **Deletion or archival.** The count falls when a row is removed, so the generator hands back
   a number already in use. `archivedAt` exists on both models but `count()` does not filter it,
   so this is latent — it becomes live the moment any hard delete happens, or any switch to
   counting non-archived rows.

Impact:

Two people raising a change order in the same second — routine during a yard meeting — and one
of them loses their work to an unexplained error page, with the form contents gone. The number
is the human-facing identity of the record (it is what the export, the PDF, the notification
title and the approvals queue all display), so a collision is not cosmetic.

Suggested fix:

Use a real database sequence per prefix (`CREATE SEQUENCE change_order_number_seq;` plus
`nextval`), or a dedicated counter row updated with `UPDATE ... SET n = n + 1 RETURNING n` inside
the same transaction as the `create`. Retry-on-`P2002` is not a fix here because the count is
also wrong after a delete.

---

### [VALIDATION] — Attachment metadata is taken from the client and written unchecked
Severity: High
Location: src/app/(app)/jobs/actions.ts:504-544
Found by: data-api

Description:

`attachUploads` reads repeated `attachments` form fields, `JSON.parse`s each, and writes them
straight to the `Attachment` table:

    // line 511-543
    const entries = formData.getAll("attachments").map(String).filter(Boolean);
    const rows = entries.map((entry) => { try { return JSON.parse(entry) as {...}; } catch { return null; } })
      .filter((row): row is NonNullable<typeof row> => !!row && typeof row.key === "string");
    await prisma.attachment.createMany({ data: rows.map((row) => ({
      uploaderId, filename: row.filename, mimetype: row.contentType, size: row.size,
      storageKey: row.key, resource, resourceId, jobId: ..., commentId: ...,
    })) });

The only check is `typeof row.key === "string"`. There is no zod schema, no
`isSafeObjectKey(row.key)` (that helper exists at src/lib/storage/keys.ts:94-99 and is applied on
every *other* storage path), no check that the key was one this server minted for this user, no
`filename` length bound, no `contentType` check against `ALLOWED_UPLOAD_TYPES`, and no check that
`size` is a number — `row.size` typed as `number` by an unvalidated cast goes into an `Int`
column, so a string or a float there becomes a Prisma runtime error rather than a 400.

`/api/uploads/sign` (src/app/api/uploads/sign/route.ts:15-63) does all of this correctly — zod
body, type allowlist, size ceiling, project-access check — and then mints the key. But nothing
binds the key that comes back through the form to the key that was signed. The attachment record
is written on the caller's word. It is called from `createJobRequest` (line 117) and
`addJobComment` (line 465).

Impact:

A caller can attach an arbitrary `storageKey` to a job — including a key belonging to another
project's upload, which they can then read back through `GET /api/uploads/local?key=...` (see the
next finding) because that route authorises the session and not the object. They can also record
a filename and content type that do not match the stored bytes, so the UI labels a file as a
harmless PDF while storage holds something else. `size` is displayed and summed but never
reconciled with the object, so the recorded figures are decorative.

Suggested fix:

Define a zod schema for the attachment entry (`key`, `filename` <=255, `contentType` in
`ALLOWED_UPLOAD_TYPES`, `size` positive int <= `maxUploadBytes()`), run `isSafeObjectKey(key)`,
and reject the whole submission on a parse failure rather than silently dropping rows. Better:
sign the key server-side when `/api/uploads/sign` issues it and verify that signature here, so
only a key this server authorised for this user and this project can be attached — the machinery
already exists in `localUploadToken` (src/lib/storage/index.ts:112-122).

---

### [EXPOSURE] — The local upload route authorises the session but never the object
Severity: High
Location: src/app/api/uploads/local/route.ts:53-76
Found by: data-api

Description:

    export async function GET(request: Request) {
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      const key = new URL(request.url).searchParams.get("key") ?? "";
      if (!isSafeObjectKey(key)) return NextResponse.json({ error: "Invalid key" }, { status: 400 });
      const body = await getObject(key);
      ...
    }

`user` is fetched and then used only for the null check — it is never consulted again. There is
no lookup of the `Attachment` row that owns the key, no project check, and no comparison against
`listProjectsForUser`. The PUT half of the same file is guarded by `verifyLocalUploadToken`
(line 40); the GET half has no equivalent.

Keys are built as `projects/<projectId>/<resource>/<resourceId>/<16 hex>-<filename>`
(src/lib/storage/keys.ts:82-91), so they are not enumerable by brute force. But they are not
secrets either: they are stored in `Attachment.storageKey`, they appear in the `downloadUrl` the
app renders (src/lib/storage/index.ts:185-187), and — per the previous finding — they can be
supplied by a client.

This route is only live when `STORAGE_DRIVER=local`, which .env.example:10 documents as
"development and CI". But `storageDriverName()` (src/lib/storage/index.ts:33-38) *infers* local
whenever `S3_BUCKET` is unset, so a production deployment missing one environment variable
silently serves files through this route.

Impact:

Any signed-in user who obtains a key — from a shared link, a log, a cached page, or by attaching
it to a record of their own — reads the object regardless of which project or owner it belongs
to. Attachments here are contracts, class certificates, drawings and quotes. The check the rest
of the codebase performs consistently (`listProjectsForUser` on every job, change-order and
upload-signing path) is absent from the one route that actually hands over bytes.

Suggested fix:

Look up `prisma.attachment.findFirst({ where: { storageKey: key } })`, resolve the owning project
through its `jobId`/`changeOrderId`/`crewRequestId`, and return 404 unless that project is in
`listProjectsForUser(user.id)`. Apply the same check before issuing a signed GET in `downloadUrl`
for the S3 driver. Make `STORAGE_DRIVER` required in production rather than inferred.

---

### [EXPOSURE] — Full User rows, including passwordHash, are loaded on three pages
Severity: High
Location: src/app/(app)/crew-requests/[id]/page.tsx:31, src/app/(app)/crew-requests/new/page.tsx:17, src/app/(app)/admin/page.tsx:17
Found by: data-api

Description:

Three queries select every column of `User`:

    // crew-requests/[id]/page.tsx:31  and  crew-requests/new/page.tsx:17
    const users = await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    // admin/page.tsx:17
    prisma.user.findMany({ include: { roles: { include: { role: true } } }, orderBy: { name: "asc" } })

`User.passwordHash` is a plain non-null column (prisma/schema.prisma:18) with no Prisma
`@@ignore`, no client extension excluding it, and no `omit` configuration in src/lib/db.ts:5-9.
So every bcrypt hash for every active user is materialised in the render.

The contrast is sharp with the paths that were written carefully: jobs/new/page.tsx:32-42 uses
`select: { id: true, name: true, email: true }`, change-orders/[id]/page.tsx:59 uses
`select: { id: true, name: true }`, jobs/[id]/page.tsx:69-85 and both print pages do the same.
`getCurrentUser` (src/lib/auth.ts:134-141) also builds an explicit projection that drops the
hash. These three are the outliers.

I traced whether the hashes reach the browser. They do not today: all three are server components
and the rows are consumed server-side (`users.map` into `<option>` at
crew-requests/[id]/page.tsx:160, `userMap` at line 32, counts and a table in admin). No
`"use client"` component receives `users` as a prop. So this is over-fetching rather than a live
leak.

Impact:

Twelve bcrypt hashes (and every other user column) are pulled into request memory on a routine
page render, where they land in the Node heap, in any heap dump, and in query logs if logging is
ever raised above `["error"]` (src/lib/db.ts:8). More importantly the protection is accidental:
the moment any of those three lists is moved into a client component — a searchable assignee
picker is the obvious next step for crew-requests/[id]/page.tsx:160 — React serialises the whole
row into the RSC payload and every password hash in the system ships to the browser. Nothing in
the code would flag it.

Suggested fix:

Add `select: { id: true, name: true, email: true }` to all three queries (plus the roles include
for admin). Then close the class of bug: configure the Prisma client in src/lib/db.ts with
`omit: { user: { passwordHash: true } }` so the column is opt-in, and have `verifyPassword`'s
caller in src/app/login/page.tsx:20 select it explicitly.

---

### [ERRORS] — No error boundary anywhere; a thrown server action shows a blank generic page
Severity: High
Location: src/app/ (no error.tsx, no global-error.tsx, no not-found.tsx), src/lib/rbac.ts, src/app/(app)/change-orders/actions.ts:31,65,148,150
Found by: data-api

Description:

The brief asks what a thrown server action shows the user. Answer: Next.js's built-in fallback,
with the message stripped.

`find src -name "error.tsx" -o -name "global-error.tsx" -o -name "not-found.tsx"` returns nothing.
There is no route-segment error boundary and no root one. Meanwhile the write paths throw freely,
and the thrown messages are written as if a human will read them:

- `assertPermission` -> `throw new Error("Forbidden: missing " + perm)` (src/lib/rbac.ts)
- `assertTransitionJob` -> `throw new Error("Illegal transition ${from} -> ${to}")` (src/lib/jobs/workflow.ts:334)
- `createChangeOrder` -> `throw new Error("Invalid change order: " + ...)` (line 31)
- `createCrewRequest` -> same shape (src/app/(app)/crew-requests/actions.ts:16)
- `transitionChangeOrder` -> `ChangeOrderStatusSchema.parse(toStatus)` (line 67) throws a raw `ZodError`
- `loadJob` -> `throw new Error("Forbidden: no access to that project")` (src/app/(app)/jobs/actions.ts:31)
- `storeActiveProject` -> same (src/lib/project.ts:100)
- plus every uncaught Prisma `P2002` from the `nextSequence` collision above

In a production build Next redacts server-action error messages to "An error occurred in the
Server Components render..." with only a digest, and with no error.tsx there is nothing to catch
the rejection, so the whole route is replaced by the default error screen. The user loses the
page, loses the form contents, and is told nothing. In development they see the raw message
instead — including `Forbidden: missing change_order.approve.finance`, which names the internal
permission key.

The same file shows the better pattern in use elsewhere: `issueQuote` and `createJobRequest`
redirect back to the form with `?err=<message>` (src/app/(app)/jobs/actions.ts:67, 168-169), and
`updateProjectAction` does the same (src/app/(app)/admin/projects/actions.ts:40, 49-51). So the
codebase has two incompatible conventions and the older one is unusable.

Impact:

Every validation failure, permission failure and illegal transition on the change-order and
crew-request workflows destroys the page and gives the user no message, no field highlighting and
no way back other than the browser's back button — which will not restore the form. This is the
normal path, not an edge case: submitting a change order with a 2-character title reaches line 31.

Suggested fix:

Add `src/app/(app)/error.tsx` (a client component with `reset()`) and a root
`src/app/global-error.tsx` so nothing renders the bare fallback. Then convert the throwing actions
to the redirect-with-`?err=` convention the jobs actions already use, or return a typed
`{ ok: false, message }` result and render it with `useFormState`. Introduce a small `ActionError`
class so genuinely unexpected failures stay distinguishable from expected validation failures.

---

### [ERRORS] — API error bodies are inconsistent and leak internal exception text
Severity: High
Location: src/app/api/export/change-orders/[id]/route.ts:48-60, src/app/api/export/jobs/[id]/route.ts:37-46, src/app/api/uploads/sign/route.ts:41-83, src/app/api/uploads/local/route.ts:23-66
Found by: data-api

Description:

Across the six API routes there are five different JSON error shapes:

    { error: "Not signed in" }                                        // 401, all routes
    { error: "Forbidden" }                                            // 403
    { error: "File type not allowed", allowed: ALLOWED_UPLOAD_TYPES } // 415, sign:44-48
    { error: "File is too large", maxBytes: limit }                   // 413, sign:52-56
    { error: "Could not render the PDF", detail: ..., hint: ... }     // 503, both PDF routes

There is no shared helper, no error code field, and no consistent key beyond `error`. A client
cannot branch on anything but the HTTP status and an English string.

Two of them return internal detail to the caller:

    // export/change-orders/[id]/route.ts:51-58
    const message = err instanceof Error ? err.message : "PDF rendering failed";
    return NextResponse.json({ error: "Could not render the PDF", detail: message,
      hint: "The server needs Chromium. Set PLAYWRIGHT_CHROMIUM_PATH or PDF_CHROME_CHANNEL." }, { status: 503 });

    // uploads/sign/route.ts:80-82
    const message = err instanceof Error ? err.message : "Could not sign upload";
    return NextResponse.json({ error: message }, { status: 500 });

The upload one is the sharper problem: the `catch` wraps `signUpload`, whose first failure mode is
`s3Config()` throwing "Storage misconfigured: set S3_BUCKET, S3_ACCESS_KEY_ID and
S3_SECRET_ACCESS_KEY, or set STORAGE_DRIVER=local for development."
(src/lib/storage/index.ts:59-64). That string — naming the exact environment variables the
deployment is missing — is returned verbatim to any signed-in caller. AWS SDK errors from the same
call can carry bucket names, endpoints and region detail.

Impact:

No client can handle these errors programmatically; each one has to be special-cased by status and
prose. Worse, a misconfigured deployment reports its own configuration gaps to users over the API,
naming credential variables and infrastructure detail — a free map of the storage backend for
anyone probing the endpoint.

Suggested fix:

Add one `apiError(code, message, status, extra?)` helper returning a single shape
(`{ error: { code, message, details? } }`) and route all six handlers through it. Log the caught
exception server-side and return a fixed generic message — "Upload could not be authorised",
"PDF rendering is unavailable" — never `err.message`. Keep the operator-facing `hint` in the log,
not in the response.

---

### [EXPOSURE] — The change-order PDF and print routes skip the project-access check
Severity: High
Location: src/app/print/change-orders/[id]/page.tsx:18-27, src/app/api/export/change-orders/[id]/route.ts:23-32, src/app/api/export/jobs/[id]/route.ts:16-24
Found by: data-api

Description:

The jobs side does this correctly. src/app/print/jobs/[id]/page.tsx:42-44:

    const projects = await listProjectsForUser(user.id);
    if (!projects.some((p) => p.id === job.projectId)) return notFound();

src/app/print/change-orders/[id]/page.tsx has no equivalent. Its only gate is
`hasPermission(user, PERMISSIONS.CO_VIEW)` at line 18, then it loads the change order by id at
line 20-26 with its project, vessel and full approval chain and renders it.

Both `/api/export/*/[id]` routes are the same: export/change-orders/[id]/route.ts:24-32 checks
`CO_VIEW` and fetches the record by id with no project check; export/jobs/[id]/route.ts:16-24
checks `JOB_VIEW` and does the same. They then render the corresponding print page in headless
Chromium carrying the caller's own cookie (invoked at line 27-30 / 37-40). For jobs that second
render re-applies the check and yields a 404 page, so the PDF route leaks nothing but produces a
confusing empty PDF. For change orders the print page has no check either, so the PDF renders in
full.

Impact:

Any user holding `change_order.view` — which the role matrix grants broadly, including to `OWNER`
(src/lib/rbac.ts:84) — can read and download a complete PDF of any change order in the system by
id, including its title, description, reason, costs, schedule impact, and the full named approval
chain with decisions and comments, for vessels and owners they have no relationship with. Ids are
cuids so this needs a leaked id rather than enumeration, but no authorisation stands behind it.

Suggested fix:

Add the same two lines the jobs print page uses to src/app/print/change-orders/[id]/page.tsx after
the record loads. Add the check to both `/api/export/*/[id]` routes as well, so the API returns 404
before spending 60 seconds of `maxDuration` launching Chromium for a record the caller cannot see.

---

### [SCHEMA] — Money is stored as double precision in 21 columns
Severity: High
Location: prisma/schema.prisma:167-168, 236, 258, 287-292, 319, 333, 380, 405, 512, 662, 705-707, 734
Found by: data-api

Description:

Every monetary column in the schema is `Float`, which Prisma maps to Postgres `double precision`.
Confirmed live — 21 of the 22 `double precision` columns are money (the exception is `Vessel.loa`):

    Approval.costImpact, Budget.actual, Budget.approvedChanges, Budget.committed,
    Budget.forecastFinal, Budget.originalAmount, Budget.pendingChanges,
    ChangeOrder.approvedCost, ChangeOrder.estimatedCost, Contractor.contractValue,
    CrewRequest.costImpact, InventoryItem.replacementCost, Invoice.amount, Job.total,
    JobLine.quantity, JobLine.total, JobLine.unitPrice, JobVariation.priceAdjustment,
    LogisticsItem.cost, PurchaseOrder.amount, Risk.costImpact

Binary floating point cannot represent most decimal cents exactly, and these values are summed in
application code in many places:

- src/app/(app)/jobs/actions.ts:221 — `lines.reduce((sum, line) => sum + line.total, 0)` becomes
  `Job.total`, the figure the client signs
- src/app/(app)/jobs/page.tsx:71 — `jobs.reduce((sum, j) => sum + j.total, 0)`, the grand total
- src/lib/jobs/views.ts:148-149 — per-group totals and the value-weighted progress
- src/app/(app)/financials/page.tsx:26-36 and src/app/(app)/dashboard/page.tsx:59-63 — six budget
  rollups each

Line 215 of jobs/actions.ts already shows awareness of the problem —
`Math.round(value.quantity * value.unitPrice * 100) / 100` — but rounds only the per-line product,
not the sum, and stores the result back into a float.

The accepted-quote path makes this consequential: `quoteFingerprint`
(src/lib/jobs/acceptance.ts:94-100) serialises `job.total` and every line's `quantity` and
`unitPrice` with `JSON.stringify` and hashes the result. The hash is stored on the
`AcceptanceChallenge` and re-checked at confirmation
(src/app/(app)/jobs/[id]/accept/actions.ts:163) to prove the quote was not altered between the
code being sent and the signature landing.

Impact:

Totals drift by fractions of a cent and the drift accumulates across a worklist of hundreds of
lines, so the quote total, the group subtotal, the list grand total and the exported spreadsheet
can each disagree with the sum of the lines by a visible amount. On a refit running to seven
figures across many jobs, the budget rollups on the dashboard and the financials page are the
figures the owner's rep reports upward. And because the acceptance fingerprint hashes the float's
decimal rendering, a value that round-trips differently between write and read invalidates a
legitimate signature — the user is told "This quote changed while you were confirming" when
nothing changed.

Suggested fix:

Change all 21 to `Decimal @db.Decimal(14, 2)` (quantity to `Decimal(14, 3)` if fractional units
are needed) and migrate with an explicit `ALTER TABLE ... TYPE numeric(14,2) USING
round(col::numeric, 2)`. Handle `Prisma.Decimal` in the sum sites listed above rather than `+`,
and convert to a plain number only at the formatting boundary in `fmtMoney` (src/lib/utils.ts:7-10).
Compute the acceptance fingerprint from the canonical decimal string so it is stable.

---

### [SCHEMA] — Around 36 `*Id` columns carry no foreign key
Severity: High
Location: prisma/schema.prisma (throughout)
Found by: data-api

Description:

The database has 52 FK constraints. Querying for `*Id` columns that have none returns 40, of which
five are deliberately polymorphic (`Approval.resourceId`, `Attachment.resourceId`,
`AuditLog.resourceId`, `Comment.resourceId`, `Notification.resourceId`). The remaining ~35 are
ordinary single-target references declared as bare `String`:

    AcceptanceChallenge.userId    ChangeOrder.createdById          Job.clientAcceptedById
    Approval.approverId           ChangeOrder.updatedById          Job.createdById
    Approval.requesterId          ChangeOrder.vesselAreaId         Job.designatedAuthoriserId
    Attachment.uploaderId         ChangeOrderApproval.decidedById  Job.updatedById
    AuditLog.actorId              ChangeOrderHistory.actorId       Job.yardAcceptedById
    Comment.authorId              CrewRequest.assignedToId         JobFavourite.userId
    Document.ownerId              CrewRequest.createdById          JobHistory.actorId
    Drawing.vesselAreaId          CrewRequest.requestedById        LogisticsItem.responsibleId
    InventoryItem.supplierId      CrewRequest.updatedById          LogisticsItem.supplierId
    Invoice.poId                  CrewRequest.vesselAreaId         MeetingAction.ownerId
    PurchaseOrder.costCodeId      PurchaseOrder.createdById        PurchaseOrder.projectId
    Risk.ownerId                  ScheduleTask.ownerId

Note what is in that list. `Job.createdById`, `Job.designatedAuthoriserId` and
`Job.clientAcceptedById` are the three identities on a signed commercial document.
`Comment.authorId` is the author of every message in every thread. `AcceptanceChallenge.userId` is
who a confirmation code was issued to. `JobFavourite.userId` is half of that table's primary key.
`PurchaseOrder.projectId` is unconstrained while every other model's `projectId` is a real FK.

There is a working exploit path. `assignCrewRequest` (src/app/(app)/crew-requests/actions.ts:99-125):

    const assignedToId = String(formData.get("assignedToId") || "") || null;
    await prisma.crewRequest.update({ where: { id }, data: { assignedToId, status: ..., updatedById: user.id } });
    ...
    if (assignedToId) await notify({ userIds: [assignedToId], ... });

No validation that the id names a real user, and no FK to stop it. The `update` succeeds. Then
`notify` writes a `Notification` — and `Notification.userId` *does* have a FK (migration.sql:721) —
so the insert raises a foreign-key violation, which nothing catches. The net effect: the crew
request is permanently assigned to a user that does not exist, the assignment is recorded in the
audit log at line 108-114, and the user gets the blank error page from the error-handling finding.

Impact:

Referential integrity for user attribution is enforced nowhere in the system. A deleted or merged
user silently orphans every job they created, every comment they wrote and every acceptance they
signed — the join in src/app/(app)/jobs/[id]/page.tsx:69-85 just renders "—" where the name should
be, so a signed quote loses the record of who signed it with no error. `JobFavourite` rows for a
removed user are never cleaned up because the cascade only exists on the `jobId` side
(migration.sql:182). And the `assignCrewRequest` path turns a missing constraint into a
half-applied write plus a crash.

Suggested fix:

Declare real relations for all ~35. For the attribution columns use
`@relation(fields: [createdById], references: [id], onDelete: Restrict)` so a user with history
cannot be hard-deleted — the schema already prefers soft deletion via `archivedAt`, so `Restrict`
matches intent. Use `onDelete: SetNull` for the nullable optional ones (`ownerId`, `assignedToId`,
`responsibleId`) and `Cascade` for `JobFavourite.userId` and `AcceptanceChallenge.userId`. Each new
relation needs its index too — see the index finding.

---

### [SCHEMA] — 41 status/type/category columns are unconstrained text with no CHECK
Severity: Medium
Location: prisma/schema.prisma (throughout); verified `select count(*) from pg_type where typtype='e'` -> 0, `select count(*) from pg_constraint where contype='c'` -> 0
Found by: data-api

Description:

The database defines zero enum types and zero CHECK constraints. Every state machine in the system
is a `String` column with the legal values written in a trailing comment:

    status   String @default("DRAFT")   // DRAFT|SUBMITTED|UNDER_REVIEW|MORE_INFO|APPROVED|...
    decision String @default("PENDING") // PENDING|APPROVED|REJECTED|MORE_INFO|DELEGATED
    category String                     // DEFECT|OPERATIONAL|SAFETY|INTERIOR|ENGINEERING|...

41 columns named `status`, `type`, `category`, `kind`, `priority`, `decision`, `stage`,
`contractType`, `pricingBasis`, `approvalStatus`, `channel` or `riskLevel` are in this shape. The
application compensates in places — src/lib/enums.ts holds the canonical lists,
jobs/actions.ts:184-185 validates `contractType` and `pricingBasis` against them,
`ChangeOrderStatusSchema`/`CrewRequestStatusSchema` parse transitions — but the checking is
per-call-site and, as the first finding shows, at least one important write path skips it entirely.

Everything downstream then defends against the gap: `JOB_STATUS_LABELS[r.status as JobStatus] ?? r.status`
(src/app/api/export/jobs/route.ts:50), `CONTRACT_TYPE_LABELS[...] ?? job.contractType`
(jobs/page.tsx:255), `status.replace(/_/g, " ")` (export/change-orders/route.ts:46). Each `??` is
an acknowledgement that the column may hold something the code does not recognise.

Impact:

The database cannot reject a bad state, so a single unvalidated write path corrupts a workflow
permanently and silently — the row renders as its raw value and disappears from every filtered
list, because `where: { status: { in: [...] } }` will never match it. Nothing alerts anyone; the
record simply stops appearing where its owner expects it. The workflow transition tables
(`JOB_LEGAL_TRANSITIONS`, the `legal` map at crew-requests/actions.ts:60-70) also key off these
strings, so an unrecognised status has no legal transitions at all and the record becomes stuck.

Suggested fix:

Promote the closed sets to Prisma `enum` declarations — the values already exist in
src/lib/enums.ts, so the change is mechanical and the generated client types get stricter for free.
Where a column must stay open for import compatibility, add a CHECK constraint in a migration.
Start with `ChangeOrderApproval.decision`, `ChangeOrder.status`, `Job.status` and
`CrewRequest.status`, which are the four that gate money.

---

### [TRANSACTIONS] — Five more multi-step writes that are not atomic
Severity: Medium
Location: src/app/(app)/jobs/actions.ts:419-427, 454-465, 484-492; src/app/(app)/jobs/[id]/accept/actions.ts:84-97; src/app/(app)/crew-requests/actions.ts:104-123
Found by: data-api

Description:

Besides the approval path (Critical, above), five sequences represent one logical change across
several unwrapped statements. The same files use `$transaction` correctly elsewhere
(jobs/actions.ts:236, 341; accept/actions.ts:180, 268), so these are oversights.

**1. `setJobProgress` (jobs/actions.ts:419-427)** — `job.update` then `jobHistory.create` then
`recordAudit`. A failure after the first leaves the progress percentage changed with no history
row explaining it. `progressPct` drives the value-weighted group progress on the list
(src/lib/jobs/views.ts:149), so the number moves with no provenance.

**2. `addJobComment` (jobs/actions.ts:454-465)** — `comment.create` then `attachUploads`. A failure
in between posts a comment whose attachments are silently missing; the files exist in storage but
are referenced by nothing.

**3. `toggleJobFavourite` (jobs/actions.ts:484-492)** — read-then-write:
`findUnique` then `delete` or `create`. Two rapid clicks race: both read `null`, both create, the
second violates the composite primary key and throws. Low consequence but a guaranteed unhandled
error on double-click.

**4. `requestAcceptanceCode` (accept/actions.ts:84-97)** — the challenge is created with
`codeHash: ""` and then updated with the real hash, because the hash binds to the row's id. Between
the two statements a row exists that can never be satisfied. The code is emailed at line 110,
*after* both, so a failure at line 94 emails nothing and leaves a dead challenge — but the redirect
at line 120 still sends the user to `?challenge=<id>` and asks for a code that was never sent.
`verifyAcceptanceCode` handles the empty hash safely (length mismatch -> false,
src/lib/jobs/acceptance.ts:39), so this is a dead end rather than a bypass.

**5. `assignCrewRequest` (crew-requests/actions.ts:104-123)** — `crewRequest.update`, then
`recordAudit`, then `notify`. See the FK finding for the concrete failure this produces.

Impact:

Each leaves the database in a state no reader expects: progress without history, comments without
their files, an acceptance challenge the user is asked to satisfy but was never sent a code for, an
assignment recorded and audited but never notified. None self-heal and none surface an error the
user can act on.

Suggested fix:

Wrap 1, 2 and 5 in `prisma.$transaction([...])` the way the sibling actions in the same files
already do. For 3, use a single `prisma.jobFavourite.deleteMany({ where: { userId, jobId } })` and
create only when `count === 0`, or an `upsert`, so a double-click is idempotent. For 4, generate the
challenge id client-side with `cuid()` and insert the row complete in one statement.

---

### [VALIDATION] — Four write paths parse raw FormData with no validation
Severity: Medium
Location: src/app/(app)/crew-requests/actions.ts:99-125, 127-143; src/app/(app)/change-orders/actions.ts:213-229; src/app/(app)/admin/projects/actions.ts:55-56
Found by: data-api

Description:

Full inventory of write paths and whether they validate:

| Action | Validation |
|---|---|
| createChangeOrder | zod ChangeOrderCreateSchema OK |
| createCrewRequest | zod CrewRequestCreateSchema OK |
| createJobRequest | zod RequestSchema OK |
| issueQuote | zod LineSchema per line + manual enum checks OK |
| transitionChangeOrder | ChangeOrderStatusSchema.parse OK |
| transitionCrewRequest | CrewRequestStatusSchema.parse OK |
| transitionJob | permission-table lookup fails closed OK |
| confirmAcceptance / rejectQuote | challenge + transition checks OK |
| requestReset / completeReset | zod / validateNewPassword OK |
| setActiveProjectAction | storeActiveProject re-checks access OK |
| decideChangeOrderApproval | **none** — see Critical finding |
| attachUploads | **none** — see High finding |
| assignCrewRequest | **none** |
| addCrewRequestComment | **none** |
| addChangeOrderComment | **none** |
| updateProjectAction | dates and code OK, currency/yardName **none** |
| setJobProgress | clamped 0-100 (no zod but bounded) |

The three not already covered elsewhere:

**`assignCrewRequest`** (crew-requests/actions.ts:99-125) — `assignedToId` straight from the form,
no existence check, no FK. Covered in the FK finding.

**`addCrewRequestComment`** (127-143) and **`addChangeOrderComment`**
(change-orders/actions.ts:213-229) — identical shape:

    const id = String(formData.get("id"));
    const body = String(formData.get("body") ?? "").trim();
    if (!id || !body) return;
    await prisma.comment.create({ data: { authorId: user.id, body, resource: "...", resourceId: id, changeOrderId: id } });

No permission check of any kind — not `CR_VIEW`, not `CO_VIEW`, nothing. (Compare `addJobComment`
at jobs/actions.ts:441-452, which asserts `JOB_COMMENT`, calls `loadJob` to confirm project access,
and asserts `MINUTES_RECORD` for a minute.) No length bound on `body`, which lands in an unbounded
`text` column. The only thing stopping a comment on an arbitrary id is the FK on
`changeOrderId`/`crewRequestId`, which throws uncaught.

**`updateProjectAction`** (admin/projects/actions.ts:55-56) —
`String(formData.get("currency") ?? "EUR").trim().toUpperCase() || "EUR"` accepts any string. It is
copied onto every job created afterwards (jobs/actions.ts:107) and passed to
`Intl.NumberFormat(... { style: "currency", currency })` in `fmtMoney` (src/lib/utils.ts:9) and in
the acceptance email (accept/actions.ts:104-108), where an invalid code throws a `RangeError`
mid-render.

Impact:

Any signed-in user can post comments of unbounded length onto any change order or crew request in
any project — the two comment actions have no authorisation whatsoever. A mistyped currency on the
admin screen sets a project-wide value that crashes every page rendering money for that project,
and every acceptance email for it.

Suggested fix:

Give the two comment actions the treatment `addJobComment` already has: assert the view permission,
load the parent, confirm project access via `listProjectsForUser`, and bound `body` with
`z.string().min(1).max(5000)`. Validate `currency` against a fixed list or an ISO-4217 check.

---

### [VALIDATION] — Creates trust the projectId supplied in the form
Severity: Medium
Location: src/app/(app)/change-orders/actions.ts:29-50, src/app/(app)/crew-requests/actions.ts:15-28
Found by: data-api

Description:

Both schemas require `projectId: z.string().min(1)` (src/lib/validators.ts:21, 40) and both actions
spread the parsed result straight into `create`:

    const parsed = ChangeOrderCreateSchema.safeParse(Object.fromEntries(formData));
    ...
    const co = await prisma.changeOrder.create({ data: { ...data, number, createdById: user.id, ... } });

zod confirms the field is a non-empty string. Nothing confirms it names a project the caller can
reach. The forms populate the dropdown from
`prisma.project.findMany({ where: { archivedAt: null } })` (change-orders/new/page.tsx:16,
crew-requests/new/page.tsx:16) — every active project, unfiltered — so the value is not even
constrained by the UI.

The jobs equivalent does it correctly: `createJobRequest` ignores any submitted project and takes
`project.id` from `getActiveProject(user.id)` (jobs/actions.ts:55-56, 99). And
`/api/uploads/sign` validates explicitly at lines 60-63.

Impact:

A user can create a change order or crew request inside a project they have no access to, and then
never see it again themselves. The record appears in that project's list, its approval chain is
generated against it (change-orders/actions.ts:43-45), and the approvers for that project are
notified — so the injected record looks entirely legitimate to them. Combined with the count-based
numbering, it also consumes a `CO-nnnn` number from the shared sequence.

Suggested fix:

After parsing, check `(await listProjectsForUser(user.id)).some(p => p.id === data.projectId)` and
reject otherwise — or follow the jobs pattern and drop `projectId` from both schemas, taking it
from `getActiveProject` instead. Scope the dropdown queries on both `new` pages to
`listProjectsForUser` as well.

---

### [QUERIES] — Per-request query amplification before any page data is fetched
Severity: Medium
Location: src/app/(app)/layout.tsx:8-13, src/lib/auth.ts:115-142, src/lib/project.ts:28-90
Found by: data-api

Description:

Every authenticated page render runs a fixed preamble before touching its own data:

    // src/app/(app)/layout.tsx:8-13
    const user = await requireUser();                 // 1 query
    const [unread, projects, activeProject] = await Promise.all([
      unreadCount(user.id),                           // 1 query
      listProjectsForUser(user.id),                   // 2 queries
      getActiveProject(user.id),                      // 4 queries
    ]);

`getActiveProject` (src/lib/project.ts:73-90) itself calls `listProjectsForUser` at line 79, so that
function runs **twice per render** — 4 queries where 2 would do. Plus its own session lookup
(line 76) and a `project.findUnique` (line 85) for a project whose summary `listProjectsForUser`
already returned.

The `requireUser` query is not cheap either. `getCurrentUser` (src/lib/auth.ts:118-127) joins four
levels deep — Session -> User -> UserRole -> Role -> RolePermission -> Permission — to rebuild the
permission set from scratch on every request, with no cache and no index on `UserRole.userId`.

That is 8 queries before the page starts. The page then adds its own: `/jobs` adds 9 (see above) and
calls `getActiveProject` a **third** time at line 34; `/dashboard` adds 11 and calls it again at
line 73. Neither is memoised — `React.cache` would deduplicate within a render but is not used.

Server actions repeat the pattern: `loadJob` (jobs/actions.ts:22-33) calls `listProjectsForUser`
again on every single job action, and `loadJobForAccept` (accept/actions.ts:27-39) does the same.

Impact:

Around 17-20 queries for a single view of `/jobs`, most of them re-derivations of the same two facts
(who is this user, which projects can they see). Every page is `force-dynamic`, so nothing is cached
between navigations. With no index on `UserRole.userId`, `Notification.userId` or `Session.userId`,
several of those are sequential scans. Connection pool pressure scales with concurrent users rather
than with data volume, so this bites before the row counts do.

Suggested fix:

Wrap `getCurrentUser`, `listProjectsForUser` and `getActiveProject` in `React.cache()` so each runs
once per request regardless of how many callers ask. Have `getActiveProject` accept the
already-loaded project list instead of re-fetching it, and return the summary from that list rather
than issuing a fourth query. Pass the resolved user and project down from the layout through props.

---

### [QUERIES] — Lists silently truncate at a hard `take` with no pagination
Severity: Medium
Location: src/app/(app)/change-orders/page.tsx:45, src/app/(app)/crew-requests/page.tsx:49, src/app/(app)/inventory/page.tsx:79, src/app/(app)/documents/page.tsx:16, src/app/(app)/schedule/page.tsx:132, src/app/(app)/logistics/page.tsx:73, src/app/(app)/meetings/page.tsx:19, src/app/(app)/notifications/page.tsx:31, src/app/(app)/approvals/page.tsx:53,61
Found by: data-api

Description:

Nine list pages cap their query with a literal `take` — 200, 500, 100, 50 — and none of them
paginate, none show a total, and none tell the reader the list was cut. The page simply renders the
first N rows as if they were all of them.

    const cos = await prisma.changeOrder.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    const items = await prisma.inventoryItem.findMany({ where, orderBy: { name: "asc" }, take: 500 });

The inventory page then computes its summary strip from the truncated array
(src/app/(app)/inventory/page.tsx:83-90): `lowCount`, `reorderCount` and `faultyCount` are counted
over at most 500 rows, not over the table. A vessel with more than 500 inventory items reports
low-stock figures that are simply wrong, with no indication.

The opposite problem sits alongside it: the pages with no cap at all — risks/page.tsx:30,
financials/page.tsx:22, dashboard/page.tsx:58 and :76, jobs/page.tsx:50, drawings/page.tsx:16,
approvals/page.tsx:33 — load the entire table.

Impact:

A user scrolls to the bottom of the change-order list, sees 200 rows and concludes that is all there
are. Row 201 exists and is unreachable through the UI; the only way to find it is the search box,
which has its own `take`. The derived counts on the inventory page are presented as facts about the
vessel's stock and are wrong past the cap. Neither failure produces an error, a warning or a log line.

Suggested fix:

Add cursor or offset pagination with a page-size selector, and show `n of m` using a companion
`count()` so truncation is visible. Compute summary figures with `groupBy`/`count` against the
database rather than over the fetched page. Put a bounded `take` on the pages that have none.

---

### [MODELS] — Four of the 46 models are unreferenced; eight more are read but never written
Severity: Medium
Location: prisma/schema.prisma:277-341, 425-434, 486-496, 727-737, 784-787
Found by: data-api

Description:

Checked every model for `prisma.<model>.` access in src/ and in prisma/seed.ts / prisma/seedJobs.ts,
plus relation-include reads.

**Never read and never written anywhere (4):**

| Model | Line | Note |
|---|---|---|
| CostCode | 277 | referenced only by `PurchaseOrder.costCodeId`, itself an unconstrained string |
| PurchaseOrder | 314 | `Supplier.pos` relation exists but is never included |
| Invoice | 328 | `Supplier.invoices` relation exists but is never included |
| Setting | 784 | key/value store, no reader and no writer |

**Read through a relation include but never written (4):**

| Model | Line | Read at |
|---|---|---|
| DrawingRevision | 425 | drawings/page.tsx:17, 93-106 |
| MeetingAction | 486 | meetings/page.tsx:17 |
| JobVariation | 727 | jobs/[id]/page.tsx:54, 107-108, 247-254; print/jobs/[id]/page.tsx:38 |
| Approval | 248 | approvals/page.tsx:57, dashboard/page.tsx:43 |

`JobVariation` is the notable one. The schema comment calls it "Variation certificate detail,
present only on a variation", `Job.contractType` defaults to `"VARIATION_CERTIFICATE"` (line 654),
and the detail page renders a whole block for it (jobs/[id]/page.tsx:247-254) including the staged
`invoicingTerms`. Nothing ever creates the row — `issueQuote` writes `lines` and `notes` but never
`variation` — so that block never appears, on the contract type the system uses by default.

`Approval` is the same shape: the "Other Approvals (POs, Drawings, Schedule, Access...)" section of
the approvals page and the `approvalsPending` dashboard stat both query it, and no code path
anywhere inserts a row. Both render a permanent empty state / zero.

**Read-only, no write path in app or seed (a further 8):** ScheduleTask, LogisticsItem, Document,
Drawing, Contractor, Supplier, Meeting, and InventoryItem beyond the seed. Their pages exist and
query correctly but nothing can add to them through the UI.

Impact:

12 tables (26% of the schema) carry no write path, so the screens above them are permanently empty
or permanently zero with no explanation to the user. Four are entirely dead weight — they appear in
the generated client, in migrations, and in any schema review, suggesting capability that does not
exist. `JobVariation` and `Approval` are worse than dead because the UI actively reserves space for
data that can never arrive.

Suggested fix:

Delete CostCode, PurchaseOrder, Invoice and Setting from the schema, or mark them clearly as
Phase-N placeholders in a comment block so a reader is not misled. Either build the `JobVariation`
write into `issueQuote` (the form has the fields) or remove the render block until it exists. Same
for the `Approval` queue: populate it or hide the section.

---

### [VALIDATION] — The acceptance attempt counter is a non-atomic read-modify-write
Severity: Medium
Location: src/app/(app)/jobs/[id]/accept/actions.ts:144-159
Found by: data-api

Description:

    if (!verifyAcceptanceCode(challengeId, code, challenge!.codeHash)) {
      const attempts = challenge!.attempts + 1;
      await prisma.acceptanceChallenge.update({ where: { id: challengeId }, data: { attempts } });
      ...
    }

`challenge.attempts` was read at line 136 and the new value is computed in JS and written back.
`MAX_CHALLENGE_ATTEMPTS` is 5 (src/lib/jobs/acceptance.ts:13) and the lock-out check is
`challenge.attempts >= MAX_CHALLENGE_ATTEMPTS` inside `challengeProblem` (line 62), evaluated at
line 141 against the value read at the start of the request.

Requests issued in parallel all read the same `attempts` and all write the same `attempts + 1`, so N
concurrent guesses advance the counter by 1. The rest of the design is careful — the code is hashed
and bound to the challenge id (acceptance.ts:26-29), compared with `timingSafeEqual`, the challenge
has a 10-minute TTL, and the quote fingerprint is re-verified at line 163 — which makes the counter
the only rate limit on a 6-digit code, and the only part of the mechanism that does not hold under
concurrency. There is no other throttle on the action.

Impact:

The lock-out that limits a 6-digit code to 5 guesses can be widened by guessing in parallel. With a
10-minute window and no other rate limiting, an attacker who can reach the action with a valid
`JOB_ACCEPT` session gets materially more than 5 attempts at 1-in-1,000,000. The prize is
`CLIENT_ACCEPTED` on a quote — a signature on money, which is exactly what the challenge exists to
protect.

Suggested fix:

Make the increment atomic and read the result:
`const updated = await prisma.acceptanceChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });`
then test `updated.attempts > MAX_CHALLENGE_ATTEMPTS` and refuse. Do the increment *before*
verifying the code so a crash cannot skip it, and add a short per-user rate limit on the action
independent of the counter.

---

### [EXPOSURE] — Notification fan-out is global rather than project-scoped
Severity: Medium
Location: src/app/(app)/jobs/actions.ts:128-142, src/app/(app)/jobs/[id]/accept/actions.ts:232-250, src/app/(app)/change-orders/actions.ts:116-130
Found by: data-api

Description:

Three places select recipients purely by permission, with no project filter:

    // jobs/actions.ts:128-134 — every user in the system who can issue a quote
    const yardUsers = await prisma.user.findMany({
      where: { active: true, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.JOB_ISSUE_QUOTE } } } } } } },
      select: { id: true },
    });
    await notify({ userIds: yardUsers.map((u) => u.id), ..., title: `New quote request ${code}: ${data.title}` });

`UserRole` carries `projectId` and `vesselId` (prisma/schema.prisma:70-71) precisely so a role can
be scoped to one project, and `listProjectsForUser` uses them. These three queries match on the
role's permissions and ignore the scope columns entirely. The same pattern appears at
accept/actions.ts:232-242 (`JOB_COUNTERSIGN`) and change-orders/actions.ts:116-122 (the stage
permission for the first pending approval).

The notification titles carry business content: "New quote request D.0130.05: Replace starboard
shaft seal", "${job.code} accepted by the client — ready to countersign", "Approval required:
CO-0012 (FINANCE)".

Impact:

A quote request raised on one owner's vessel notifies every yard-side user across every project in
the system, with the job code and title in the notification body. Yards handling several owners
concurrently — the normal case, and the case this product is built for — leak each client's scope of
work to staff assigned to a different client. It also makes the notification inbox unusable at
scale: `notify` writes one `Notification` row per recipient per event
(src/lib/notifications.ts:27-37), so the table grows by the size of the whole permission-holding
population on every event — the same table the unindexed `unreadCount` scans on every page render.

Suggested fix:

Add the project scope to the recipient query:

    roles: { some: { AND: [
      { role: { permissions: { some: { permission: { key: ... } } } } },
      { OR: [{ projectId: project.id }, { projectId: null, vesselId: project.vesselId }] },
    ] } }

so an unscoped role still receives, but a role bound to another project does not. Apply to all three.

---

### [SCHEMA] — Attachment can have neither a storage key nor a URL
Severity: Low
Location: prisma/schema.prisma:557-583
Found by: data-api

Description:

    model Attachment {
      storageKey    String?
      url           String?
      ...
    }

Both are nullable, with a comment explaining that `url` "stays for externally hosted files recorded
before object storage existed". Nothing requires at least one. A row with both null is a valid
`Attachment` that points at no bytes.

`attachUploads` (jobs/actions.ts:531-543) always writes `storageKey` and never `url`, so today every
row has one — but it is a convention held by one call site, not a constraint.

The same model is polymorphic in two ways at once: `resource`/`resourceId` as free strings, *and*
three nullable typed FKs (`changeOrderId`, `crewRequestId`, `jobId`, lines 566-568). Nothing enforces
that they agree — `resource: "Job"` with `changeOrderId` set and `jobId` null is storable.
`attachUploads` sets both consistently at line 539-540
(`jobId: resource === "Job" ? resourceId : null`) but again by convention only. `Comment`
(lines 536-555) has the identical dual shape and the identical gap.

Impact:

A file row that references nothing, or whose typed FK disagrees with its string discriminator,
renders as a broken attachment with no way to tell which is authoritative. Any future importer or
second writer will produce these, and nothing will reject them.

Suggested fix:

Add a CHECK: `CONSTRAINT attachment_has_target CHECK (("storageKey" IS NOT NULL) OR ("url" IS NOT NULL))`,
and a second requiring exactly one of the three typed FKs to be non-null — with a matching constraint
tying `resource` to whichever is set. Same for `Comment`. Longer term, drop the `resource`/`resourceId`
string pair, since the typed FKs already carry the information and are the ones the database can
actually enforce.

---

### [QUERIES] — The notifications page writes on render
Severity: Low
Location: src/app/(app)/notifications/page.tsx:27-34
Found by: data-api

Description:

    const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
    const unreadIds = items.filter((i) => !i.readAt).map((i) => i.id);
    if (unreadIds.length) await markRead(user.id, unreadIds);

The page component performs an `updateMany` (src/lib/notifications.ts:51-54) as a side effect of
rendering. There is also an explicit `markAllRead` server action right above it (line 13-19) doing
the same job properly, so the write has a correct home already.

Because the route is `force-dynamic`, the render runs on every navigation, every refresh and any
speculative prefetch of `/notifications` — each of which marks the user's notifications read whether
or not they ever saw the page. The `take: 200` also means only the newest 200 are marked, so the
unread badge from `unreadCount` (which counts all of them) can stay non-zero after the user has
visited and apparently cleared the page.

Impact:

Notifications are marked read by a prefetch the user never saw, so genuinely unread items disappear
from the badge without being read. Conversely, with more than 200 unread the badge never clears no
matter how often the page is opened. A GET that mutates is also non-idempotent in a way nothing else
in this codebase is.

Suggested fix:

Remove the write from the component body. Mark items read from the existing `markAllRead` action
(triggered by the button already on the page), or from an explicit per-item action, so the mutation
follows a user's intent rather than a render. Have `markAllRead` use `updateMany` over the whole
unread set rather than a fetched page of ids.

---

### [ERRORS] — Two incompatible failure conventions across server actions
Severity: Cosmetic
Location: src/app/(app)/jobs/actions.ts:67,168-169; src/app/(app)/admin/projects/actions.ts:29,40,49-51; vs src/app/(app)/change-orders/actions.ts:31,65,148,150; src/app/(app)/crew-requests/actions.ts:16,53,72
Found by: data-api

Description:

The newer actions signal failure by redirecting back to the form with a human message:

    // jobs/actions.ts:67
    redirect(`/jobs/new?err=${encodeURIComponent(parsed.error.errors[0].message)}`);
    // jobs/actions.ts:168-169
    const back = (message: string) => redirect(`/jobs/${jobId}/quote?err=${encodeURIComponent(message)}`);

The older ones throw:

    // change-orders/actions.ts:31
    throw new Error("Invalid change order: " + parsed.error.errors.map((e) => e.message).join(", "));
    // crew-requests/actions.ts:53
    throw new Error("Crew request not found");

Both appear in the same directory tree and sometimes in the same file — `createJobRequest` redirects
while `loadJob` in the same module throws (jobs/actions.ts:27, 31). The severity is cosmetic in
isolation; its consequence is not, and is filed separately under the missing error boundary above.

A smaller inconsistency sits alongside: jobs/actions.ts:67 surfaces only
`parsed.error.errors[0].message` — the first problem — while change-orders/actions.ts:31 joins all of
them. A user fixing a form one field at a time gets a different experience on each screen.

Impact:

Two conventions mean every new action is a coin flip, and a reviewer cannot tell by looking whether a
given failure reaches the user as a message or as a blank error page. The first-error-only variant
makes multi-field forms a guessing game.

Suggested fix:

Pick one — the redirect-with-`?err=` pattern is the one that currently works — and convert the
change-order and crew-request actions to it. Better still, return `{ ok: false, fieldErrors }` and
render per-field messages with `useFormState`, so all problems surface at once and the form keeps its
values.

---

## Orchestrator verification

**Corrected.** `[EXPOSURE] — … the change-order export ignores project scope`. The export route
does scope: `src/app/api/export/change-orders/route.ts:35` calls `getActiveProject(user.id)` and
passes it to `loadRows(project?.id)`, which filters on `projectId` when one is present.

The real defect is narrower and still real. `loadRows` reads
`where: projectId ? { projectId } : undefined`, and `getActiveProject` returns `null` only for a
user who can reach no project at all (`src/lib/project.ts:70-88`). For that user the ternary
falls to `undefined` and the export returns **every change order in the database**. A
zero-project user who holds `change_order.view` therefore gets the whole estate in one
spreadsheet. The fix is to return an empty sheet, not an unfiltered query, when no project
resolves.

Separately, `loadRows` has no `archivedAt: null` term, so archived change orders are exported
alongside live ones — not in the original finding.

The wider claim in that finding — that the **list pages and search** ignore project scope — is
confirmed and stands; it was verified independently in `findings-auth-security.md`.
