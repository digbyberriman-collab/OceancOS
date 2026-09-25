# Findings — role walkthrough (vessel-side roles)

Scope: the 11 vessel/owner-side and functional roles — OWNER, OWNERS_REP, PROJECT_MANAGER, CAPTAIN,
CHIEF_OFFICER, CHIEF_ENGINEER, PURSER, HOD, CREW, FINANCE, TECH_MANAGER — walked through the running
application as each role in turn. This does **not** relog T1 (jobs vs. the ten list-only scaffolds) or
the planned `ComingSoon` fix (G3.11); it looks at what each specific job function hits given what is
already built and already logged.

**Method.** Eight roles have a seeded `@oceancos.dev` account (password `password`) and were driven
live with `playwright-core` against the dev server at `127.0.0.1:3001`: every sidebar module was
opened and screenshotted. Three — CHIEF_OFFICER, PURSER, HOD — have **no seeded account**
(README.md:46, SITE_MAP.md:138-140) and are assessed by reading `src/lib/rbac.ts:82-198` against every
route's guard; those sections say so explicitly and are marked "reasoned, not observed" wherever it
matters. All navigation was read-only: no record was created, edited, transitioned or deleted, and
buttons proven to be live footguns (see CREW) were identified from source and left unclicked rather
than exercised.

