# Performance audit — OceancOS

Sub-agent: `performance`. Scope: bundle size, render cost, query efficiency as it
affects page latency, image handling, and anything that degrades as data grows.

Method: `npm run build` (Next.js 14.2.35, exit 0), static read of every route and
`src/lib`, schema and index inspection against the local Postgres dev database
(`oceancos`, all 47 tables currently at 0 rows — so query counts below are derived
from the code path, not from a live trace; they are exact counts of Prisma calls
per render, and are noted as such).

---

### [QUERY] — Jobs list loads the entire Job table: no `take`, no `orderBy`, sorted in Node
Severity: High
Location: src/app/(app)/jobs/page.tsx:50-57
Found by: performance

Description:
The main list query is unbounded and unordered:

```
prisma.job.findMany({
  where,
  include: {
    section: true,
    favourites: { where: { userId: user.id }, select: { userId: true } },
    _count: { select: { comments: true } },
  },
})
```

There is no `take`, no `skip`, no `orderBy` and no pagination UI anywhere on the
page. Ordering is done afterwards in JavaScript by `groupJobs(jobs, compareJobCodes)`
(jobs/page.tsx:70), and the page total by `jobs.reduce(...)` (jobs/page.tsx:71). The
default view is "Pending" (`src/lib/jobs/views.ts:80`), but the "Worklist" view sets
`statuses: null` (views.ts:75), so `jobWhere` applies only `projectId` and
`archivedAt: null` — every non-archived job in the project, in one result set.

Because the ordering happens in Node, adding `take` later is not a one-line change:
a `take` without a matching `orderBy` in SQL would return an arbitrary subset. The
two have to be fixed together.

The `include` multiplies the cost. Prisma 5 resolves `include` with a separate SQL
statement per relation, so this one call is a job query plus a `JobSection` query
plus a `JobFavourite` query plus a correlated `COUNT` over `Comment` — and the
`_count` on comments is the expensive one, because `Comment` is indexed on `jobId`
but the aggregate still has to touch one index range per job row returned.

Impact:
A superyacht refit is exactly the shape of project this breaks on. A real MB92-style
worklist runs 2,000–5,000 job lines per yard period, each with a section join and a
comment count; the "Worklist" view serialises all of them into one HTML document
with a `<tr>` per job (jobs/page.tsx:241-314). At 3,000 jobs that is roughly 3,000
rows × ~5 badges and links each — on the order of 4–8 MB of HTML streamed on every
navigation to `/jobs`, plus the React server-render cost of ~20,000 elements, plus
the JS-side sort and grouping. The page is `force-dynamic`, so this is paid in full
on every single request by every user, with no cache to absorb it.

Suggested fix:
Push ordering into the database and bound the result. `compareJobCodes` sorts on a
structured code (`X.NNNN.NN-NN`); either store a sortable `codeSort` column written
on create/update, or `orderBy: [{ groupCode: "asc" }, { code: "asc" }]` which is
close enough for a zero-padded scheme and is already backed by
`Job_projectId_groupCode_idx`. Then add `take: 100` plus cursor or offset pagination,
and move the grand total to a `prisma.job.aggregate({ _sum: { total: true }, where })`
so it stays correct on a paged list. Replace `_count: { select: { comments: true } }`
with a single `groupBy` over `Comment` for the page's job ids.

---

### [QUERY] — Jobs list fires seven separate `COUNT` queries, one per sub-view, on every render
Severity: High
Location: src/app/(app)/jobs/page.tsx:59-66
Found by: performance

Description:
The sub-view tab counts are built by mapping over `JOB_VIEWS` and awaiting a
`prisma.job.count` per view:

```
Promise.all(
  JOB_VIEWS.map(async (v) => ({
    key: v.key,
    count: await prisma.job.count({
      where: jobWhere({ projectId: project.id, view: v }),
    }),
  }))
)
```

`JOB_VIEWS` has seven entries (views.ts:33-77), so this is seven `SELECT COUNT(*)`
statements against `Job`, every render, unconditionally — they run even when the
user has filtered to one section or typed a search, because `jobWhere` here is
called *without* `q`, `sectionLetter` or `favouriteOf`, so the counts are always
whole-project counts.

Six of the seven are status-predicate counts that `Job_projectId_status_idx` can
serve, but "worklist" (`statuses: null`) has no status predicate and is a full scan
of the project's jobs. "purchases" adds `contractType IN (...)` which no index
covers, so that one filters on the heap after the index scan.

Together with the main query, the section query and the repeated auth/project
resolution, a single `/jobs` render issues **22 Prisma calls**:

| Source | Calls |
|---|---|
| `(app)/layout.tsx` — `requireUser` | 1 |
| `(app)/layout.tsx` — `unreadCount` | 1 |
| `(app)/layout.tsx` — `listProjectsForUser` | 2 |
| `(app)/layout.tsx` — `getActiveProject` | 4 |
| `jobs/page.tsx` — `requireUser` (again) | 1 |
| `jobs/page.tsx` — `getActiveProject` (again) | 4 |
| `jobs/page.tsx` — `job.findMany` | 1 |
| `jobs/page.tsx` — `jobSection.findMany` | 1 |
| `jobs/page.tsx` — `job.count` × 7 | 7 |

Impact:
Seven round trips that carry four numbers each. On a managed Postgres with a 5–15 ms
round trip, the counts alone add 35–105 ms of pure latency if the pool serialises
them, and seven concurrent connections off the pool if it does not — which matters,
because `src/lib/db.ts:5-9` configures no `connection_limit`, so Prisma defaults to
`num_cpus × 2 + 1` per process. Two concurrent `/jobs` users can saturate a small
pool with count queries alone. The cost also grows with the table: at 3,000 jobs the
"worklist" count is a 3,000-row scan repeated on every keystroke-driven search
submit and every tab click, for a number that does not change with the filter.

Suggested fix:
Replace all seven with one grouped query and derive the view counts in memory:

