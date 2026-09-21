# UI/UX — audit findings

Phase 2 of the platform audit. Produced by the `ui-ux-audit` specialist; content is the agent's,
recorded here verbatim (the agent could not write to disk itself).

## Count by severity
- **Critical: 2**
- **High: 10**
- **Medium: 13**
- **Low: 6**
- **Cosmetic: 2**
- **Total: 33**

## Three most serious
1. **[ERROR STATES] — No error boundary exists anywhere in the app; thrown server actions blank the whole screen** (Critical)
2. **[RESPONSIVE] — The sidebar is a permanently visible 240px column, making the app unusable below ~600px** (Critical)
3. **[SCAFFOLDS] — Eight modules are read-only list scaffolds with no detail page, no create form and no actions** (High)

---

---

# UI/UX Audit — OceancOS

Scope: every route under `src/app/(app)/`, plus `/`, `/login`, `/forgot`, `/reset/[token]`, `/print/*`.
All 33 `page.tsx` files were read. Every internal `href` was cross-checked against the route list.

---

### [ERROR STATES] — No error boundary exists anywhere in the app; thrown server actions blank the whole screen
Severity: Critical
Location: `src/app/` (no `error.tsx`, `global-error.tsx` or `not-found.tsx` anywhere); `src/app/(app)/change-orders/actions.ts:31,65,148,150`; `src/app/(app)/crew-requests/actions.ts:16,53`; `src/app/(app)/jobs/actions.ts:27,31,56`
Found by: ui-ux-audit

Description:
`find src/app \( -name "error.tsx" -o -name "global-error.tsx" -o -name "not-found.tsx" \)` returns nothing. Meanwhile the server actions that back the two largest workflows throw raw `Error` objects on the unhappy path:
- `createChangeOrder` — `throw new Error("Invalid change order: " + ...)` (`change-orders/actions.ts:31`)
- `transitionChangeOrder` — `throw new Error("Change order not found")` (`:65`)
- `decideChangeOrderApproval` — `throw new Error("Forbidden: ${stage} approval requires ${permKey}")` (`:150`)
- `createCrewRequest` — `throw new Error("Invalid request: " + ...)` (`crew-requests/actions.ts:16`)
- `transitionCrewRequest` — `throw new Error("Crew request not found")` (`:53`)
- `assertPermission` throws from every page that calls it (`change-orders/new/page.tsx:15`, `crew-requests/new/page.tsx:15`)

With no `error.tsx` at any segment, the error propagates to Next's built-in root boundary. In production the user's entire window — sidebar, top bar, content — is replaced by the generic "Application error: a client-side exception has occurred" screen with a digest hash and no message, no retry and no navigation back. Every keystroke of the form they just filled in is lost.

Impact:
A validation slip on the New Change Order form (e.g. a title under 3 characters that bypasses the HTML `minLength`, or a malformed number field) destroys the session's work and leaves the user with no route back other than typing a URL. The same happens if an approver without the right permission clicks Approve on the Approvals Centre, which is reachable because the buttons are rendered based on a different check than the action enforces. This is the single largest reliability gap in the UI layer.

Suggested fix:
Add `src/app/(app)/error.tsx` (a client component with a `reset()` button, the app chrome preserved by the layout) and `src/app/global-error.tsx` as a last resort. Then convert the throwing paths in `change-orders/actions.ts` and `crew-requests/actions.ts` to the `redirect("...?err=...")` pattern the jobs module already uses (`jobs/actions.ts:67,81,169`), and render the message the way `jobs/new/page.tsx:70-78` does. Add `not-found.tsx` so the many `notFound()` calls in the detail pages produce a branded 404 instead of the Next.js default.

---

### [RESPONSIVE] — The sidebar is a permanently visible 240px column, making the app unusable below ~600px
Severity: Critical
Location: `src/components/layout/Sidebar.tsx:53`; `src/app/(app)/layout.tsx:15-25`
Found by: ui-ux-audit

Description:
`<aside className="w-60 shrink-0 bg-ink-950/80 border-r border-line h-screen sticky top-0 overflow-y-auto backdrop-blur-sm">` carries no responsive modifier — no `hidden`, no `lg:flex`, no drawer, no hamburger, no `<Sheet>`. The layout is `min-h-screen flex` with the aside first and `<main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">` second (`layout.tsx:23`).

On a 375px-wide phone: 240px sidebar + 48px of `p-6` padding leaves roughly 87px of usable content width. On a 768px tablet it leaves about 480px. There is no toggle anywhere in `Sidebar.tsx` or `TopBar.tsx` — no state, no button, no `usePathname`-driven close. The marketing home page has a proper mobile menu (`src/components/marketing/Nav.tsx:57-95`), so the pattern exists in the codebase but was never applied to the authenticated app.

Impact:
Every authenticated screen is effectively desktop-only. Tables, forms and detail pages are compressed into a column narrower than a single badge, and horizontal page scroll is forced on every route. For an app whose users are captains and crew working on a dock, phone access is a core use case, not an edge case.

Suggested fix:
Make the aside `hidden lg:block` and add a hamburger button to `TopBar.tsx` that opens the same `NAV` list as an overlay drawer, mirroring the mobile menu already written in `marketing/Nav.tsx`. Reduce `<main>` padding to `p-4 sm:p-6`.

---

### [LOADING STATES] — No `loading.tsx` or `<Suspense>` anywhere; every navigation is a silent freeze
Severity: High
Location: `src/app/` (no `loading.tsx` files); every page carries `export const dynamic = "force-dynamic"`
Found by: ui-ux-audit

Description:
There is not one `loading.tsx` in the tree and not one `Suspense` boundary (`grep -rn "Suspense" src/` returns nothing). Every page is `force-dynamic` and most run several sequential or parallel Prisma queries before returning any markup:
- `dashboard/page.tsx:33-80` — an 8-way `Promise.all`, then a `budget.findMany`, then a `changeOrderApproval.findMany`, then `getActiveProject`, then a `changeOrder.findMany`.
- `jobs/page.tsx:49-67` — a `findMany` plus a `findMany` plus **one `count` query per view** inside a nested `Promise.all`.
- `search/page.tsx:44-73` — seven `findMany` calls.

Because there is no loading boundary, Next holds the previous route on screen for the whole round trip with no spinner, no skeleton and no progress bar. The user clicks a nav item and nothing visibly happens.