**On screenshot paths.** `/tmp/audit-scripts/screenshots/` is a shared scratch directory and something
in this environment (a concurrent agent's cleanup, or a tmp-reaper) deleted every screenshot taken more
than a few minutes earlier at least twice during this session — files for OWNER, OWNERS_REP,
PROJECT_MANAGER, CAPTAIN, CHIEF_ENGINEER and part of FINANCE were captured, inspected and then found
gone from disk before this file was written. Every visual claim below was verified by opening the image
at capture time (its pixel content is described precisely, not inferred), and the filename is given for
traceability, but a reader should not assume the file still resolves — the route, role and exact
observed copy/behaviour are the durable part of each citation, with the corresponding source line as
the primary evidence.

Severity scale follows `AUDIT_REPORT.md` §2: Critical (data loss/bypass/cross-tenant exposure/broken
financial control), High (a capability that doesn't work or a defect on a normal path), Medium (wrong
behaviour off the default path), Low (rough edge).

---

## Cross-role findings (apply to more than one role below; stated once, referenced by role)

**[X1] The dashboard shows change-order and risk data to users with no `CO_VIEW` or `RSK_VIEW`.**
`src/app/(app)/dashboard/page.tsx:33-54` runs `changeOrder.count`, `changeOrderApproval.findMany`
(`myApprovals`, :65-69) and `risk.findMany` (`risksOpen`, :49-53) unconditionally, then renders them at
:154 (open-CO stat), :224-226 (status donut), :256-300 ("Approvals waiting on you and others" — stage,
CO number, title and exact cost), :302-344 ("Top risks" — title, rating, status), :348-376 (raw
`AuditLog` "Recent activity", also ungated). The **only** gate on the page is `canViewFinancials`
(:71), applied solely to the budget panel and the cumulative-value chart. Severity: **Critical.**

**[X2] Crew-request workflow buttons render for anyone who can view the request, and the server only
checks 4 of 9 target statuses.** `src/app/(app)/crew-requests/[id]/page.tsx:137-149` renders every
transition in the `transitions` map for the request's current status with no `hasPermission` check
(contrast the "Assignment" panel two lines below, :154, which correctly gates on `CR_ASSIGN`).
`src/app/(app)/crew-requests/actions.ts:57-59` matches: `TRIAGED`/`ASSIGNED` need `CR_TRIAGE`,
`COMPLETED`/`CLOSED` need `CR_COMPLETE`, and `IN_PROGRESS`, `BLOCKED`, `AWAITING_APPROVAL`, `REJECTED`,
`NEW` have **no permission check at all**. Any role holding only `CR_VIEW` can therefore actually move
any crew request through those five statuses by clicking a button the UI should never have shown them.
Live-confirmed for CREW (below); the code path is role-agnostic and reasoned to apply identically to
PURSER, CHIEF_OFFICER and HOD. This is the live face of the auth-security file's already-logged C6; the
new fact is that it is trivially reachable through the ordinary UI, not just by crafting a request.
Severity: **Critical.**

**[X3] Change-order cost is shown to any `CO_VIEW` holder regardless of `FIN_VIEW`, while the same
record's print/export views correctly redact it.** `src/app/(app)/change-orders/page.tsx:169-171` (list
"Cost" column) and `src/app/(app)/change-orders/[id]/page.tsx` ("Estimated Cost"/"Approved Cost"
`DefRow`s) render cost unconditionally. Compare `src/app/print/change-orders/[id]/page.tsx:38`
(`canSeeMoney = hasPermission(user, FIN_VIEW)`) and `src/app/api/export/change-orders/route.ts:23-24`
(doc comment: "Costs are omitted for a user without financial access, so an export can never become a
way around the permission model"). The live page contradicts its own print/export siblings. Confirmed
live for CHIEF_ENGINEER and TECH_MANAGER (neither holds `FIN_VIEW`; both see full euro figures on
`/change-orders`) and for CAPTAIN. Severity: **High.**

**[X4] Every project-selection dropdown lists every project in the database, not the user's scope.**
`src/app/(app)/crew-requests/new/page.tsx:16` and `src/app/(app)/change-orders/new/page.tsx:15` both run
`prisma.project.findMany({ where: { archivedAt: null }, ... })` with no call to `listProjectsForUser`.
Live-confirmed for CREW: the "New Crew Request" project `<select>` lists both `R-00721 · M/Y Solstice`
and `R-00806 · M/Y Northern Light — Winter Maintenance Period` (a second vessel at a different yard,
Amico & Co, that CREW has no role assignment naming). This is the first *visibly* unscoped instance of
the already-logged tenancy gap (T1/C4) — every seeded user is unscoped today (`prisma.userRole.create`,
`prisma/seed.ts:164`, sets neither `projectId` nor `vesselId`), so nobody has seen it in a dropdown
before. Severity: **High** (compounds C4).

**[X5] Roles that create change orders hold none of the seven `CO_APPROVE_*` permissions, and the
Approvals Centre gives no indication this is by design.** PROJECT_MANAGER, CHIEF_ENGINEER, HOD and (per
reasoning) CHIEF_OFFICER can all raise/edit change orders but cannot decide any stage of any of them
(`src/lib/rbac.ts:82-198`; the seven stage permissions are enumerated at `src/lib/rbac.ts:12-18` and
`CO_STAGE_PERMISSION` in `src/lib/workflow/changeOrder.ts:11-19`). Live-confirmed for PROJECT_MANAGER:
`/approvals` shows "Waiting on You: All caught up. You have no pending approvals at this time." next to
a "15 pending" badge and a full "Pending with Other Approvers" table — the copy is identical to the
"you're genuinely caught up" case, so there's no way to tell "nothing pending" from "you can never be
an approver here." Severity: **Medium.**

---

## OWNER

Seeded: **Y** (`owner@oceancos.dev`)

Reachable scope: read-only across the entire built surface — every `*_VIEW` permission, including
`DOC_VIEW_CONFIDENTIAL`, plus `AUDIT_VIEW` and `EXPORT` — and **zero** create, edit, approve, request or
comment permissions anywhere (`src/lib/rbac.ts:83-90`).

- **[High] The Owner cannot comment on a job/quote at all, but can comment on any change order — an
  accident of which comment form remembered its own permission check, not a role decision.**
  `src/app/(app)/jobs/[id]/page.tsx:336` gates the comment box on `hasPermission(user, JOB_COMMENT)`,
  which OWNER lacks, so the box never renders. `src/app/(app)/change-orders/[id]/page.tsx:308-314`
  renders the change-order comment `<form>` with **no permission check at all** (the already-logged
  auth-security "[RBAC] — Comment actions have no view permission" finding) — so OWNER, despite holding
  no comment permission of any kind, successfully posts to change-order threads while being silently
  walled off job threads with no explanation for the asymmetry.
- **[High] No `CO_APPROVE_*` stage exists for OWNER at all.** The seven stages
  (`src/lib/rbac.ts:12-18`, `CAPTAIN`/`OWNERS_REP`/`YARD`/`FINANCE`/`TECH_MANAGER`/`CLASS`/`FLAG`) never
  include an owner stage — only `OWNERS_REP` acts on the owner's behalf. Combined with no `JOB_ACCEPT`,
  no `PROJ_EDIT` and no `JOB_REQUEST`/`CR_CREATE`, the person the whole platform exists to serve can
  never record a decision in it, on anything, under any circumstance. That may be the intended product
  shape (the Rep acts for them) but nothing in the UI says so — every "you can't do that" is a plain
  "Forbidden" panel or a missing button, never "ask your Owner's Rep."
- **[Medium] No `PROJ_EDIT`.** Owner cannot fix so much as their own project's currency or yard-period
  dates (`src/lib/rbac.ts:57`; only `OWNERS_REP`/`PROJECT_MANAGER` hold it, :92, :110).
- **[Low, confirmed live]** `/change-orders` correctly hides "New Change Order" for OWNER (no
  `CO_CREATE`) — `change-orders/page.tsx:67-71` behaves as designed; recorded as a confirmation, not a
  gap.

---

## OWNERS_REP

Seeded: **Y** (`rep@oceancos.dev`)

Reachable scope: the broadest operator role short of Owner itself — project edit, full job lifecycle
(accept/cancel/works-accept/deficiency, not issue-quote/countersign), full CO create/edit/submit +
`CO_APPROVE_OWNERS_REP`, crew-request triage/assign, financial view + approve, schedule/logistics edit,
drawing approve, confidential documents, contractor edit, audit view, export (`src/lib/rbac.ts:91-108`).

- **[Medium] `/admin` (gated on `ADM_USERS || AUDIT_VIEW`, `admin/page.tsx:13`) hands OWNERS_REP the
  full 12-account user directory with every email address and role assignment.** Confirmed live:
  Admin showed 12 users, 2 projects, 2 vessels, 12 departments and a 13-row audit log of raw `LOGIN`
  events. This is the already-logged Medium ("`ADM_USERS` dead, `AUDIT_VIEW` is the effective gate"),
  but the role-specific point is that an Owner's Rep — frequently an external management-company
  employee, not vessel crew — sees the private contact list of every crew member, yard PM, surveyor and
  class/flag contact on the platform as an incidental side effect of a page meant for oversight.
- **[Low] `CR_TRIAGE`/`CR_ASSIGN` without `CR_COMPLETE`** (`src/lib/rbac.ts:98`) — OWNERS_REP can triage
  and assign a crew request but never mark it complete or closed themselves; plausibly intentional
  separation of duties, noted for completeness rather than flagged as a defect.
- **Grant-vs-job verdict:** broadly matches a senior operator role; no missing module found. The one
  real mismatch (admin PII exposure) is inherited from the platform-wide `ADM_USERS`/`AUDIT_VIEW`
  conflation, not specific to this role's design.

---

## PROJECT_MANAGER

Seeded: **Y** (`pm@oceancos.dev`)

Reachable scope: near-identical to OWNERS_REP for the operational modules (full CO/CR lifecycle minus
approval, budget edit, schedule/logistics/inventory edit, drawing upload, contractor edit, audit view,
export), plus `PROJ_EDIT` — but **no `CO_APPROVE_*` of any kind**.

- **[High, confirmed live] PM raises, edits and submits every change order but can never approve one —
  see [X5].** `/approvals` for `pm@oceancos.dev` showed "Waiting on You: All caught up" with 15 items
  sitting in "Pending with Other Approvers" underneath, including CO-0001 at €38,000 needing five other
  roles' sign-off. Nothing distinguishes this from a healthy empty queue.
- **[Medium] `FIN_EDIT_BUDGET` (`src/lib/rbac.ts:116`), the permission that is literally PM's job
  description ("edit budget"), is dead code.** It is one of the 14 permissions the dead-code audit
  already found are never checked outside `rbac.ts` (`audit/findings-dead-code.md:126-132`). Concretely
  for PM: `/financials` (which PM can view) is `src/app/(app)/financials/page.tsx` — a pure read-only
  table with no edit control, no form, no server action anywhere in the codebase that consults
  `FIN_EDIT_BUDGET`. A Project Manager who wants to adjust a budget line after this session has zero
  path to do it, despite the role matrix implying they can.
- **[Medium]** Same `/admin` full-directory exposure as OWNERS_REP (cross-reference, not re-detailed).

---

## CAPTAIN

Seeded: **Y** (`captain@oceancos.dev`)

Reachable scope: job accept/cancel/works-accept/deficiency, `CO_CREATE` + `CO_APPROVE_CAPTAIN`, full
crew-request lifecycle, `FIN_VIEW`, schedule/logistics/inventory (edit), drawings/docs view, meeting
edit, risk edit (`src/lib/rbac.ts:127-137`).

- **[Critical] The Captain cannot create a crew request.** `CR_CREATE` is absent from CAPTAIN's grant
  (`src/lib/rbac.ts:127-137` lists `CR_VIEW, CR_TRIAGE, CR_ASSIGN, CR_COMPLETE` — no `CR_CREATE`).
  Confirmed live: `/crew-requests` for `captain@oceancos.dev` shows no "New" button (list page correctly
  hides it, `crew-requests/page.tsx:62`), and navigating straight to `/crew-requests/new` hits the
  app's own error boundary — a full-page "Not permitted / You do not have permission to do that." panel
  with "Try again" / "Back to dashboard" (screenshot `CAPTAIN__crew-requests-new.png`, captured live).
  The vessel's Captain — the single most obvious person to log an operational, safety or crew-welfare
  item — can only triage, assign and complete requests someone else raised. There is no read-only
  rationale here (unlike Owner): Captain is otherwise the most active vessel-side role in the matrix.
- **[High] Full CO cost visibility without a `FIN_VIEW` gate on the same record whose print view
  redacts it — see [X3].** Confirmed live on `/change-orders`: Captain's list shows real euro figures
  (€132,000, €87,500, €61,000, etc.) for every change order project-wide; not a personal problem for
  Captain (who does hold `FIN_VIEW`) but demonstrative of the inconsistency, since Captain is exactly
  the kind of role a stricter product decision might one day want off `FIN_VIEW`.
- **[High, confirmed live] `/admin` → "Forbidden — Admin tools are restricted."** — consistent with
  Captain holding neither `ADM_USERS` nor `AUDIT_VIEW`; Admin is a dead end on top of the
  unfiltered-sidebar Low already logged.
- **[Low] No `EXPORT` permission, but the export routes don't check it** — `api/export/change-orders`
  and `api/export/jobs` gate on `CO_VIEW`/`JOB_VIEW` (which Captain has), not `EXPORT`
  (`src/app/api/export/change-orders/route.ts:28-30`), so Captain can in practice export both
  spreadsheets despite the role matrix implying they can't. Decorative permission, already logged
  generically as dead code; noted here only because it happens to net out in Captain's favour.

---

## CHIEF_OFFICER

Seeded: **N — reasoned from `src/lib/rbac.ts` and route guards, not observed live.**

Reachable scope (rbac.ts:138-143): `JOB_VIEW, JOB_REQUEST, JOB_COMMENT, CO_VIEW, CR_VIEW, CR_CREATE,
CR_TRIAGE, CR_ASSIGN, SCH_VIEW, LOG_VIEW, INV_VIEW, INV_EDIT, DOC_VIEW, MTG_VIEW` — 14 keys, no
financial, drawing, risk, minutes or approval permission of any kind.

- **[High] No `RSK_VIEW` at all.** `src/app/(app)/risks/page.tsx:27` would render "Forbidden — Risk
  register is restricted" for this role. In a maritime organisation the Chief Officer is conventionally
  the safety/deck officer; a refit's risk register carries items like "long-lead glass not confirmed"
  and "class delay around stabilisers" (both seeded, dashboard "Top risks" data) that are squarely
  deck/safety-adjacent, and this role cannot see the register that tracks them at all.
- **[Medium] No `DRW_VIEW`.** `src/app/(app)/drawings/page.tsx:13` would forbid the drawings register —
  deck general-arrangement and fire/safety plans included — to the officer whose remit most needs them.
  Paired with the previous point, the role most associated with the ship's safety plan can see neither
  its drawings nor its risk register.
- **[Medium] No `MINUTES_RECORD`**, unlike `CAPTAIN`/`OWNERS_REP`/`PROJECT_MANAGER`/`YARD_PM`
  (`src/lib/rbac.ts:70,95,113,130,169`). On a job's comment thread the "Record minute" button is gated
  by exactly this permission (`src/app/(app)/jobs/[id]/page.tsx:346`), so Chief Officer can post a plain
  message but never a tagged minute, despite the officer traditionally responsible for the deck log.
- **[High, same defect as [X3]] `CO_VIEW` without `FIN_VIEW` still sees full change-order costs** on
  `/change-orders` and its detail page (unconditional `DefRow`s, no gate) — the one financial figure the
  role's grant is clearly trying to withhold leaks through a different door.
- **Never walked — explicit gap.** Nobody has ever confirmed live: how the crew-request
  workflow-button gap ([X2]) actually renders for this specific role (CHIEF_OFFICER holds `CR_TRIAGE`
  and `CR_ASSIGN` but not `CR_COMPLETE`, so the `COMPLETED` target would correctly be refused, but
  `IN_PROGRESS`/`BLOCKED`/`AWAITING_APPROVAL` remain gate-free exactly as for CREW); whether the
  dashboard's ungated risk table ([X1]) is the *only* place this role ever sees risk-register content
  since `/risks` itself is closed to them; and whether the `jobActions`/comment UI reads sensibly for a
  role with `JOB_REQUEST` + `JOB_COMMENT` but no `JOB_ACCEPT`/`JOB_CANCEL`. All three are exactly the
  kind of role-specific rendering question a live pass would resolve in seconds and a static read
  cannot fully settle.

---

## CHIEF_ENGINEER

Seeded: **Y** (`eng@oceancos.dev`)

Reachable scope: job view/request/comment, `CO_CREATE` (no approve), full crew-request lifecycle,
schedule view, inventory edit, drawings/docs/meetings/risk view+edit-risk (`src/lib/rbac.ts:144-150`).

- **[High, confirmed live] No `LOG_VIEW`.** `/logistics` → "Forbidden — Logistics is restricted"
  (screenshot `CHIEF_ENGINEER__logistics.png`, captured live). Logistics' own type taxonomy
  (`src/app/(app)/logistics/page.tsx:16-34`) includes `BUNKERING`, `CRANE`, `DELIVERY`, `SHIPMENT` —
  textbook engineering-department concerns during a yard period (fuel, heavy-lift for machinery
  removal, spare-parts shipments) — and the Chief Engineer, who can raise change orders for exactly this
  kind of work (`CO_CREATE`), cannot see any of it.
- **[High, confirmed live] No `FIN_VIEW`.** `/financials` → "Forbidden — Financials are restricted"
  (screenshot `CHIEF_ENGINEER__financials.png`). Reasonable to withhold the portfolio-wide budget, but
  Chief Engineer can originate change orders carrying cost estimates with zero way to check whether the
  engineering department's budget line can absorb them before raising one.
- **[High, confirmed live, same as [X3]]** `/change-orders` for `eng@oceancos.dev` renders the full
  "Cost" column with real figures (€38,000 … €132,000) despite no `FIN_VIEW` — the platform's own
  export-route comment says cost must never leak around the permission model, and here it does, in the
  primary UI, to exactly the role the model is trying to keep it from.
- **[Medium, [X5]]** `CO_CREATE` with no `CO_APPROVE_*` — same pattern as PROJECT_MANAGER: Chief
  Engineer can raise a change order but can never approve any stage of it, including an engineering one.
- **[High, same as [X4]]** `change-orders/new/page.tsx:15` lists every project database-wide for the
  "New Change Order" form's project picker, unfiltered by `listProjectsForUser` — reasoned to apply
  identically to Chief Engineer's own CO-creation flow (not separately re-confirmed live beyond the
  CREW instance, since the code path is shared and role-agnostic).