```
const byStatus = await prisma.job.groupBy({
  by: ["status", "contractType"],
  where: { projectId: project.id, archivedAt: null },
  _count: { _all: true },
});
```

That is a single indexed aggregate. Then compute each view's count from `byStatus`
using the same `JOB_VIEWS` definitions — `worklist` is the sum of every group,
`purchases` is the subset where `contractType === "PURCHASE"`, and the rest are sums
over their `statuses` array. One round trip instead of seven, and the counts still
cannot drift from the view definitions because they are derived from the same
`JOB_VIEWS` constant.

---

### [QUERY] — Job detail page loads the complete comment, history and attachment trail with no limit
Severity: High
Location: src/app/(app)/jobs/[id]/page.tsx:46-63
Found by: performance

Description:
The detail query pulls five unbounded child collections in one `findUnique`:

```
lines:       { orderBy: { sort: "asc" } },
notes:       { orderBy: [{ kind: "asc" }, { sort: "asc" }] },
history:     { orderBy: { createdAt: "desc" } },          // no take
comments:    { orderBy: { createdAt: "asc" },
               include: { attachments: true } },          // no take
attachments: { orderBy: { createdAt: "desc" } },          // no take
```

None has a `take`. `history` accumulates a `JobHistory` row on every status change
and every progress update (`jobs/actions.ts:386-387`, `:436-437`, `:494-495`), and
`comments` accumulates for the life of the job with its attachments eagerly joined.

The same pattern repeats on the sibling detail pages:
- src/app/(app)/change-orders/[id]/page.tsx:40-48 — `approvals`, `history`, `comments`, all unbounded
- src/app/(app)/crew-requests/[id]/page.tsx:21-28 — `comments` unbounded

Impact:
Unlike a list page, this one has no natural ceiling — a single contested variation on
a refit will carry hundreds of comments and a history row per transition, and every
one is fetched and rendered on every view of the job, forever. The page is
`force-dynamic`, so there is no cached copy. A job with 400 comments and 200 history
rows renders 600 extra DOM sections per request, and the `comments.attachments`
include turns into a second query over `Attachment` for the whole comment set.

This is also the input to a second query — the page derives its author list from
`job.comments` and `job.history` (jobs/[id]/page.tsx:69-86), so the unbounded fetch
propagates into the `user.findMany` that follows it.

Suggested fix:
`take` the most recent N on each collection (`history: { take: 20 }`,
`comments: { take: 50 }`) and add a "show earlier" control that pages the rest, or
move comments and history behind their own paginated route segment. Add
`@@index([jobId, createdAt])` to `JobHistory` and `Comment` so the bounded query is
an index scan rather than a scan-then-sort.

---

### [QUERY] — Dashboard issues 24 Prisma calls per load, five of them in an avoidable sequential chain
Severity: High
Location: src/app/(app)/dashboard/page.tsx:33-80
Found by: performance

Description:
The page opens well — eight queries batched in one `Promise.all` (dashboard/page.tsx:33-55) —
and then abandons the pattern. Everything after it is a separate `await` on its own line:

- :58 `const budgets = await prisma.budget.findMany();`
- :65 `const myApprovals = await prisma.changeOrderApproval.findMany({...})`
- :74 `const activeProject = await getActiveProject(user.id);` — itself 4 queries
- :76 `const changeOrders = await prisma.changeOrder.findMany({...})`

Only the last one genuinely depends on a previous result (`activeProject.id` at :77).
`budgets` and `myApprovals` depend on nothing and could join the opening `Promise.all`;
`getActiveProject` depends only on `user.id`, which is available at :31.

Full call count for one `/dashboard` render:

| Source | Calls |
|---|---|
| `(app)/layout.tsx` (auth + unread + projects + active project) | 8 |
| `dashboard/page.tsx` — `requireUser` (again) | 1 |
| `dashboard/page.tsx` — opening `Promise.all` | 8 |
| `dashboard/page.tsx:58` — `budget.findMany` | 1 |
| `dashboard/page.tsx:65` — `changeOrderApproval.findMany` | 1 |
| `dashboard/page.tsx:74` — `getActiveProject` (again) | 4 |
| `dashboard/page.tsx:76` — `changeOrder.findMany` | 1 |
| **Total** | **24** |

Two of those queries are unbounded. `prisma.budget.findMany()` at :58 has no `where`
and no `take` — every budget row in the system, across every project and every vessel,
reduced five times in JS at :59-63 to produce five totals. And `changeOrder.findMany`
at :76 fetches every change order for the active project with no `take`, then filters
it four separate times in memory (:94, :103, :128, :137) to build the donut, the
progress ring and the two cumulative series.

Impact:
Five sequential round trips where two would do — at a 10 ms RTT that is ~40 ms of
dead time added to the slowest page in the app, before any query executes. The
unbounded reads are the part that degrades: a multi-vessel deployment's `Budget`
table is read whole on every dashboard load by every user, and the `ChangeOrder`
fetch grows linearly with the project, pulling four columns × every CO across the
wire to compute four scalars and two time series that Postgres could compute itself.
`ChangeOrder` has no index on `projectId` or `status` (see the index finding), so
this is a sequential scan of the table every time.

Suggested fix:
Three changes, in order of value:
1. Replace the five `budgets.reduce` calls with one `prisma.budget.aggregate({ _sum: {...}, where: { projectId } })` — the page never uses an individual budget row, only the sums, and the missing `where` looks like an outright bug.
2. Replace the `changeOrders.filter(...).length` donut with `prisma.changeOrder.groupBy({ by: ["status"], _count: true, where: { projectId } })`, and keep a bounded `findMany` (`select`, `take`) only for the cumulative series — or move that to a date-bucketed `groupBy` too.
3. Fold `budget.aggregate`, `changeOrderApproval.findMany` and `getActiveProject` into the opening `Promise.all`, leaving one dependent `await` for the project-scoped queries. That takes the page from 5 sequential stages to 2.

---