A `.shimmer` skeleton utility is fully implemented in `src/app/globals.css:220-234` and is used by nothing — the intent was clearly there and the work was never finished.

Impact:
On a cold or loaded database, navigation feels broken. Users double-click nav links and re-submit, and there is no way to tell a slow query from a hung page.

Suggested fix:
Add `src/app/(app)/loading.tsx` rendering a skeleton built from the existing `.shimmer` and `.surface` classes, plus per-route `loading.tsx` for the heaviest pages (`dashboard`, `jobs`, `search`, `financials`). Consider wrapping the dashboard's chart panels in `<Suspense>` so the stat row paints first.

---

### [DEAD BUTTONS] — No form in the app has a pending state; every submit button is silently inert while the action runs
Severity: High
Location: every `<form action={...}>` in `src/app/(app)/`; e.g. `change-orders/new/page.tsx:178`, `crew-requests/new/page.tsx:139`, `approvals/page.tsx:144-155`, `jobs/[id]/page.tsx:343-350`, `admin/projects/page.tsx:185`
Found by: ui-ux-audit

Description:
`grep -rn "useFormStatus\|useTransition" src/` returns nothing. Every form is a plain server-component `<form action={serverAction}>` with a bare `<button className="btn-primary">`. Nothing disables the button, shows a spinner, or dims the form while the action is in flight. The `.btn` class has a `disabled:opacity-50` rule (`globals.css:133`) that nothing ever triggers.

The worst case is `approvals/page.tsx:144-155`, where Approve / Request Info / Reject sit side by side in one form: an impatient approver can click Approve twice, or click Approve then Reject, with no visual indication that the first click was registered.

Impact:
Users cannot tell whether a click registered. On a slow action (`decideChangeOrderApproval` writes an approval, a history row, an audit row, updates the change order and fans out notifications) this is several seconds of apparent unresponsiveness on a button that decides money.

Suggested fix:
Add a small `"use client"` `<SubmitButton>` using `useFormStatus()` that sets `disabled` and swaps the label for a spinner, and use it for every submit in the app. This is a single shared component and a mechanical replacement.

---

### [SCAFFOLDS] — Eight modules are read-only list scaffolds with no detail page, no create form and no actions
Severity: High
Location: `src/app/(app)/logistics/page.tsx`, `inventory/page.tsx`, `drawings/page.tsx`, `documents/page.tsx`, `meetings/page.tsx`, `risks/page.tsx`, `contractors/page.tsx`, `suppliers/page.tsx`
Found by: ui-ux-audit

Description:
Eight of the eighteen sidebar destinations render a table (or card list) and nothing else. None has a `[id]` route, a `new` route, an `actions.ts`, or a single button in its `PageHeader`. Precisely what a user hits:

- **Logistics** (`logistics/page.tsx`) — a five-column table of items. `PageHeader` at `:78-82` has no `actions` prop. Rows carry `className="row-hover"` (`:117`), which `globals.css:109-111` styles as `cursor-pointer`, so the cursor becomes a hand and clicking does nothing. No way to add, edit, cancel or complete an item.
- **Inventory** (`inventory/page.tsx`) — filters work; rows are `row-hover` (`:224`) and inert. No add, no adjust-quantity, no reorder action, despite the page computing and displaying "N need reorder" (`:174-179`).
- **Drawings** (`drawings/page.tsx`) — rows are `row-hover group` with `group-hover:text-accent-bright` on the title (`:95,101`), which reads exactly like a link. There is no drawing detail page, no revision viewer, no download link and no upload control, even though the data model carries `revisions`.
- **Documents** (`documents/page.tsx`) — a document register with no way to open, download or upload a document. Rows are `row-hover group` (`:105`) and inert.
- **Meetings** (`meetings/page.tsx`) — cards showing a date and action-item counts. The subtitle promises "Agenda, minutes and live action tracking" (`:33`) but individual action items are never listed, and there is no meeting detail page and no way to create a meeting or close an action.
- **Risks** (`risks/page.tsx`) — a nine-column register. Rows `row-hover group` (`:96`) and inert. No add, no edit, no mitigation workflow, despite the schema carrying `status: OPEN|MITIGATED|ACCEPTED|CLOSED|ESCALATED`.
- **Contractors** (`contractors/page.tsx`) — read-only. The only working control is the `mailto:` link (`:119`). No add or edit, despite the page surfacing "N expired insurance" alerts (`:69`) that a user can do nothing about.
- **Suppliers** (`suppliers/page.tsx`) — read-only, `mailto:`/`tel:` only. Also the only module in the app with **no permission check at all** (`:9` is a bare `await requireUser()`), unlike every sibling.

Impact:
Half the navigation leads to dead ends. A user who clicks "Documents" to upload a certificate, or "Risks" to log a risk raised in a meeting, finds no affordance to do so and no explanation. The hover styling actively lies about clickability, so the first interaction with each of these modules is a failed click.

Suggested fix:
Decide per module whether to build it or hide it. Short term: remove `row-hover` (and `group-hover:text-accent-bright`) from every non-clickable row so the cursor does not promise navigation, and either remove the unfinished modules from `Sidebar.tsx:28-48` or mark them with a "coming soon" affordance. Medium term: add create forms and detail routes following the shape of `crew-requests/`.

---

### [EMPTY STATES] — Empty states instruct the user to perform actions the UI does not offer
Severity: High
Location: `drawings/page.tsx:38`; `documents/page.tsx:42`; `contractors/page.tsx:32`; `suppliers/page.tsx:24`; `risks/page.tsx:49`; `logistics/page.tsx:89`; `inventory/page.tsx:198`; `financials/page.tsx:140`; `meetings/page.tsx:40`
Found by: ui-ux-audit

Description:
Every list has an `EmptyState`, which is good — but the hint text in nine of them tells the user to do something for which no control exists anywhere in the app:

- Drawings: *"Upload a PDF or DWG to start the approval chain."* — there is no upload control on the page.
- Documents: *"Upload contracts, certs, manuals, RAMs, minutes."* — no upload control.
- Contractors: *"Add a contractor to track scope, value and insurance."* — no add control.
- Suppliers: *"Add a supplier to link them to purchase orders and invoices."* — no add control, and no purchase-order UI exists at all.
- Risks: *"Add risks to track likelihood, impact and mitigation status."* — no add control.
- Logistics: *"Create one to schedule access, transport or deliveries."* — no create control.
- Inventory: *"Seed sample data or import from Excel to populate inventory."* — developer-facing copy shipped to end users; there is no Excel import in the app.
- Financials: *"Seed sample data or create budgets via Admin."* — the Admin page (`admin/page.tsx`) contains no budget creation of any kind; it is itself read-only.

Note the contrast with `change-orders/page.tsx:120-126` and `crew-requests/page.tsx:118-122`, which correctly pass an `action` node with a real button. The `EmptyState` component supports `action` (`components/ui/EmptyState.tsx:11,23`) and these nine pages simply never pass it.

Impact:
The empty state is the first thing a new user sees on a fresh install. Nine of them give an instruction that cannot be followed, which reads as the app being broken rather than incomplete. "Seed sample data" leaks developer vocabulary into a customer-facing screen.

Suggested fix:
Either pass a real `action` button (once the module supports it) or rewrite the hint to describe where the data comes from rather than commanding an impossible action. Remove "Seed sample data" from `inventory/page.tsx:198` and `financials/page.tsx:140` unconditionally.

---

### [DATA NOT RENDERED] — Job attachments are uploaded and stored but never displayed anywhere
Severity: High
Location: `src/app/(app)/jobs/[id]/page.tsx:60`; `src/app/(app)/jobs/new/page.tsx:151-162`; `src/app/(app)/jobs/actions.ts:498-541`
Found by: ui-ux-audit

Description:
The New Quote Request form has a working drag-and-drop uploader (`jobs/new/page.tsx:155`, `components/ui/FileDrop.tsx`) that signs each file, PUTs it to storage, and posts the metadata back. `attachUploads()` (`jobs/actions.ts:504-541`) persists an `Attachment` row with `jobId` set.

The job detail page fetches them — `attachments: { orderBy: { createdAt: "desc" } }` at `jobs/[id]/page.tsx:60` — and then never renders `job.attachments` anywhere in the 566-line component. The only attachment rendering on the page is for *comment* attachments (`:322-331`), and comments have no upload control, so that branch is unreachable through the UI.

Impact:
A user attaches photos and drawings to a quote request so the yard can price it, the upload shows a green tick, and the files then vanish. The yard pricing the job at `/jobs/[id]/quote` never sees them either — that page does not query attachments at all. This silently defeats the purpose of the upload feature and can lead to a mispriced quote.

Suggested fix:
Render a `<SectionCard title="Attachments">` on `jobs/[id]/page.tsx` listing `job.attachments` with filename, size and a download link, and include the same on the quote page. An empty state ("No files attached") for the zero case.

---

### [DEAD BUTTONS] — "Mark all read" on Notifications is a permanent no-op; unread state is destroyed on render
Severity: High
Location: `src/app/(app)/notifications/page.tsx:33-34, 13-19, 45-51`
Found by: ui-ux-audit

Description:
The page body marks everything read as a side effect of rendering:

```
const unreadIds = items.filter((i) => !i.readAt).map((i) => i.id);
if (unreadIds.length) await markRead(user.id, unreadIds);   // line 34
```

By the time the HTML reaches the browser, zero notifications are unread. The `markAllRead` server action bound to the header button (`:13-19, 45-51`) therefore always finds `ids.length === 0` and does nothing. The button is rendered unconditionally, with no disabled state, and clicking it produces no observable change.

The same line also makes the unread state single-shot: the "N new" badge (`:68-70`), the blue unread dots (`:88-89`) and the sidebar count (`Sidebar.tsx:90-92`, fed by `unreadCount` in `layout.tsx:10`) all disappear the instant the page is opened. There is no way to mark something unread, no filter for unread, and a page refresh loses the highlighting.

Impact:
The primary control on the page never does anything. Worse, a user who opens Notifications, is interrupted, and comes back has permanently lost the record of what was new — a real workflow failure for an approvals-driven product.

Suggested fix:
Remove the render-time `markRead` at `:34`. Mark a notification read when the user clicks through to its resource, and make "Mark all read" the explicit bulk control it is presented as. Add an unread/all filter.

---

### [DEAD LISTS] — The Approvals Centre's generic queue has no decision controls and no links
Severity: High
Location: `src/app/(app)/approvals/page.tsx:222-279` (table at `:243-276`)
Found by: ui-ux-audit

Description:
The page header promises "Every item waiting on a decision, in one queue" (`:70`). Two of the three sections deliver: "Waiting on You" has working Approve / Request Info / Reject buttons (`:144-155`) and "Pending with Other Approvers" links to the change order (`:196-201`).

The third section — "Other Approvals (POs, Drawings, Schedule, Access…)" — renders `prisma.approval` rows with **no action column, no buttons, and no link to the underlying record**. The Resource cell is raw text (`<td className="font-medium">{a.resource}</td>`, `:257`), i.e. a bare string like `PURCHASE_ORDER` (values from `APPROVAL_RESOURCES` in `lib/enums.ts:152-163`). There is no `approveApproval` server action anywhere in the codebase (`grep -rn "prisma.approval.update" src/` finds nothing).

Note the dashboard counts these items into its "Awaiting approval" stat (`dashboard/page.tsx:43,157`), which links to `/approvals` — so the dashboard points at a number the user cannot act on.

Impact:
Purchase orders, drawing approvals, budget changes and access requests can enter the queue and can never leave it through the UI. The count on the dashboard grows forever. The page overstates what it does.

Suggested fix:
Either implement a generic `decideApproval` action with the same three buttons and a link to the resource, or remove the section and the `approvalsPending` term from the dashboard stat until it is real.

---

### [DEAD LINKS] — Five of seven search result types link to a bare list page instead of the record
Severity: High
Location: `src/app/(app)/search/page.tsx:75-83`
Found by: ui-ux-audit

Description:
The result mapper builds an href per section:

```
{ label: "Drawings",    items: drawings.map((x) => ({ href: `/drawings`,    label: `${x.number} — ${x.title}` })) },  // :78
{ label: "Documents",   items: docs.map((x)      => ({ href: `/documents`,   label: x.name })) },                      // :79
{ label: "Suppliers",   items: suppliers.map((x) => ({ href: `/suppliers`,   label: x.name })) },                      // :80
{ label: "Contractors", items: contractors.map((x)=> ({ href: `/contractors`, label: x.name })) },                     // :81
{ label: "Inventory",   items: inv.map((x)       => ({ href: `/inventory`,   label: x.name })) },                      // :82
```

Only change orders (`:76`) and crew requests (`:77`) link to `/{module}/{id}`. The other five link to the whole unfiltered list with no anchor, no `?q=` pre-fill and no highlight — so a user who searched for a specific serial number, found it, and clicked it is dropped into a 500-row inventory table and has to find it again by eye.

Separately, the jobs/quotes module — the most developed part of the app — is not searched at all, although the global search box in `TopBar.tsx:33` advertises "Search change orders, requests, drawings, documents…".

Impact:
Search appears to work and then fails at the last step for five of seven entity types. Given those five modules have no detail pages at all (see the scaffolds finding), this is the symptom of the same root gap.

Suggested fix:
Until detail pages exist, pass the query through — `/inventory?q=${encodeURIComponent(q)}` etc. — so the destination at least filters to the match. Add `prisma.job` to the search fan-out at `:44-73`.

---

### [PLACEHOLDER DATA] — Working demo credentials are printed on the production sign-in page
Severity: High
Location: `src/components/auth/DemoHint.tsx:14-24`; rendered unconditionally at `src/app/login/page.tsx:121-123`
Found by: ui-ux-audit

Description:
The sign-in page renders a panel reading *"Sign in with `owner@oceancos.dev` and password `password`."* The component is rendered with no environment guard, no `process.env.NODE_ENV` check and no feature flag — `login/page.tsx:122` is `<DemoHint />`, full stop. The component's own comment ("Clearly marked as a demo convenience, not a security concern") asserts a judgement that the code does not enforce.

Impact:
Development scaffolding shipped to the primary public-facing screen of the product. Beyond the obvious credential exposure, it makes the login page read as a prototype to any prospective customer who reaches it.

Suggested fix:
Gate on an explicit env flag: render `<DemoHint />` only when `process.env.NEXT_PUBLIC_DEMO_MODE === "1"`, defaulting off. (Flagged here as a development artefact; the security agent should assess the credential exposure separately.)

---

### [ERROR STATES] — The PDF button can drop the user into a page of raw developer JSON
Severity: High
Location: `src/app/(app)/jobs/[id]/page.tsx:139-142`; `src/app/(app)/change-orders/[id]/page.tsx:84-92`; handlers at `src/app/api/export/jobs/[id]/route.ts:37-48` and `src/app/api/export/change-orders/[id]/route.ts`
Found by: ui-ux-audit

Description:
Both detail pages render a PDF button as a plain `<a target="_blank">` pointing at the export route. When Chromium is unavailable the route returns a 503 JSON body:

```
{ "error": "Could not render the PDF",
  "detail": err.message,
  "hint": "The server needs Chromium. Set PLAYWRIGHT_CHROMIUM_PATH or PDF_CHROME_CHANNEL." }
```

Because the link opens in a new tab, the browser renders that JSON as the page. The same happens for 401 and 403 (`route.ts:15-18`). There is no client-side handling, no toast and no fallback.

Impact:
A user clicking "PDF" on a change order they lack permission for, or on a server without Chromium installed, gets a new browser tab containing a JSON object referencing environment variables. It is unrecoverable within that tab and reads as a crash.

Suggested fix:
Make the export a client-side `fetch` with a pending state and an inline error banner, or have the route redirect back to the detail page with `?err=...` on failure. At minimum, never surface `detail` and `hint` to a browser tab.

---

### [RESPONSIVE] — Seven wide tables have no horizontal scroll container and will overflow the page
Severity: Medium
Location: `change-orders/page.tsx:130` (7 cols); `crew-requests/page.tsx:126` (7 cols); `approvals/page.tsx:104` (6 cols), `:179` (5 cols), `:243` (6 cols); `admin/page.tsx:73` (3 cols); `jobs/page.tsx:231` (5 cols)
Found by: ui-ux-audit

Description:
Fifteen of the twenty-two `table-base` instances sit inside an `overflow-x-auto` wrapper (e.g. `logistics/page.tsx:97`, `financials/page.tsx:152`, `dashboard/page.tsx:263`). Seven do not. `change-orders/page.tsx:129` is `<div className="surface overflow-hidden">` — `overflow-hidden`, not `auto`, so overflowing columns are clipped and unreachable rather than scrollable.

Impact:
On any viewport narrower than the table's natural width the rightmost columns (Created date, Schedule Δ, the Approve/Reject action column on `approvals/page.tsx:143-156`) are clipped away with no scrollbar. Combined with the always-on 240px sidebar, this happens on tablets, not just phones — and on the Approvals page it hides the decision buttons entirely.

Suggested fix:
Wrap each of the seven in `<div className="overflow-x-auto">`, matching the pattern already used elsewhere. Best done by folding the wrapper into a shared `<DataTable>` so it cannot be forgotten again.

---

### [PLACEHOLDER DATA] — Raw database IDs are shown to users where a name belongs
Severity: Medium
Location: `src/app/(app)/schedule/page.tsx:275`; `src/app/(app)/admin/page.tsx:206`
Found by: ui-ux-audit

Description:
The Schedule tasks table renders the Owner column as `{t.ownerId ?? <span className="text-faint">—</span>}` — a raw cuid such as `clx8f2k9a0001qw3h4m7n2p5r`, in a column headed "Owner" (`:274`). No user lookup is performed anywhere in the file.

`admin/page.tsx:206` does the same for the audit log Actor column: `{a.actorId?.slice(0, 8) ?? "—"}` — the first eight characters of a cuid. The same page has already loaded every user (`:17`) and could resolve the name trivially.

Every other page in the app builds a name map for exactly this purpose (`change-orders/[id]/page.tsx:52-60`, `crew-requests/[id]/page.tsx:31-32`, `jobs/[id]/page.tsx:69-89`), so the pattern exists and these two were left unfinished.

Impact:
The Schedule page's Owner column is meaningless — the user cannot tell who owns a task, which is the column's entire purpose. The admin audit log, the compliance artefact of the product, cannot attribute an action to a person.