---

## PURSER

Seeded: **N — reasoned from `src/lib/rbac.ts` and route guards, not observed live.**

Reachable scope (rbac.ts:151-155): `CR_VIEW, CR_CREATE, CR_TRIAGE, FIN_VIEW, LOG_VIEW, LOG_EDIT,
DOC_VIEW, DOC_UPLOAD, MTG_VIEW` — **9 keys**, the second-smallest grant of all 19 roles (SUPPLIER has 1,
GUEST has 2). This is closer to CREW's scope than to any officer role, matching the task brief's own
framing, but even thinner than CREW in one specific and important way (below).

- **[Critical] No `JOB_VIEW` — the only vessel-side role in the entire matrix without it.** Every other
  role walked in this report (OWNER, OWNERS_REP, PROJECT_MANAGER, CAPTAIN, CHIEF_OFFICER,
  CHIEF_ENGINEER, HOD, CREW) holds `JOB_VIEW`. Purser does not (`src/lib/rbac.ts:151-155`), so `/jobs`
  is "Forbidden — Quotes are restricted" (`src/app/(app)/jobs/page.tsx:29-31`) unconditionally. The
  sidebar's very first workflow entry below Dashboard, "Quotes & requests" (`Sidebar.tsx:30`), is a
  guaranteed dead end for this role, with no explanation offered beyond the word "Forbidden." A Purser
  cannot even check whether a cabin refurbishment or a galley-equipment purchase — squarely their remit
  in real life — has been quoted, requested or accepted.