### [QUERY] — `requireUser` and `getActiveProject` are re-resolved per segment; 7 of 22 queries on `/jobs` are exact duplicates
Severity: High
Location: src/lib/auth.ts:47-79, src/lib/project.ts:28-90, src/app/(app)/layout.tsx:7-13
Found by: performance

Description:
Neither helper is wrapped in React's `cache()` — `grep -rn "cache(" src/lib` returns
nothing — so every call re-executes against the database. Three separate duplications
compound:

1. **`requireUser` runs twice per request.** `(app)/layout.tsx:8` calls it, and then
   every page under that layout calls it again (`jobs/page.tsx:29`, `dashboard/page.tsx:31`,
   and so on for all 24 app pages). `getCurrentUser` (auth.ts:47-75) is a
   `session.findUnique` with a four-level nested `include` — session → user → roles →
   role → permissions → permission. Prisma 5 resolves each relation level as its own
   SQL statement, so this single Prisma call is roughly five or six round trips to
   Postgres, and it happens twice.

2. **`getActiveProject` calls `listProjectsForUser` internally** (project.ts:79),
   while `(app)/layout.tsx:9-13` *also* calls `listProjectsForUser` directly in the
   same `Promise.all`. Both run. `getActiveProject` is therefore 4 queries
   (session lookup at :76, userRole at :29, project.findMany at :51, project.findUnique
   at :85), of which 2 duplicate the layout's own call.

3. **Pages call `getActiveProject` a third time.** `jobs/page.tsx:34` and
   `dashboard/page.tsx:74` each re-run the whole 4-query sequence the layout just ran.

Net for `/jobs`: 22 Prisma calls, of which 7 are byte-identical repeats — the session
lookup, and two full `listProjectsForUser` + project resolution sequences.

The `project.findMany` inside `listProjectsForUser` (project.ts:51) is itself
unbounded and includes the vessel, so an unscoped owner-side user (the documented
common case, project.ts:24-25) loads every active project with its vessel, two or
three times per page view.

Impact:
Roughly a third of the database work on every authenticated page is redundant, and it
is redundant on the *hot path* — it is paid before any page-specific query starts, by
every user, on every navigation, with `force-dynamic` guaranteeing no cache absorbs
it. The session query is the worst offender because of its four-level include: at ~6
SQL statements per call and 2 calls per request, that is ~12 statements just to
establish who is asking.

Suggested fix:
Wrap all three in React's per-request memo — this is exactly what it is for:

```
import { cache } from "react";
export const getCurrentUser = cache(async () => { ... });
export const listProjectsForUser = cache(async (userId: string) => { ... });
export const getActiveProject = cache(async (userId: string) => { ... });
```

`cache()` dedupes within a single render pass, so layout and page share one result
and the count drops from 22 to ~13 on `/jobs` with no behavioural change. Separately,
flatten `getCurrentUser`'s include: select the permission keys with one `findMany`
over `RolePermission` joined by role id rather than a four-level nest, and add
`take`/`select` to `listProjectsForUser`'s project query.

---

### [QUERY] — Seven list pages read an entire table with no `take`
Severity: High
Location: multiple — see table
Found by: performance

Description:
Every one of these is a whole-table read on a `force-dynamic` page, with the filtering
and counting done afterwards in JavaScript:

| Route | Line | Query | Grows with |
|---|---|---|---|
| `/risks` | src/app/(app)/risks/page.tsx:30 | `risk.findMany({ orderBy: [...] })` — no `where`, no `take` | every risk, **all projects** |
| `/drawings` | src/app/(app)/drawings/page.tsx:16 | `drawing.findMany({ include: { revisions: { orderBy } } })` | every drawing **× every revision** |
| `/financials` | src/app/(app)/financials/page.tsx:22 | `budget.findMany({ include: { category, project: { include: { vessel } } } })` | every budget, all projects |
| `/suppliers` | src/app/(app)/suppliers/page.tsx:10 | `supplier.findMany({ where: { archivedAt: null } })` | every supplier |
| `/contractors` | src/app/(app)/contractors/page.tsx:15 | `contractor.findMany({ where: { archivedAt: null } })` | every contractor |
| `/schedule` | src/app/(app)/schedule/page.tsx:133 | `milestone.findMany({ orderBy: { date: "asc" } })` | every milestone (tasks beside it correctly use `take: 200`) |
| `/admin` | src/app/(app)/admin/page.tsx:17-20 | four unbounded `findMany` — users **with nested roles→role**, vessels, projects, departments | users × roles |

Two more in form pages, which matter because they are on the create path:
- src/app/(app)/change-orders/new/page.tsx:16-17 — `project.findMany` + `vesselArea.findMany`, both unbounded, both sequential rather than in a `Promise.all`
- src/app/(app)/jobs/new/page.tsx:44 — every open `ChangeOrder` for the project, no `take`

And one on a detail page:
- src/app/(app)/crew-requests/[id]/page.tsx:31 — `prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } })` with **no `select`**, loading every column of every active user (including `passwordHash`) purely to build a `Map` of id → name for the comment authors on one request.

`/schedule` is the clearest illustration of the inconsistency: line 132 caps tasks at
200, line 133 immediately below it caps nothing.

Impact:
`/risks`, `/financials` and `/drawings` have no project scope at all, so they get
slower for *every* tenant as *any* tenant adds data — a multi-vessel deployment
degrades globally. `/drawings` is the sharpest: the `revisions` include means the
result set is drawings × revisions, and a drawing under class review accumulates a
dozen revisions, so a 500-drawing register fetches several thousand rows to render a
list. `/admin`'s user query nests `roles → role`, which Prisma resolves as extra
statements per user. None of these has pagination, so there is no user-facing escape
valve either.

`crew-requests/[id]` is a correctness smell as well as a performance one: pulling
`passwordHash` into a page render is needless exposure.