Suggested fix:
Resolve IDs to names using the same `Map`-based lookup as the detail pages. On `admin/page.tsx` the `users` array is already in scope.

---

### [DESIGN TOKENS] — Inventory status badges are all grey; `STATUS_TONE` is missing the inventory statuses and collides with priority keys
Severity: Medium
Location: `src/lib/enums.ts:185-223`; consumed by `src/components/ui/Badge.tsx:24-29`; rendered at `inventory/page.tsx:282`
Found by: ui-ux-audit

Description:
`StatusBadge` looks the value up in `STATUS_TONE` and falls back to `"muted"` (`Badge.tsx:25`). The inventory status set is `OK|LOW|REORDER|MISSING|FAULTY|RETIRED` (`prisma/schema.prisma:403`). Of those, `STATUS_TONE` contains only `LOW` — and it contains it as a *priority*, mapped to `"muted"` (`enums.ts:219`). So:

- `OK` → grey (should be `ok`/green)
- `LOW` → grey, because the priority entry wins
- `REORDER`, `MISSING`, `FAULTY`, `RETIRED` → grey

Every status badge in the inventory table is the same neutral grey, including `FAULTY` and `MISSING`. The page compensates elsewhere — it colours the Qty cell amber and shows an alert strip (`:163-187`) — but the status column itself carries no signal.

The same gap affects other modules: schedule task statuses `PLANNED` and `DONE` (schema `:349`), logistics `PLANNED` (`:377`), and the drawing statuses `COMMENTS|REVISED|APPROVED_W_COMMENTS|SUPERSEDED|ARCHIVED` (`:418`) are all absent and render grey. There is also a genuine key collision: `ACCEPTED` is mapped to `"info"` under the risks comment (`:206`) but is also a job status where it means the work is authorised and should read as positive.

Impact:
The status colour system — the fastest scanning channel in a dense table — is silently disabled across four modules, and reads as deliberate (grey) rather than missing. A faulty life-saving appliance and a healthy spare look identical.

Suggested fix:
Namespace the tone map per domain (e.g. `STATUS_TONE.inventory`, `STATUS_TONE.job`) or prefix the keys, and add every status listed in `schema.prisma`. Add a unit test that asserts every documented status string has a tone.

---

### [CURRENCY] — Money is rendered as euros everywhere regardless of the project's configured currency
Severity: Medium
Location: `src/lib/utils.ts:7` (`fmtMoney(n, ccy = "EUR")`); callers at `dashboard/page.tsx:289`, `change-orders/page.tsx:170`, `change-orders/[id]/page.tsx:112-115`, `crew-requests/[id]/page.tsx:109`, `financials/page.tsx:59-81,184-202,226-253`, `risks/page.tsx:137`, `logistics/page.tsx:151`, `inventory/page.tsx:288`, `contractors/page.tsx:46,130`
Found by: ui-ux-audit

Description:
`fmtMoney` defaults to `"EUR"`. The jobs module correctly threads the project currency through (`jobs/[id]/page.tsx:91` → `fmtMoney(line.total, currency)`), and `admin/projects/page.tsx:114-122` lets an admin set the project currency to EUR, GBP, USD or AED. Every other module calls `fmtMoney(value)` with no second argument, so a GBP project's change orders, budgets, risks and contractor values all display with a `€` sign.

The two creation forms hardcode it in the label as well: `<Field label="Estimated Cost (EUR)">` (`change-orders/new/page.tsx:119`) and `<Field label="Cost Impact (EUR)">` (`crew-requests/new/page.tsx:113`).

Impact:
A yard working in GBP or USD sees every figure in the app mislabelled. On the Financials page the portfolio totals, variances and budget lines are all wrong-currency, which is a credibility failure on the one screen where numbers must be trusted.

Suggested fix:
Thread `project.currency` through to every `fmtMoney` call, and make the form labels read the active project's currency rather than a literal.

---

### [PLACEHOLDER COPY] — Roadmap notes are shipped in user-facing page subtitles
Severity: Medium
Location: `schedule/page.tsx:141`; `drawings/page.tsx:31`; `notifications/page.tsx:43`
Found by: ui-ux-audit

Description:
Three `PageHeader` subtitles describe features that do not exist:
- Schedule: *"Tasks, milestones and critical dates. **Gantt view planned.**"*
- Drawings: *"Versioned drawings with approval status. **In-browser markup is planned.**"*
- Notifications: *"In-app inbox. **Email fan-out enables when SMTP is configured.**"* — this last one exposes an internal deployment detail the user cannot act on.

Impact:
Internal roadmap and ops notes read as product documentation. The Notifications line in particular tells the user their email may or may not work, with no way to find out which.

Suggested fix:
Remove the roadmap clauses. If the SMTP state matters, surface it as a real status indicator on the Admin page rather than prose on the inbox.

---

### [PLACEHOLDER DATA] — The marketing page presents six invented companies as customers
Severity: Medium
Location: `src/components/marketing/TrustBar.tsx:1-8, 14-16`
Found by: ui-ux-audit

Description:
Under the heading *"Trusted by shipyards, management offices and fleets worldwide"*, the page lists `NORTHERN YARDS`, `Azura Fleet`, `MERIDIAN MARINE`, `Cap Ferrat Refit`, `BLUEWATER GROUP`, `Helm & Hull` — placeholder names with no disclaimer. The adjacent `Stats.tsx` block does carry one ("Illustrative figures shown for demonstration.", `:26-28`), so the omission here is inconsistent as well as substantive.

Impact:
A claim of customers who do not exist, on the public home page. This is a commercial and reputational exposure, not merely a polish issue.

Suggested fix:
Replace with real logos, or remove the section until there are some. If it must stay for layout, label it clearly as illustrative in the same way `Stats.tsx` does.

---

### [DEAD LINKS] — Footer Privacy and Terms links go nowhere
Severity: Medium
Location: `src/components/marketing/Footer.tsx:21-27`
Found by: ui-ux-audit

Description:
```
{ heading: "Legal", links: [ { label: "Privacy", href: "#" }, { label: "Terms", href: "#" } ] }
```
Both render as `<a href="#">` (the non-`/` branch at `:61-66`), so clicking either jumps to the top of the page. Every other href on the marketing site resolves: `#features`, `#workflow`, `#security`, `#pricing` and `#demo` all have matching section ids (`FeatureGrid.tsx:53`, `Workflow.tsx:42`, `Security.tsx:36`, `Roles.tsx:71`, `CTA.tsx:6`) — these two are the only dead ones.