- **[High] No `SCH_VIEW`.** `/schedule` is closed (`schedule/page.tsx:121-128`). A role whose real job
  is largely about timing (provisioning ahead of guest arrivals, crew rotation around the yard period)
  has no view of the yard-period schedule at all, despite holding `LOG_VIEW`/`LOG_EDIT` — logistics
  without a schedule to plan logistics against.
- **[High] No `RSK_VIEW`, no `MTG_EDIT`, no `DOC_VIEW_CONFIDENTIAL`.** Purser cannot see the risk
  register or write meeting minutes (view-only via `MTG_VIEW`; `MTG_EDIT` is
  `OWNERS_REP`/`PROJECT_MANAGER`/`CAPTAIN`/`YARD_PM` only). More concretely: Purser holds `DOC_UPLOAD`
  — they are expected to put documents into the system — but if what they upload is typed `CONTRACT`,
  `INVOICE` or `PO`, `documents/page.tsx:18` filters it out of their own view of the register
  (`showConfidential` is false for Purser), so the uploader cannot see their own upload once it lands.
- **[High] No `CR_ASSIGN`/`CR_COMPLETE` — and the same button-rendering gap as CREW applies.** Per
  [X2], the crew-request detail page shows every transition button regardless of permission, so a
  Purser opening any request would still see and could click "Complete"/"Close" although `CR_COMPLETE`
  is absent from their grant; three of the ungated targets (`IN_PROGRESS`/`BLOCKED`/`AWAITING_APPROVAL`)
  would actually succeed for them.