Suggested fix:
Add `take` plus pagination to each list route, and a `projectId` filter to `/risks`,
`/financials` and `/drawings` — the active project is already resolved in the layout.
Replace the in-JS summary counts (`risks.filter(r => r.rating >= 15).length` at
risks/page.tsx:32-35, `drawings.filter(...)` at drawings/page.tsx:22-24,
`items.filter(...)` at contractors/page.tsx:18) with `groupBy` aggregates so the
summary strip stays accurate on a paged list. For `crew-requests/[id]:31`, scope the
query to the author ids actually present and add `select: { id: true, name: true }` —
the pattern already used correctly at change-orders/[id]/page.tsx:59 and jobs/[id]/page.tsx:69.

---

### [DB] — Core workflow tables carry no indexes beyond their primary key
Severity: High
Location: prisma/schema.prisma (ChangeOrder :155, CrewRequest :216, Approval :248, AuditLog :585, Notification :520, Comment :536)
Found by: performance

Description:
Verified against the live dev database (`pg_indexes`, 74 indexes over 47 tables): the
`Job` family is indexed thoughtfully — `Job_projectId_status_idx`,
`Job_projectId_groupCode_idx`, `JobLine_jobId_idx`, `JobNote_jobId_kind_idx`,
`JobHistory_jobId_idx`, `Comment_jobId_idx`, `Attachment_jobId_idx`. The rest of the
schema has only primary keys and uniqueness constraints.

Every one of these hot predicates is therefore a sequential scan:

| Query | Location | Missing index |
|---|---|---|
| `changeOrder.count({ where: { status: { notIn: [...] } } })` | dashboard/page.tsx:35 | `ChangeOrder(projectId, status)` |
| `changeOrder.count({ where: { status: { in: [...] } } })` | dashboard/page.tsx:36-38 | same |
| `crewRequest.count({ where: { status: { notIn: [...] } } })` | dashboard/page.tsx:39 | `CrewRequest(projectId, status)` |
| `crewRequest.count({ where: { dueDate: { lt: now }, status: {...} } })` | dashboard/page.tsx:40-42 | `CrewRequest(status, dueDate)` |
| `approval.count({ where: { status: "PENDING" } })` | dashboard/page.tsx:43 | `Approval(status)` |
| `auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 })` | dashboard/page.tsx:54 | `AuditLog(createdAt)` |
| `auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 })` | admin/page.tsx:22 | same |
| `notification.count({ where: { userId, readAt: null } })` | src/lib/notifications.ts:58 | `Notification(userId, readAt)` |
| `changeOrderApproval.findMany({ where: { decision: "PENDING", stage: {...} } })` | approvals/page.tsx:33-41, :45 | `ChangeOrderApproval(decision, stage)` |
| `changeOrder.findMany({ where: { projectId } })` | dashboard/page.tsx:76 | `ChangeOrder(projectId, createdAt)` |

The `AuditLog(createdAt)` and `Notification(userId, readAt)` gaps are the ones that
will bite first, because both tables grow monotonically and are never pruned —
`recordAudit` (src/lib/audit.ts:24) inserts on every state change and nothing ever
deletes.

Impact:
`unreadCount` runs in the app layout (`(app)/layout.tsx:10`), which means **every
authenticated page view in the application** performs a sequential scan of
`Notification` that gets slower for every notification ever created for every user.
Similarly the dashboard's top-10 audit query is `ORDER BY createdAt DESC LIMIT 10`
over an unindexed, ever-growing table — Postgres must scan and sort the whole log to
return ten rows. At 100,000 audit rows (reachable inside a year on a busy refit) that
is a scan-and-top-N on every dashboard load. The five dashboard counts are five
sequential scans of `ChangeOrder`, `CrewRequest` and `Approval` on each load.

Suggested fix:
Add to `prisma/schema.prisma` and migrate:

```
model ChangeOrder         { @@index([projectId, status]) @@index([projectId, createdAt]) }
model CrewRequest         { @@index([projectId, status]) @@index([status, dueDate]) }
model Approval            { @@index([status, createdAt]) }
model AuditLog            { @@index([createdAt]) @@index([resource, resourceId]) }
model Notification        { @@index([userId, readAt]) }
model ChangeOrderApproval { @@index([decision, stage]) @@index([changeOrderId]) }
model Comment             { @@index([resource, resourceId]) @@index([jobId, createdAt]) }
```

`Notification(userId, readAt)` is the single highest-value line — it takes a
per-request sequential scan off the layout for every page in the app. Separately,
plan a retention policy for `AuditLog`: archive or partition by month.

---

### [QUERY] — Global search runs seven leading-wildcard `ILIKE` scans across seven unindexed tables
Severity: Medium
Location: src/app/(app)/search/page.tsx:46-73
Found by: performance

Description:
The search page issues seven parallel `findMany` calls, each using `contains` with
`mode: "insensitive"` — which Prisma compiles to `column ILIKE '%term%'`:

```
changeOrder:   title | number | description   (:46-49)
crewRequest:   title | number | description   (:52-55)
drawing:       title | number                 (:58-61)
document:      name                           (:64)
supplier:      name                           (:66)
contractor:    name                           (:68)
inventoryItem: name | serial                  (:71)
```

Each is capped at `take: 20`, which is good, but a leading-wildcard `ILIKE` cannot
use a B-tree index under any circumstances, and `pg_trgm` is not installed — I
checked: `select extname from pg_extension` returns only `plpgsql`. So all seven are
unavoidable sequential scans, and the `take: 20` does not help because Postgres must
still scan until it finds 20 matches, which for a rare term means the whole table.

The same `contains` + `mode: "insensitive"` pattern drives the jobs list search
(src/lib/jobs/views.ts:109-114), where it ORs across four columns of `Job` and is
combined with the unbounded query in the first finding.

Impact:
Seven concurrent sequential scans per search, one per table, each holding a pool
connection. With no `connection_limit` set in `src/lib/db.ts`, a handful of
simultaneous searches can occupy the whole pool with scans. The pain arrives with
`ChangeOrder`, `CrewRequest` and `InventoryItem` — the three tables that actually
grow — and a term with no matches is the worst case, not the best.