Impact:
The only two broken links on the public site are the two a prospective customer's legal reviewer will click.

Suggested fix:
Add the pages, or remove the Legal column until they exist.

---

### [CONSISTENCY] — Two incompatible error-handling patterns across the three workflow modules
Severity: Medium
Location: `jobs/actions.ts:67,81,169` and `jobs/new/page.tsx:70-78` vs `change-orders/actions.ts:31` and `change-orders/new/page.tsx`, `crew-requests/actions.ts:16` and `crew-requests/new/page.tsx`
Found by: ui-ux-audit

Description:
The jobs module handles failure properly: the action redirects with `?err=<message>` and the page renders a styled `role="alert"` banner (`jobs/new/page.tsx:70-78`, `jobs/[id]/quote/page.tsx:71-79`, `jobs/[id]/accept/page.tsx:103-111`, and `admin/projects/page.tsx:57-74` which additionally has a success banner).

Change orders and crew requests throw instead, and their `new` pages have no `searchParams.err` handling and no banner markup at all. Same product, same kind of form, two entirely different failure experiences — one inline and recoverable, one a full-page crash (see the Critical error-boundary finding).

Impact:
The quality of error handling depends on which module the user happens to be in. The two older modules are the ones most users will touch first.

Suggested fix:
Adopt the jobs pattern everywhere. Extract the alert banner into a shared `<FormAlert kind="error|success">` component — it is currently duplicated verbatim in five files.

---

### [CONSISTENCY] — The two older creation forms have no Cancel control
Severity: Medium
Location: `change-orders/new/page.tsx:173-181`; `crew-requests/new/page.tsx:135-142`
Found by: ui-ux-audit

Description:
Both forms end with a single `<button className="btn-primary btn-lg">` and no way out other than the small back-breadcrumb at the top of the page (`:22-28` in both). The jobs forms pair every submit with a Cancel link — `jobs/new/page.tsx:166-168`, `jobs/[id]/quote/page.tsx:215-217`.

Impact:
A user partway down a long form (the New Change Order form has six sections) has no visible escape and must scroll back to the top. Minor on its own, but it compounds the missing pending state and missing error banner on exactly these two forms.

Suggested fix:
Add `<Link href="/change-orders" className="btn-ghost">Cancel</Link>` beside each submit, matching the jobs pattern.

---

### [FUNCTIONALITY] — The quote form is hard-capped at six line items with no way to add rows
Severity: Medium
Location: `src/app/(app)/jobs/[id]/quote/page.tsx:18, 143-182`
Found by: ui-ux-audit

Description:
`const LINE_ROWS = 6;` renders exactly six blank rows via `Array.from({ length: LINE_ROWS })`. There is no "Add line" button, and because the page is a server component with no client state there is no mechanism to add one. A quote requiring seven or more priced lines cannot be issued through the UI.

Impact:
A hard functional ceiling on the core yard workflow, presented with no explanation — the yard simply runs out of rows. The explanatory note below the table (`:186-189`) says empty lines are ignored but says nothing about the limit.

Suggested fix:
Make the line table a small client component with an "Add line" button, or at minimum raise `LINE_ROWS` and state the limit in the helper text.

---

### [ANIMATION] — Staggered row animations delay the last rows of long tables by several seconds
Severity: Medium
Location: `logistics/page.tsx:114-119`; `schedule/page.tsx:262-267`; `meetings/page.tsx:124`
Found by: ui-ux-audit

Description:
Rows are given a per-index animation delay:
- Logistics: `animationDelay: ${80 + idx * 20}ms` with `take: 200` (`:73`) → the last row appears at **4.06 seconds**.
- Schedule: `animationDelay: ${140 + idx * 15}ms` with `take: 200` (`:132`) → the last row appears at **3.1 seconds**.

`animate-fade-up` is `opacity: 0` → `1` with `both` fill (`tailwind.config.ts:72-75, 90`), so those rows are genuinely invisible until their delay elapses, and the page height is already allocated — the user sees a large area of empty rows filling in slowly. Ctrl-F on the page will not find text in a row that has not yet animated in visually.

Impact:
A fully loaded logistics or schedule table reads as broken or still loading for four seconds after it has in fact finished rendering.

Suggested fix:
Cap the stagger (e.g. `Math.min(idx, 12) * 20`) or drop the per-row delay entirely and animate the container once, as the other list pages do.

---

### [RESPONSIVE] — The project switcher is hidden below the `md` breakpoint, with no alternative
Severity: Medium
Location: `src/components/layout/ProjectSwitcher.tsx:30, 41`
Found by: ui-ux-audit

Description:
Both branches of the component are hidden on small screens: the single-project label is `className="hidden items-center gap-2 ... md:flex"` (`:30`) and the multi-project `<form>` is `className="hidden md:block"` (`:41`). Nothing else in `TopBar.tsx` exposes the active project.

Impact:
On a phone or small tablet a user cannot see which project they are looking at, and cannot switch. Since `getActiveProject` scopes the jobs module and the dashboard charts (`dashboard/page.tsx:74-80`, `jobs/page.tsx:34`), the user is silently locked into whichever project was last selected on a desktop.

Suggested fix:
Show a compact version on small screens — at minimum the project code as a static label — and move the switcher into the mobile nav drawer proposed in the sidebar finding.

---

### [CONSISTENCY] — Crew request detail has no history panel although change order detail does
Severity: Medium
Location: `src/app/(app)/crew-requests/[id]/page.tsx` (no history section); compare `src/app/(app)/change-orders/[id]/page.tsx:317-350` and `src/app/(app)/jobs/[id]/page.tsx:506-520`
Found by: ui-ux-audit

Description:
The change order detail page renders a History panel with every status transition, actor and timestamp. The job detail page renders the same. The crew request detail page renders Details, Workflow Actions, Assignment and Comments — and nothing else. `transitionCrewRequest` does record history (`crew-requests/actions.ts`), so the data exists and is simply never shown.