- **[High] The role concept and the actual grant barely overlap.** "Crew welfare, provisioning, admin"
  maps to: `LOG_VIEW`/`LOG_EDIT` (Logistics carries a `PROVISIONING` type, `logistics/page.tsx:33`, so
  this is the one real lever), plus a sliver of crew-requests and documents. There is no welfare, HR,
  medical or guest-services module of any kind — `MEDICAL` exists only as a department code
  (`src/lib/enums.ts:165-177`) with no page behind it — so the platform has nothing purpose-built for
  roughly half of what a real Purser does, and the half it does support (provisioning) is folded into a
  generic "Logistics" module shared with crane bookings and customs.
- **No seeded account (README.md:46) is itself the headline finding for this role**, and specifically:
  nobody has ever confirmed whether Purser's `/dashboard` (which per [X1] would show them change-order
  and risk data they hold no permission for) looks as broken live as it reads in source, nor whether the
  "New Crew Request" form ([X4]) hands them the same cross-vessel project picker CREW got.

---

## HOD (Head of Department)

Seeded: **N — reasoned from `src/lib/rbac.ts` and route guards, not observed live.**

Reachable scope (rbac.ts:156-161): `JOB_VIEW, JOB_REQUEST, JOB_COMMENT, CO_VIEW, CR_VIEW, CR_CREATE,
CR_TRIAGE, CR_ASSIGN, CR_COMPLETE, SCH_VIEW, INV_VIEW, INV_EDIT, DOC_VIEW, MTG_VIEW` — 14 keys, the same
shape as CHIEF_OFFICER plus full crew-request lifecycle.

- **[Critical] Department scoping does not exist anywhere in the running application, so "Head of
  Department" is, in practice, identical to any other project-wide role holding the same keys.**
  - `UserRole.departmentId` is declared in the schema (`prisma/schema.prisma:72`) but is **never read
    by any query in `src/`** — an exhaustive grep for `departmentId` across `src/` returns zero matches
    outside `prisma/schema.prisma` itself.
  - It is also **never written**: `prisma/seed.ts:164` creates every seeded `UserRole` as
    `{ userId, roleId }` only, so even a manually-tested HOD account today would carry no department
    scope to test.
  - `listProjectsForUser` (`src/lib/project.ts:20-44`), the only scoping function in the codebase,
    branches on `projectId`/`vesselId` alone; there is no department branch to add HOD into even in
    principle without further work.
  - `ChangeOrder.departmentCode`, `CrewRequest.departmentCode`, `Budget.departmentCode` and
    `InventoryItem.departmentCode` (`prisma/schema.prisma:162,223,287,392`) are free-text display
    columns: a grep for `departmentCode` across `src/` returns exactly 8 files, and every one of them is
    either a create-form `<Select>` or a read-only table cell — none is a `where` clause.
  - Net effect: an HOD sees every department's crew requests and every department's change orders and
    inventory project-wide, not their department's slice — the entire premise the role's name promises.