Suggested fix:
Install `pg_trgm` and add GIN trigram indexes on the searched columns
(`CREATE INDEX ... USING gin (title gin_trgm_ops)`), which makes `ILIKE '%x%'`
index-backed. Or move to Postgres full-text search with a stored `tsvector` column
and a GIN index, which also gives ranking. Either way, add a minimum term length
(2–3 characters) before issuing any query — currently a one-character search triggers
all seven scans.

---

### [RENDER] — Every page is `force-dynamic`; nothing in the app is cacheable
Severity: Medium
Location: 24 page files under src/app — see description
Found by: performance

Description:
`export const dynamic = "force-dynamic"` appears on all 24 pages plus 6 API routes.
The build confirms the effect — 39 of 40 routes are marked `f (Dynamic)`, and the only
`o (Static)` entry is `/_not-found`:

```
|- f /                                    1.56 kB        98.1 kB
|- o /_not-found                          873 B          88.1 kB
|- f /dashboard                           3.67 kB         100 kB
```

The declaration is largely redundant on authenticated pages — they all call
`requireUser()`, which reads `cookies()`, which opts a route out of static rendering
anyway. Where it is *not* redundant is the two places it actively costs something:

- **`/` (src/app/page.tsx)** — the marketing landing page. It is nine static
  presentational components (Hero, TrustBar, FeatureGrid, Workflow, Stats, Security,
  Roles, CTA, Footer) with no dynamic content at all. It is dynamic only because
  `getCurrentUser()` at :23 checks whether to redirect a signed-in visitor to
  `/dashboard`. Every anonymous visitor therefore pays a server render plus a session
  lookup for a page that is byte-identical for all of them.
- **Mutation-adjacent pages** — `revalidatePath` is already used correctly throughout
  (`jobs/actions.ts:144`, `:305`, `:386-387`; `change-orders/actions.ts:134-136`;
  `_actions.ts:28`), which is the mechanism for cached pages to stay fresh. With
  `force-dynamic` those calls are inert: there is nothing cached to revalidate. The
  codebase has built the invalidation half of a caching strategy and then disabled the
  caching half.

Impact:
Under load, every request to every route runs the full query chain described above —
22 Prisma calls for `/jobs`, 24 for `/dashboard` — with zero amortisation. Ten users
refreshing the dashboard is 240 database calls. There is no shared cache tier, no
stale-while-revalidate, and no static shell; server CPU and database load scale
strictly linearly with page views, and the landing page (the one route with genuine
anonymous traffic) is the least defensible of all.

Suggested fix:
Move the signed-in redirect on `/` into middleware (a cookie-presence check needs no
database round trip) and let the marketing page render statically — it would drop to
a CDN-served document. For the authenticated app, remove the blanket `force-dynamic`
and let `cookies()` mark routes dynamic where they genuinely are; then the reference
pages that are per-project rather than per-user — `/suppliers`, `/contractors`,
`/drawings`, `/schedule` — become candidates for `unstable_cache` keyed on project id,
with the existing `revalidatePath`/`revalidateTag` calls doing the invalidation they
were clearly written to do.

---

### [RENDER] — Sequential awaits that should be one `Promise.all`
Severity: Medium
Location: src/app/(app)/dashboard/page.tsx:58-80, src/app/(app)/jobs/[id]/page.tsx:46-86, src/app/(app)/change-orders/new/page.tsx:16-17, src/app/print/jobs/[id]/page.tsx:31-53
Found by: performance

Description:
The codebase knows the pattern — `(app)/layout.tsx:9`, `jobs/page.tsx:49`,
`jobs/new/page.tsx:28`, `schedule/page.tsx:131`, `admin/page.tsx:16` and
`search/page.tsx:45` all batch correctly. These four do not:

1. **dashboard/page.tsx:58, :65, :74, :76** — four independent `await`s in a row after
   the opening batch. Only `:76` depends on `:74`. Covered in detail in the dashboard
   finding above; five sequential stages where two suffice.

2. **change-orders/new/page.tsx:16-17** —
   `const projects = await prisma.project.findMany(...)` then
   `const areas = await prisma.vesselArea.findMany();` on the very next line. Neither
   depends on the other. Two lines apart, trivially parallel.

3. **jobs/[id]/page.tsx:46 -> :66 -> :69** — `job.findUnique`, then
   `listProjectsForUser(user.id)`, then `user.findMany`. The third genuinely depends on
   the first (it derives author ids from `job.comments` and `job.history`), but
   `listProjectsForUser` at :66 depends only on `user.id` and can run alongside the job
   fetch. Same shape at print/jobs/[id]/page.tsx:31 -> :44 -> :46.

4. **crew-requests/[id]/page.tsx:21 -> :31** — `crewRequest.findUnique` then the
   unbounded `user.findMany`; the second does not depend on the first (it fetches *all*
   active users regardless), so it is a free parallelisation as well as a query that
   should be scoped.

Impact:
Each avoidable sequential stage adds one full database round trip to time-to-first-byte.
On the dashboard that is ~4 wasted round trips; on the three detail pages, one each.
At a 10–15 ms RTT to a managed Postgres, the dashboard alone carries 40–60 ms of pure
serialisation latency on top of query time, on the page users land on after login.

Suggested fix:
Batch the independent pairs:

```
// change-orders/new/page.tsx
const [projects, areas] = await Promise.all([
  prisma.project.findMany({ where: { archivedAt: null }, include: { vessel: true } }),
  prisma.vesselArea.findMany(),
]);

// jobs/[id]/page.tsx
const [job, projects] = await Promise.all([
  prisma.job.findUnique({ ... }),
  listProjectsForUser(user.id),
]);
```

For the dashboard, fold `budget.aggregate`, `changeOrderApproval.findMany` and
`getActiveProject` into the opening `Promise.all` and keep one dependent `await` for
the project-scoped change-order query.

---

### [PDF] — A Chromium process is held open for the life of every server process, and concurrent renders are unbounded
Severity: High
Location: src/lib/export/pdf.ts:24-43, :45-82, :96-103
Found by: performance