Relatedly, the crew request transition table is hardcoded inline in the page component (`crew-requests/[id]/page.tsx:34-44`) while the change order equivalent lives in `lib/workflow/changeOrder.ts` and the job equivalent in `lib/jobs/workflow.ts` — so the same concept is expressed three different ways.

Impact:
A user cannot see who moved a crew request through triage or when, on a screen whose whole purpose is accountability for operational items.

Suggested fix:
Add the History `SectionCard`, reusing the markup from `change-orders/[id]/page.tsx:317-350`. Move the transition table into `lib/workflow/crewRequest.ts` alongside its siblings.

---

### [EMPTY STATES] — Three panels render as blank or disappear entirely when they have no rows
Severity: Medium
Location: `src/app/(app)/admin/page.tsx:174`; `src/app/(app)/jobs/[id]/page.tsx:506-520`; `src/app/(app)/admin/page.tsx:81-99`
Found by: ui-ux-audit

Description:
- **Admin audit log**: wrapped in `{audit.length > 0 && (...)}` (`:174`). With no audit rows the entire card vanishes with no trace, so a user with `AUDIT_VIEW` cannot tell whether the log is empty or whether they lack permission to see it.
- **Job detail History**: `<ul className="max-h-72 ...">{job.history.map(...)}</ul>` (`:507-519`) with no zero-length branch — a new job renders a titled `SectionCard` containing an empty box. Every other list on that same page has an empty message (comments at `:298-303`).
- **Admin Users table**: `<tbody>{users.map(...)}</tbody>` (`:81-99`) with no empty branch, unlike the Projects, Vessels and Departments lists directly beside it which all have one (`:112-113, 139-140, 157-158`).

Impact:
"Nothing here" and "you cannot see this" are indistinguishable. A blank titled card reads as a rendering failure.

Suggested fix:
Always render the card and put the empty message inside it, following the pattern already used three times on the same Admin page.

---

### [CONSISTENCY] — Page titles, eyebrows and button labels use three different casing conventions
Severity: Low
Location: across `src/app/(app)/*/page.tsx`
Found by: ui-ux-audit

Description:
Title Case and sentence case are mixed arbitrarily, often within one screen:

| Page | Title | Eyebrow |
|---|---|---|
| `dashboard/page.tsx:147-148` | Project dashboard | Command centre |
| `change-orders/page.tsx:53-54` | Change Orders | Workflow |
| `crew-requests/page.tsx:58-59` | Crew Requests | Workflow |
| `approvals/page.tsx:68-69` | Approvals Centre | Workflow |
| `jobs/page.tsx:90-91` | Quotes & requests | `<code> · <yard>` |
| `financials/page.tsx:50-51` | Financials | Project Finance |
| `inventory/page.tsx:95-96` | Inventory & Equipment | Vessel Inventory |
| `documents/page.tsx:33-34` | Document register | Document Control |
| `risks/page.tsx:40-41` | Risk register | Risk Management |
| `schedule/page.tsx:139-140` | Schedule | Project Timeline |

Buttons follow suit: "New Change Order" / "New Request" / "Post Comment" / "Save Assignment" against "New quote request" / "Send message" / "Record minute" / "Save project". Filter actions are "Apply filters" (`FilterBar.tsx:33`) on two pages and "Apply" (`inventory/page.tsx:158`) on another.

Impact:
The app reads as if written by several people who never compared notes — which, per the brief, it was. It undercuts the otherwise careful visual design.

Suggested fix:
Pick sentence case (it dominates the newer jobs/dashboard work and reads better at these sizes) and sweep every `PageHeader` title, eyebrow and button label.

---

### [CONSISTENCY] — Four different wordings for the same "you lack permission" state
Severity: Low
Location: `logistics/page.tsx:67`, `drawings/page.tsx:14`, `documents/page.tsx:14`, `meetings/page.tsx:14`, `risks/page.tsx:28`, `contractors/page.tsx:13`, `financials/page.tsx:17`, `schedule/page.tsx:127`, `admin/page.tsx:14`, `admin/projects/page.tsx:27`, `jobs/page.tsx:31`, `jobs/new/page.tsx:22` ("Forbidden"); `change-orders/page.tsx:24` ("Access restricted"); `crew-requests/page.tsx:23` ("Access Restricted"); `jobs/[id]/accept/page.tsx:33` ("Not an authoriser")
Found by: ui-ux-audit

Description:
Twelve pages title the state **"Forbidden"** — raw HTTP vocabulary. One says **"Access restricted"**, one says **"Access Restricted"** (differing only in casing), and one says **"Not an authoriser"**. Several also render the `EmptyState` with no icon while others pass one, so the visual weight differs too.

Impact:
"Forbidden" is jargon that reads as an error rather than a policy, and the inconsistent casing between the two adjacent workflow modules is visible to anyone who navigates between them.

Suggested fix:
One shared `<NoAccess module="Drawings" />` component with a single wording, e.g. "You don't have access to Drawings — ask your project manager if you need it."

---

### [CONSISTENCY] — Redundant and conflicting button class combinations
Severity: Low
Location: `search/page.tsx:33,102`; `inventory/page.tsx:157`; `notifications/page.tsx:46`; `marketing/Hero.tsx:41`; `marketing/CTA.tsx:33`
Found by: ui-ux-audit

Description:
`.btn-primary`, `.btn-danger` and `.btn-ghost` all already `@apply btn` (`globals.css:136-147`), so combining them duplicates every declaration and makes the source order decide the winner:
- `className="btn btn-primary px-5"` (`search/page.tsx:33,102`)
- `className="btn-primary btn"` (`inventory/page.tsx:157`) — the reverse order of the same mistake
- `className="btn btn-ghost flex items-center gap-1.5"` (`notifications/page.tsx:46`) — and `.btn` already sets `inline-flex items-center gap-2`
- `className="btn btn-lg"` (`Hero.tsx:41`, `CTA.tsx:33`) is correct usage and sits beside the incorrect ones

Impact:
Cosmetic inconsistency in rendered padding and colour between buttons that should be identical, and a misleading example for anyone extending the code.

Suggested fix:
Use one variant class per button. A lint rule or a `<Button variant>` component would prevent recurrence.

---

### [CODE CONSISTENCY] — A local `cn` shadows the shared helper, and five imports are unused
Severity: Low
Location: `src/app/(app)/change-orders/[id]/page.tsx:364-366, 30`; `src/app/(app)/approvals/page.tsx:10`; `src/app/(app)/contractors/page.tsx:6`; `src/app/(app)/jobs/page.tsx:17,19`
Found by: ui-ux-audit