- **[High] Even if scoping existed, HOD's own grant is too thin to run a department.** No `FIN_VIEW` (no
  budget line visibility for the department they're meant to run), no `LOG_VIEW` (no logistics/delivery
  visibility), no `DRW_VIEW` (no drawings), no `RSK_VIEW` (no risk register) — HOD can raise and comment
  on jobs and change orders but cannot see any of the supporting context a department head would need to
  do so responsibly.
- **[Medium, [X2]]** HOD does hold `CR_COMPLETE`, so most of the crew-request workflow buttons are
  legitimately theirs — but the three gate-free targets
  (`IN_PROGRESS`/`BLOCKED`/`AWAITING_APPROVAL`, `crew-requests/actions.ts:58-59`) are unchecked for HOD
  exactly as for every other role, so this is confirmed-applicable rather than novel to HOD.
- **[Low] Creating a job/change order/crew request never defaults the department field from the
  requester's own assignment** — `crew-requests/new/page.tsx` and `change-orders/new/page.tsx` both
  render `DEPARTMENTS` as a free, requester-independent `<Select>` with no pre-selection, which is
  consistent with the finding above (there is nothing to default *from*, since the requester's own
  department is never resolved) but means even the display-only `departmentCode` gets no help from the
  one role whose job title is "department."
- **No seeded account is the compounding problem**: the one gap most specific to this role's entire
  reason for existing (department scoping) is also the one gap a live walkthrough could never have
  caught differently, because it is a genuine absence in the data model and query layer, not a
  rendering quirk — a seeded HOD account today would look and behave exactly like CHIEF_OFFICER with
  three extra crew-request permissions, which is itself worth surfacing.

---

## CREW

Seeded: **Y** (`crew@oceancos.dev`)

Reachable scope: `JOB_VIEW, JOB_REQUEST, CR_VIEW, CR_CREATE, SCH_VIEW, MTG_VIEW` — the smallest grant of
any seeded account (6 keys) and, along with GUEST/SUPPLIER, the narrowest role in the matrix.

- **[Critical, confirmed live, [X1]] The dashboard leaks change-order and risk data with no `CO_VIEW`
  or `RSK_VIEW` check.** `crew@oceancos.dev`'s `/dashboard` correctly shows "Budget status: You don't
  have access to financial data." (the one gate that exists), but directly beneath it: a "Change orders
  by status" donut (11 total, broken out by group), an "Approvals waiting on you and others" table
  naming `CO-0001 Replace owner's suite carpet` at exactly `€38,000` across all five pending approval
  stages, and a "Top risks" table showing `Long-lead glass not confirmed` (CRITICAL) and `Class delay
  around stabilisers` (HIGH) — plus a raw `AuditLog`-backed "Recent activity" feed (`LOGIN`, `STATUS on
  Job`, `APPROVE on Job`, `REJECT on ChangeOrderApproval`, with entity ids). CREW holds none of
  `CO_VIEW`, `RSK_VIEW` or `AUDIT_VIEW`. Screenshot: `CREW__dashboard.png` (captured live; see
  methodology note on scratch-dir persistence). Cite `dashboard/page.tsx:33-54,224-226,256-300,302-344,
  348-376`.
- **[Critical, confirmed live, [X2]] CREW can move any crew request through three workflow states it
  holds no permission for.** Opening the one seeded crew request (`REQ-0001 — Generator 2 oil leak`,
  status `ASSIGNED`, department `ENGINEERING`, assigned to Ed Engineer — not Charlie Crew) as CREW
  renders a fully live "Workflow Actions" panel with buttons **Start Work, Mark Blocked, Await
  Approval, Complete** (verified via `page.locator("form button").allTextContents()` against the live
  page — the harness did not click any of them, staying read-only per instructions). CREW holds neither
  `CR_TRIAGE` nor `CR_COMPLETE`. Per [X2], `Start Work`→`IN_PROGRESS`, `Mark Blocked`→`BLOCKED` and
  `Await Approval`→`AWAITING_APPROVAL` have **no server-side permission check** (`crew-requests/
  actions.ts:58-59`) and would succeed; only `Complete`→`COMPLETED` would correctly throw (the app's new
  `error.tsx` boundary would catch it). The "Assignment" panel on the same page correctly hides its edit
  form for CREW (no `CR_ASSIGN`) — proof the pattern (check-then-hide) is known and simply wasn't
  applied to the transition buttons. Screenshot: `CREW__crew-request-detail.png`, route
  `/crew-requests/cmuhgkic60071w7la3ey252pd`.