Description:
`browser()` caches one Playwright `Browser` in a module-level variable and reuses it
(pdf.ts:24-43). Three consequences follow from the implementation:

1. **The process is never released.** `closePdfRenderer()` exists (pdf.ts:85-88) but
   `grep -rn "closePdfRenderer" src` shows no caller outside tests — no `SIGTERM`
   handler, no idle timeout. Once the first PDF is requested, Chromium stays resident
   until the Node process dies. A headless Chromium baseline is roughly 80–150 MB RSS
   before any page is opened.

2. **`pdfAvailable()` launches it as a side effect.** pdf.ts:96-103 calls `browser()`
   purely to test whether rendering works, and on success leaves the browser running.
   A capability check permanently adds a Chromium process.

3. **Concurrency is unbounded.** `renderPdf` (pdf.ts:45-82) creates a new
   `BrowserContext` and a new `Page` per request with no queue, no semaphore and no
   cap. Each context is a fresh renderer process with its own memory. `waitUntil:
   "networkidle"` with a 30 s timeout (pdf.ts:65) means each one is held for as long as
   the print page takes to settle — and the print page it navigates to
   (`/print/jobs/[id]`, `/print/change-orders/[id]`) is itself a `force-dynamic` route
   that runs its own query chain, including `listProjectsForUser`.

The routes set `maxDuration = 60` (api/export/jobs/[id]/route.ts:10), so a single
request may legitimately occupy a renderer for a full minute.

Impact:
This is safe enough in the sense that Playwright contexts are isolated and the
`finally` block closes each one (pdf.ts:79-81) — a render failure will not leak a
context. The danger is memory under concurrency. Ten users clicking "download PDF"
at once spawns ten renderer processes on top of the ~150 MB base; at roughly
50–100 MB each that is 0.5–1 GB of transient RSS on top of the Node heap. On a
typical 512 MB or 1 GB container that is an OOM kill of the whole server process,
taking every in-flight request with it — not a failed download, a dead instance.
Worse, the render navigates back into the same app over HTTP, so each PDF request
consumes a second application request and a second set of pool connections; a burst
of PDF requests can deadlock against the Prisma pool while holding Chromium memory.

There is also a cold-start cliff: a horizontally scaled deployment pays the ~1 s
launch (acknowledged in the comment at pdf.ts:26-29) on the first PDF per instance,
and `pdfAvailable()` turns any health check into a Chromium launch.

Suggested fix:
Three changes:
1. **Bound concurrency.** Put a semaphore in front of `renderPdf` — 2 or 3 concurrent contexts, with the rest queued and a fast 503 if the queue is deep. This is the change that prevents the OOM.
2. **Release when idle.** Track in-flight renders and close the browser after N minutes of inactivity; register `closePdfRenderer` on `SIGTERM`/`SIGINT` so container shutdown is clean.
3. **Make `pdfAvailable()` non-launching** — probe for the executable path or channel rather than starting a browser.

Longer term, move PDF rendering out of the web process entirely: a queue plus a
dedicated worker keeps Chromium's memory profile off the box that serves requests,
and removes the self-referential HTTP call.

---

### [EXPORT] — Spreadsheet exports fetch unbounded result sets and build the whole workbook in memory
Severity: Medium
Location: src/app/api/export/jobs/route.ts:29-33, src/app/api/export/change-orders/route.ts:14-18, src/lib/export/xlsx.ts:18-30
Found by: performance

Description:
Both export routes fetch without a `take`:

```
// api/export/jobs/route.ts:29
await prisma.job.findMany({
  where: { projectId: project.id, archivedAt: null },
  include: { section: true },
})   // then .sort() in JS at :33

// api/export/change-orders/route.ts:14
prisma.changeOrder.findMany({
  where: projectId ? { projectId } : undefined,     // undefined = every project
  include: { project: { include: { vessel: true } } },
  orderBy: { number: "asc" },
})
```

The change-order export's `where` is `undefined` when no `projectId` query parameter
is supplied, so the default call exports every change order in the system with its
project and vessel joined. `buildWorkbook` (xlsx.ts:18-30) then materialises the whole
sheet in an ExcelJS `Workbook` and returns a single `Buffer`, which the route returns
as one response body.

The lazy `import("exceljs")` at xlsx.ts:23 and the `serverComponentsExternalPackages`
entry in next.config.js are both good — exceljs stays out of the bundle and is only
loaded on demand. The problem is purely the unbounded in-memory materialisation.

Impact:
An export is a deliberate, infrequent action, so this is not a per-request cost — but
it is a memory spike on the same process that serves pages. A 5,000-row job export
with a section join, held as JS objects and then again as an ExcelJS workbook and then
again as a Buffer, is a multi-hundred-megabyte transient allocation. On the same
container that may be holding a Chromium process (previous finding), two users
exporting at once is a plausible OOM. The unscoped change-order export is the sharpest
edge because its size is bounded by the whole deployment rather than one project.

Suggested fix:
Require `projectId` on the change-order export rather than treating its absence as
"everything". Cap both exports (`take: 10_000`) and return a clear error above the
cap rather than attempting it. For genuinely large exports, stream: ExcelJS supports
a streaming workbook writer that writes rows to the response as they are read, which
removes the buffer entirely. Fetch in batches with a cursor rather than one `findMany`.

---

### [UPLOAD] — Local storage driver buffers whole files in memory, and FileDrop uploads every selected file at once
Severity: Medium
Location: src/app/api/uploads/local/route.ts:44-50, :65-75; src/components/ui/FileDrop.tsx:114
Found by: performance

Description:
Two issues on the same path.

**Server.** The local driver reads the entire request body into a Buffer *before*
checking the size limit:

```
const body = Buffer.from(await request.arrayBuffer());   // :44
if (body.byteLength > maxUploadBytes()) {                 // :45
  return NextResponse.json({ error: "File is too large" }, { status: 413 });
}
```