Description:
`change-orders/[id]/page.tsx` defines its own `cn` at the bottom of the file (`:364-366`) rather than importing the identical helper from `@/lib/utils` that every other component uses (`Badge.tsx:1`, `SectionCard.tsx:1`, `StatCard.tsx:3`, `Panel.tsx:4`, `DefinitionGrid.tsx:1`).

Unused imports, each appearing exactly once (the import line itself):
- `GitMerge` — `change-orders/[id]/page.tsx:30`
- `Clock` — `approvals/page.tsx:10`
- `Phone` — `contractors/page.tsx:6`
- `JOB_STATUS_LABELS`, `JobStatus` — `jobs/page.tsx:17,19`

Impact:
Dead weight and a divergent copy of a shared utility; no user-visible effect.

Suggested fix:
Import `cn` from `@/lib/utils` and delete the local copy; remove the unused imports. Enabling `no-unused-vars` in the lint config would catch these.

---

### [ACCESSIBILITY] — The jobs group table declares four header cells for five body columns
Severity: Low
Location: `src/app/(app)/jobs/page.tsx:232-239` vs the rows at `:246-311`
Found by: ui-ux-audit

Description:
The `sr-only` `<thead>` lists four headers — Quote, Status, Price, Delivered — while each `<tr>` renders five `<td>` elements: the quote cell (`:246`), status (`:273`), price (`:293`), delivered date (`:296`) and an unlabelled progress-bar cell (`:299-311`).

Impact:
Screen-reader column association is off for the final cell, and the progress percentage is announced with no column context. Visually the table still lays out, so this is invisible in testing.

Suggested fix:
Add a fifth `<th>Progress</th>` to the `sr-only` header row.

---

### [EMPTY STATES] — The Financials portfolio bar renders a meaningless zero state above its own empty state
Severity: Low
Location: `src/app/(app)/financials/page.tsx:56-133` vs `:136-141`
Found by: ui-ux-audit

Description:
The six summary stat cards and the "Total spend progress" bar render unconditionally, before the `budgets.length === 0` check at `:136`. With no budget lines the user sees six cards reading `€0`, a full-width progress bar at 0%, and a variance line reading `−€0 variance` with a downward green trend arrow (`:93-101`) — followed underneath by an empty state saying there are no budget lines.

Impact:
A fabricated-looking "all on budget" summary sits above a message saying there is no budget data. The green arrow implies a positive result derived from nothing.

Suggested fix:
Move the `budgets.length === 0` early return above the stat cards and the spend bar so the empty state is the only thing on the page.

---

### [DEAD STYLES] — The skeleton utility is fully implemented and never used
Severity: Cosmetic
Location: `src/app/globals.css:220-234` and the `shimmer` keyframe at `tailwind.config.ts:80-82`
Found by: ui-ux-audit

Description:
`.shimmer` with its `::after` gradient sweep and the matching `shimmer` keyframe are complete and correct. `grep -rn "shimmer" src/` finds them only in the two definition sites — no component applies the class. The `pulse-glow` animation (`tailwind.config.ts:83-86, 92`) is likewise defined and unreferenced.

Impact:
Unused CSS, and a missed opportunity: this is exactly the primitive the missing `loading.tsx` files would need.

Suggested fix:
Use it when adding the loading skeletons, or remove it.

---

### [AFFORDANCE] — Decorative chevrons and hover states imply interactions that do not exist
Severity: Cosmetic
Location: `src/app/(app)/logistics/page.tsx:175`; `src/app/(app)/admin/page.tsx:144, 162`
Found by: ui-ux-audit

Description:
The Logistics table footer ends with `<ArrowRight className="h-3 w-3 ml-auto text-faint/40" aria-hidden />` (`:175`) — right-aligned in a footer bar, exactly where a "view all" affordance would sit. It is not wrapped in a link and does nothing.

On the Admin page, the Vessels and Departments list items carry `className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"` (`:144`, `:162`). They brighten on hover like links but are plain `<li>` elements with no destination.

Impact:
Small false affordances that invite a click and return nothing. They compound the `row-hover` cursor problem noted in the scaffolds finding.

Suggested fix:
Remove the decorative arrow and the hover colour transitions from non-interactive elements.

---

## Notes for the orchestrator

Items verified and found **clean**, worth recording so other agents do not re-investigate:
- **Every internal `href` resolves.** All static hrefs (`/dashboard`, `/jobs`, `/change-orders`, `/crew-requests`, `/approvals`, `/notifications`, `/login`, `/forgot`, `/admin/projects`, the two export endpoints) and every templated href (`/change-orders/${id}`, `/jobs/${id}/quote`, `/jobs/${id}/accept`, `/admin/projects?id=`) map to a real route. All 19 `Sidebar.tsx` NAV entries have a matching `page.tsx`. The only dead links in the product are the two `href="#"` Legal entries in the marketing footer.
- **`/print/jobs/[id]` and `/print/change-orders/[id]` are not orphans** — they are the render targets for the Playwright PDF export (`api/export/*/[id]/route.ts:28,38`). Their light-mode hex colours are correct for paper, not a dark-mode violation.
- **No hardcoded hex or arbitrary Tailwind colour values in app code.** `grep -rn -- "-\[#" src/ --include=*.tsx` returns nothing. The only hex literals are in `components/charts/palette.ts` (a deliberate, documented, contrast-validated chart palette) and the print stylesheets. Arbitrary values are confined to `[Npx]` font sizes, which is a reasonable use.
- **The chart components are the strongest code in the repo** — `Donut.tsx:45-49` and `StepArea.tsx:53-55` both have proper empty states, both carry `role="img"` with a `<title>`, and `StepArea` ships an accessible table fallback.
- **`admin/projects` is the one fully-realised CRUD screen** (validation, success banner, error banner, redirect-based error surfacing) and is the right model to copy elsewhere.
- **`suppliers/page.tsx:9` has no RBAC check at all** (bare `await requireUser()`), and `search/page.tsx:66` likewise queries suppliers with no permission gate while gating all six other entity types. Flagged here as a consistency break; the security agent should assess the access-control implications.