- **[High, confirmed live, [X4]] The "New Crew Request" project picker lists both vessels.** Verified
  by reading the rendered `<select name="projectId">` options as CREW: `["R-00721 · M/Y Solstice —
  2026 Refit", "R-00806 · M/Y Northern Light — Winter Maintenance Period", ...]` — a deckhand on M/Y
  Solstice can plant a crew request against M/Y Northern Light, a vessel undergoing an unrelated
  Winter Maintenance Period at a different yard (Amico & Co), that they have no role assignment naming.
  Cite `crew-requests/new/page.tsx:16`.
- **[Medium] Full financial detail on every job in the worklist, for a role with the smallest grant in
  the app.** `/jobs` for `crew@oceancos.dev` shows the complete Pending/Accepted/Worklist tabs
  (screenshot `CREW__jobs.png`: 3 pending quotes worth €14,600/€5,200/€7,950, 8 accepted, 15 in the
  worklist), and each job's detail page renders full line-item pricing regardless of role
  (`jobs/[id]/page.tsx:176-219`, gated only by `JOB_VIEW`, which CREW has). Plausibly intentional (jobs
  are the shared worklist), but worth a proportionality check: a general crew member requesting a minor
  fix can browse into a €132,000 unrelated capital-works quote's exact unit pricing with no further
  permission needed.
- **[Low]** CREW correctly cannot comment on a job (`JOB_COMMENT` absent, `jobs/[id]/page.tsx:336`
  correctly hides the box) — noted as a working control, for balance.

---

## FINANCE

Seeded: **Y** (`finance@oceancos.dev`)

Reachable scope: `JOB_VIEW, CO_VIEW, CO_APPROVE_FINANCE, FIN_VIEW, FIN_EDIT_BUDGET, FIN_APPROVE,
DOC_VIEW, DOC_VIEW_CONFIDENTIAL, EXPORT` (`src/lib/rbac.ts:177-182`) — no schedule, no crew-request, no
drawing, no risk, no logistics visibility of any kind.

- **[Medium] `FIN_EDIT_BUDGET` and `FIN_APPROVE` are both dead permissions — the two capabilities that
  most define "Finance" as a role are non-functional.** As established under PROJECT_MANAGER,
  `FIN_EDIT_BUDGET` is checked nowhere outside `rbac.ts` (`audit/findings-dead-code.md:126-132`);
  `/financials` (confirmed live: full budget table renders correctly for Finance since `FIN_VIEW` is
  present) is entirely read-only — no edit control on any budget line, no approve/reject action, nothing
  that would consult `FIN_APPROVE` either. A Finance user's day-one experience of the one module built
  specifically for them is a dashboard, not a workbench.
- **[Medium] No `SCH_VIEW`.** Finance cannot see the project schedule at all — confirmed live,
  `/schedule` → "Forbidden — Schedule is restricted" for `finance@oceancos.dev`. For a role approving
  cost and schedule-impact figures on change orders (`CO_APPROVE_FINANCE`; the approval table shows a
  "Schedule Δ" column, `approvals/page.tsx:111`), having no way to cross-check that figure against the
  actual project timeline is a real gap for the one decision this role is specifically empowered to
  make.
- **[Low, confirmed live]** `/crew-requests` → "Access Restricted — You don't have access to crew
  requests." for `finance@oceancos.dev` — expected and appropriate; recorded as a confirmation.
- **[Medium, same as [X3], confirmed live via CHIEF_ENGINEER/TECH_MANAGER above]** Finance *does* hold
  `FIN_VIEW`, so the CO-cost-leak in [X3] does not personally disadvantage this role — but it does mean
  Finance's approval-stage cost figure on `/change-orders` is redundant with what every other `CO_VIEW`
  holder already sees for free, undercutting the idea that Finance's sign-off carries privileged
  financial insight the rest of the approval chain lacks.
- **Grant-vs-job verdict:** appropriately scoped to costs/budgets/confidential documents; the gap is not
  over- or under-permissioning but that the permissions granted (`FIN_EDIT_BUDGET`, `FIN_APPROVE`) have
  no UI or server action behind two of the three things Finance is nominally allowed to do.

---

## TECH_MANAGER

Seeded: **Y** (`tech@oceancos.dev`)

Reachable scope: `JOB_VIEW, JOB_COMMENT, CO_VIEW, CO_APPROVE_TECH, SCH_VIEW, DRW_VIEW, DRW_APPROVE,
DOC_VIEW, RSK_VIEW, RSK_EDIT` (`src/lib/rbac.ts:183-188`) — reviews and comments on jobs, approves the
technical stage of change orders, owns drawing approval and the risk register; cannot request a job,
create a change order, or see logistics, inventory or financials.