`maxUploadBytes()` defaults to 25 MB (src/lib/storage/keys.ts:26), so the size check
happens only after up to 25 MB — or more, since an oversized body is fully buffered
before being rejected — is already resident. The download path at :65-75 does the same
in reverse: `getObject(key)` reads the whole file into memory and `new Uint8Array(body)`
copies it again before responding.

**Client.** `FileDrop` starts an upload for every pending file simultaneously:

```
next.filter((i) => i.status === "pending").forEach(upload);   // :114
```

No concurrency limit. Each `upload` (FileDrop.tsx:55-94) makes a `POST /api/uploads/sign`
followed by a `PUT`, so selecting 20 drawings fires 20 sign requests and 20 parallel
PUTs.

The architecture is otherwise right — `src/lib/storage/index.ts:11-12` documents that
production uses presigned PUTs straight to R2, so in production the bytes bypass the
Node process entirely, and the local route refuses to run when a bucket is configured
(`localOnly()`, local/route.ts:21-26). The exposure is development, CI, and any
deployment that ships without `S3_BUCKET` set.

Impact:
With the local driver, 20 parallel 25 MB uploads is up to 500 MB of concurrent Buffer
allocation in the web process — an immediate OOM on a small container. Even in
production with S3, the unbounded client fan-out means 20 concurrent
`POST /api/uploads/sign` requests, each of which runs `getCurrentUser()` (a four-level
nested session query) and takes a pool connection; that is a self-inflicted burst
against the Prisma pool from a single user dragging a folder onto the page.

Suggested fix:
On the client, cap concurrency to 3–4 with a small work queue rather than `forEach`.
On the server, reject on `Content-Length` before reading the body, and stream the PUT
to disk with `pipeline(request.body, createWriteStream(path))` rather than buffering;
stream the GET back with `createReadStream` instead of `readFile`. Also set
`Content-Type` from stored metadata on the download rather than
`application/octet-stream` with a 300-second private cache — as written, every view of
an attachment re-downloads it through the Node process.

---

### [BUNDLE] — Client bundle is small and correctly tree-shaken; no action needed
Severity: Cosmetic
Location: build output; src/components/charts/, src/components/ui/FileDrop.tsx
Found by: performance

Description:
Measured from `npm run build` (exit 0, Next.js 14.2.35):

- **Shared first-load JS: 87.3 kB** — `chunks/fd9d1056` 53.6 kB (React + Next runtime) + `chunks/117` 31.7 kB + 1.89 kB other.
- **Largest routes by first-load JS:** `/dashboard` 100 kB (3.67 kB route-specific), `/jobs/new` 99.2 kB (2.7 kB), `/` 98.1 kB (1.56 kB).
- **Smallest:** the two print routes at 87.4 kB (141 B each).
- Every other route sits between 88.1 kB and 96.7 kB, i.e. 0.8–9.4 kB above the shared baseline.
- Total `.next/static/chunks` on disk: 1.1 MB raw. CSS: a single 54 kB stylesheet.

Only six components are `"use client"`:
`src/components/charts/Donut.tsx` (123 lines), `src/components/charts/StepArea.tsx`
(277), `src/components/ui/FileDrop.tsx` (240), `src/components/layout/Sidebar.tsx`
(100), `src/components/layout/ProjectSwitcher.tsx` (69),
`src/components/marketing/Nav.tsx` (98).

I specifically checked the two the brief flagged:
- **`src/components/charts/`** — `Donut` and `StepArea` are hand-rolled inline SVG built on `src/lib/charts/geometry.ts`. No charting library, no D3, no Recharts. `ProgressRings.tsx` is not even a client component — it is a pure server-rendered SVG. This is the right call and it is why `/dashboard`, the chart-heaviest page, still lands at 100 kB.
- **`src/components/ui/FileDrop.tsx`** — React hooks plus five lucide icons. Nothing heavy.

The one thing worth verifying was `lucide-react`: the installed package is 39 MB on
disk and is imported in 51 places, including 19 icons in `Sidebar.tsx` alone. It
tree-shakes correctly — the chunk containing it (`chunks/717`) is 27 kB raw / **9.2 kB
gzipped**, consistent with ~25 icons, not the whole set.

The heavy server-side dependencies are handled properly: `next.config.js` lists
`playwright-core` and `exceljs` in `serverComponentsExternalPackages`, and `exceljs`
is additionally lazy-imported at `src/lib/export/xlsx.ts:23`, so neither reaches the
client or the server bundle.

Impact:
None. 87.3 kB shared is at the low end for a Next.js App Router application and the
per-route deltas are negligible. The bundle is not this application's performance
problem — the database access pattern is. Recorded here so the numbers are on file and
the question is closed.

Suggested fix:
No change required. If a future dashboard needs a real charting library, keep the
current approach instead — the hand-rolled SVG is what keeps `/dashboard` under 100 kB.

---

### [IMAGE] — No images anywhere in the application
Severity: Cosmetic
Location: project-wide
Found by: performance

Description:
Checked for every form of image handling and found none:
- `grep -rn "<img" src` — no matches.
- `grep -rn "next/image" src` — no matches.
- There is no `public/` directory, so no static assets are served.
- The marketing page and `src/components/marketing/DashboardMock.tsx` (6.2 kB, the largest marketing component) are built entirely from inline SVG, CSS gradients and Tailwind utilities.
- The only binary content in the system is user-uploaded attachments, which are served through `src/app/api/uploads/local/route.ts:68-75` (dev) or presigned R2 URLs (production).

Impact:
Nothing to optimise — there is no unoptimised asset, no layout shift from an unsized
image, and no missed `next/image` opportunity. The single 54 kB stylesheet is the only
non-JS static payload.

The one forward-looking note: uploaded attachments are served at full size with no
thumbnailing and no derivative generation. The moment the UI renders an attachment
preview inline (a drawing thumbnail on `/drawings`, a photo on a job comment), that
becomes a real finding — a grid of previews would download full-resolution originals
through the Node process. It is not one today because nothing renders them.

Suggested fix:
None now. When attachment previews are added, generate derivatives on upload and serve
them through `next/image` with an explicit `remotePatterns` entry for the R2 host, or
via R2's own image transformations.

---

### [QUERY] — Approvals page fetches the user's pending approvals unbounded while capping the others
Severity: Medium
Location: src/app/(app)/approvals/page.tsx:33-41
Found by: performance

Description:
The page caps two of its three queries and not the third:

```
:33  myCoApprovals    = changeOrderApproval.findMany({ ... })            // no take
:45  otherCoApprovals = changeOrderApproval.findMany({ ..., take: 50 })
:57  otherApprovals   = approval.findMany({ ..., take: 50 })
```

The uncapped one is the user's own queue — the list that is by definition longest for
the people who use this page most (a captain or owner's rep is a required stage on
every change order). All three are also sequential `await`s rather than a
`Promise.all`, and `ChangeOrderApproval` has no index on `(decision, stage)`.

`totalPending` at :63 is then computed as `myCoApprovals.length + otherCoApprovals.length
+ otherApprovals.length` — which is silently wrong for the two capped queries, reporting
50 when there are more.

Impact:
An approver who has let a backlog build sees every pending approval rendered at once,
with the parent `ChangeOrder` joined for each. On a busy refit that is a few hundred
rows — noticeable rather than fatal, but it is the page they hit most and it is the one
query on it without a limit. The headline count is also understated once either capped
list exceeds 50, which is a correctness issue the fix should address together.

Suggested fix:
Add `take: 50` to `myCoApprovals` for symmetry, batch all three into one `Promise.all`,
and compute `totalPending` from three `count` queries (or one `groupBy`) rather than
from the lengths of capped arrays.

---

### [QUERY] — "Mark all read" round-trips every unread id through the application
Severity: Low
Location: src/app/(app)/notifications/page.tsx:16-17, :28-34
Found by: performance

Description:
The action selects ids and then sends them straight back as a filter:

```
const ids = (await prisma.notification.findMany({
  where: { userId: user.id, readAt: null },
  select: { id: true },
})).map((n) => n.id);
if (ids.length) await markRead(user.id, ids);
```

`markRead` (src/lib/notifications.ts:50-54) is `updateMany({ where: { id: { in: ids },
userId }, data: { readAt: new Date() } })` — so the same predicate that produced the ids
is discarded and rebuilt as a potentially enormous `IN (...)` list. The `findMany` has no
`take`, and `Notification` has no index on `(userId, readAt)`.

The page render at :28-34 repeats the shape: it fetches 200 notifications (correctly
capped), derives `unreadIds` in JS, and calls `markRead` with that list — so simply
viewing the page issues an `updateMany` with up to 200 ids in an `IN` clause.

Impact:
Minor in absolute terms, but it degrades without limit: a user returning after a long
absence with several thousand unread notifications generates a multi-thousand-element
`IN` list, which Postgres plans poorly and which can exceed practical statement size.
Two queries and a large round trip where one statement would do.

Suggested fix:
Collapse to a single statement — the predicate is already sufficient:

```
await prisma.notification.updateMany({
  where: { userId: user.id, readAt: null },
  data: { readAt: new Date() },
});
```

On the page render, do the same rather than passing `unreadIds`. Add
`@@index([userId, readAt])` (also needed by `unreadCount` in the layout).

---

### [DB] — Prisma connection pool is unconfigured
Severity: Medium
Location: src/lib/db.ts:5-9, .env
Found by: performance

Description:
The client is constructed with logging options only:

```
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
```

No `datasources` override, and `DATABASE_URL` in `.env` carries no `connection_limit`
or `pool_timeout` parameter. Prisma therefore defaults to `num_physical_cpus × 2 + 1`
connections per process — on a 4-core box, 9 connections per instance.

The singleton guard at :11 is correct for dev hot-reload. The issue is what happens
when the app is scaled: every instance opens its own pool, and Postgres has a global
`max_connections`.

Impact:
This compounds every other finding in this report. A single `/jobs` render takes 22
Prisma calls; the search page fires 7 concurrent scans; `FileDrop` fires N concurrent
sign requests each doing a nested session query; and PDF rendering makes the server
call *itself* over HTTP, so one PDF request holds connections for two overlapping
request chains. With a default pool and no timeout tuning, a burst saturates the pool
and requests queue on `pool_timeout` (default 10 s) before failing — which surfaces as
the whole app hanging rather than one slow page. Scale to 4 instances on a Postgres
with `max_connections = 100` and the headroom is thinner than it looks.

Suggested fix:
Set the pool explicitly in `DATABASE_URL` (`?connection_limit=10&pool_timeout=20`) and
size it against `max_connections / expected instance count`, leaving headroom for
migrations and admin sessions. If the deployment target is serverless or scales past a
handful of instances, put PgBouncer (or the provider's pooler) in front and add
`?pgbouncer=true`. Fixing the duplicate-query and N+1 findings above is the cheaper
half of the same problem — fewer queries per request is fewer connections held.

---

## Summary

Route table from `npm run build` — shared first-load JS **87.3 kB**, largest route
`/dashboard` at **100 kB**, 39 of 40 routes dynamic. The client bundle is healthy and
is not where this application's latency lives.

Database access is. Per-render Prisma call counts: **`/jobs` 22** (7 of them exact
duplicates, 7 more being one-count-per-tab), **`/dashboard` 24** (5 sequential stages,
2 unbounded reads). Eleven routes read an entire table with no `take`; the six busiest
workflow tables carry no index beyond their primary key; and `unreadCount` puts an
unindexed sequential scan of `Notification` in the app layout, on every authenticated
page view in the product.

The three changes with the best ratio of effort to effect, in order:
1. Add the missing indexes (one migration) — in particular `Notification(userId, readAt)` and `AuditLog(createdAt)`.
2. Wrap `getCurrentUser` / `listProjectsForUser` / `getActiveProject` in React `cache()` — removes ~7 of 22 queries on `/jobs` for three one-line edits.
3. Replace the seven per-view `job.count` calls with one `groupBy`, and give `job.findMany` an `orderBy` and a `take`.