- **[High, confirmed live] No `FIN_VIEW`.** `/financials` → "Forbidden — Financials are restricted"
  for `tech@oceancos.dev`. Consistent with the role brief in this task ("owner-side technical authority
  reviewing yard quotes") — Tech Manager should judge technical merit, not budget — but see the next
  point: the platform doesn't actually separate the two.
- **[High, confirmed live, same as [X3]] `/change-orders` shows full cost figures anyway.** With no
  `FIN_VIEW`, `tech@oceancos.dev`'s change-orders list still renders every cost (€38,000 … €132,000)
  because the list/detail pages have no `FIN_VIEW` gate at all (only the print/export views do, per
  [X3]). Net effect: the one page where Tech Manager might reasonably be *expected* to see cost
  (reviewing a quote's technical/cost trade-off) does show it — the inconsistency is that this happens
  by accident of a missing gate elsewhere in the app, not by a deliberate decision that Tech Manager
  should see change-order cost; the same accident is what leaks cost to CHIEF_OFFICER and
  CHIEF_ENGINEER, who arguably shouldn't see it.
- **[Medium] No `LOG_VIEW`, no `INV_VIEW`.** A technical authority reviewing yard quotes has no
  visibility into logistics (equipment/parts delivery timing that would affect a quote's feasibility) or
  inventory (whether a spare already exists on board before approving a purchase quote).
- **[High, confirmed live] `/change-orders/new` correctly throws "Not permitted."** No `CO_CREATE` —
  confirmed live: the same error-boundary fallback CAPTAIN hit for crew requests renders here. This is
  *appropriate* (Tech Manager reviews/approves, doesn't originate change orders) and is recorded as a
  correct behaviour, not a gap — included for contrast with CAPTAIN's CR_CREATE gap, which is the same
  shape of defect landing on a role for which it makes no sense.
- **[High, confirmed live] `/admin` → "Forbidden — Admin tools are restricted."** No `AUDIT_VIEW`; the
  technical authority who approves changes with class/flag/technical impact has no audit trail of who
  did what to any of the records they're approving.
- **Grant-vs-job verdict:** the permission set is a reasonable first cut for "reviews and approves
  technical merit," but the missing `LOG_VIEW`/`INV_VIEW` and the accidental cost leak in [X3] mean the
  one review this role exists to perform (is this quote technically and financially sound, given what's
  already on board and already in transit) cannot be done end-to-end inside the platform as built.

---

## Summary answers to the four standing questions, by role

| Role | Grant vs. job | UI shows unactionable items | Missing page/feature the job needs | Wrong-persona copy |
|---|---|---|---|---|
| OWNER | Under-permissioned for any hands-on use — pure view, no comment/approve/create anywhere, no owner CO-approval stage | Sidebar's Jobs/Change-orders/Crew-requests "New" actions never appear, with no "ask your Rep" explanation | — | — |
| OWNERS_REP | Matches the job well | Admin page over-discloses PII as a side effect of the platform-wide `ADM_USERS`/`AUDIT_VIEW` conflation | — | — |
| PROJECT_MANAGER | Mismatched: owns the CO lifecycle end-to-end except the one thing ("approve") the role's peers expect; `FIN_EDIT_BUDGET` is fictional | Approvals Centre's permanent "All caught up" is indistinguishable from a real empty queue | A working budget-edit control (permission exists, nothing built) | — |
| CAPTAIN | Under-permissioned in one sharp, surprising way: no `CR_CREATE` | "New Crew Request" nav/CTA absent with no explanation; direct nav throws the generic error boundary | A way for the Captain to originate a crew/operational request | — |
| CHIEF_OFFICER *(reasoned)* | Under-permissioned for a safety/deck officer: no `RSK_VIEW`, `DRW_VIEW`, `MINUTES_RECORD` | Dashboard would still surface risk data ([X1]) despite `/risks` being closed to them | Risk register and drawings access; minute-taking on jobs | — |
| CHIEF_ENGINEER | Under-permissioned for machinery/engineering coordination: no `LOG_VIEW`, no `FIN_VIEW`, no CO approval | Full CO cost column shown despite no `FIN_VIEW` ([X3]) | Logistics visibility for parts/crane/bunkering tied to engineering jobs | — |
| PURSER *(reasoned)* | Severely under-permissioned and misconceived: no `JOB_VIEW` (unique among vessel roles), no `SCH_VIEW`, no welfare/HR module exists | Sidebar's "Quotes & requests" is a guaranteed dead end; own document uploads can become invisible to the uploader if typed CONTRACT/INVOICE/PO | A provisioning/welfare module distinct from generic Logistics; schedule visibility | Role concept ("crew welfare, provisioning, admin") barely maps to the actual grant (mostly logistics) |
| HOD *(reasoned)* | Conceptually broken: department scoping doesn't exist in the data model or queries at all | Would see every department's data on every list page it can open — no visual cue that this is wrong, since nothing is scoped for anyone | Department-level scoping (schema field exists, unused); `FIN_VIEW`, `LOG_VIEW`, `DRW_VIEW`, `RSK_VIEW` for running a department | "Head of Department" is the platform's own label for a scope it never implements |
| CREW | Correctly minimal on paper, but two live bugs hand it real write power ([X2]) and a full financial worklist it doesn't need | Workflow buttons for statuses CREW has no permission to reach; dashboard CO/risk panels despite no `CO_VIEW`/`RSK_VIEW` | — | — |
| FINANCE | Appropriately scoped, but `FIN_EDIT_BUDGET`/`FIN_APPROVE` are decorative | — | An actual budget-edit workbench | — |
| TECH_MANAGER | Reasonable first cut, undermined by missing `LOG_VIEW`/`INV_VIEW` and by the CO cost leak accidentally giving it something a stricter design might withhold | — | Logistics/inventory context for judging a quote's feasibility | — |
