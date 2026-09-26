# OceancOS — Permission matrix

Source: `src/lib/rbac.ts` (56 keys in `PERMISSIONS`, `ROLE_PERMISSIONS` for all 19 roles in
`RoleKey`), read in full for this pass. `npm run seed` derives the DB `Role`/`Permission`/
`RolePermission` tables directly from this same matrix (`prisma/seed.ts:5,50-56`), so there is
one source of grants, not two — the "two systems" in `audit/findings-dead-code.md` refers to
two *code paths that check* permissions (the static matrix via `hasPermission`, and five
hand-rolled DB traversals), not two different sets of grants.

Column codes (matching `RoleKey` in `src/lib/enums.ts`):

| Code | Role | Seeded dev account |
|---|---|---|
| OWNER | Owner | `owner@oceancos.dev` |
| REP | Owner's Rep | `rep@oceancos.dev` |
| PM | Project Manager | `pm@oceancos.dev` |
| CAPT | Captain | `captain@oceancos.dev` |
| CHOF | Chief Officer | — none |
| CENG | Chief Engineer | `eng@oceancos.dev` |
| PURS | Purser | — none |
| HOD | HOD (department head) | — none |
| CREW | Crew | `crew@oceancos.dev` |
| YPM | Yard PM | `yard@oceancos.dev` |
| YTL | Yard Trade Lead | — none |
| CTR | Contractor | `contractor@oceancos.dev` |
| SUP | Supplier | — none |
| FIN | Finance | `finance@oceancos.dev` |
| TECH | Technical Manager | `tech@oceancos.dev` |
| CLS | Class Surveyor | `class@oceancos.dev` |
| FLG | Flag Surveyor | `flag@oceancos.dev` |
| AUD | Auditor | — none |
| GST | Guest | — none |

`✓` = role holds the permission in `ROLE_PERMISSIONS`. Blank = does not.

---

## Role purpose, one line each (superyacht refit / new-build context)

- **OWNER** — the vessel's principal/ownership entity. Broadest *read* footprint of any role
  (view every module, confidential documents, the audit log, export) but holds almost no
  create/edit permission anywhere — reviews and is accountable, does not operate the system
  day to day. Seeded.
- **OWNERS_REP (REP)** — the owner's professional representative overseeing the refit on the
  owner's behalf. The single most broadly-privileged operating role: edits the project record,
  creates/edits/submits/cancels change orders, holds the owners'-rep approval stage, approves
  budgets (`FIN_APPROVE`, not `FIN_EDIT_BUDGET`), approves drawings, edits documents/
  contractors/meetings/risks. Seeded.
- **PROJECT_MANAGER (PM)** — the managing company's or owner's PM running the refit
  operationally. Near-identical breadth to Owners' Rep but the split is deliberate: PM *edits*
  the budget line items (`FIN_EDIT_BUDGET`) where REP *approves* them (`FIN_APPROVE`); PM also
  holds `CR_COMPLETE` and drawing/document upload rights REP does not need. PM holds no
  change-order approval stage of its own. Seeded.
- **CAPTAIN (CAPT)** — the vessel's captain. Raises and holds the captain approval stage on
  change orders, accepts/cancels/works-accepts quotes, triages and completes crew requests,
  edits inventory/meetings/risk register — the senior on-vessel operational authority. Seeded.
- **CHIEF_OFFICER (CHOF)** — deck department head under the captain. Raises jobs, creates and
  triages/assigns crew requests, views schedule/logistics, edits inventory for the deck
  department. **Not seeded — never walked through the app.**
- **CHIEF_ENGINEER (CENG)** — engineering department head. Raises jobs and change orders,
  manages crew requests for the engine room, views drawings and risk register, edits
  inventory. Seeded.
- **PURSER (PURS)** — onboard administration/accounts role. Intakes and triages crew requests,
  views finance, edits logistics, uploads documents — the purchasing/admin function on board.
  **Not seeded.**
- **HOD** — a generic "head of department" for departments other than deck/engineering (e.g.
  bosun, chief steward/ess). Same shape as Chief Officer: raises jobs, manages crew requests
  for the department, edits inventory. **Not seeded.**
- **CREW** — an ordinary crew member. Can raise a job request or a crew request for themself,
  view the schedule and meetings — the narrowest vessel-side operational role. Seeded.
- **YARD_PM (YPM)** — the shipyard's project manager, the yard's counterpart to Owners'
  Rep/PM. Issues quotes, countersigns accepted jobs, progresses and completes works, holds the
  yard approval stage on change orders, edits schedule/logistics/contractors. Seeded.
- **YARD_TRADE_LEAD (YTL)** — a yard trade foreman/lead (paint, mechanical, joinery…).
  Progresses jobs and comments on them, views schedule/logistics/drawings — shop-floor
  execution with no commercial or approval authority. **Not seeded.**
- **CONTRACTOR (CTR)** — an external specialist subcontractor engaged for part of the scope.
  Read-only: views jobs, change orders, schedule and documents relevant to their work.
  Seeded.
- **SUPPLIER (SUP)** — a materials/equipment supplier. Holds exactly one permission,
  `document.view` — no defined workflow of its own exists yet (see gap note below).
  **Not seeded.**
- **FINANCE (FIN)** — the finance/accounts function (owner's side or management company).
  Approves the finance stage of change orders, edits and approves budgets, views confidential
  documents, and is one of only four roles holding `EXPORT` (which nothing currently checks —
  see findings). Seeded.
- **TECH_MANAGER (TECH)** — the technical management company's oversight role. Approves the
  technical-manager stage of change orders, approves drawings, owns the risk register
  (`RSK_EDIT`). Seeded.
- **CLASS_SURVEYOR (CLS)** — classification society surveyor. Holds the class approval stage on
  change orders and views drawings/documents relevant to compliance; no editing rights
  anywhere. Seeded.
- **FLAG_SURVEYOR (FLG)** — flag-state surveyor. Mirrors Class Surveyor: holds the flag
  approval stage, views drawings/documents; no editing rights. Seeded.
- **AUDITOR (AUD)** — independent/compliance auditor. The broadest *pure read-only* role in the
  matrix — view access to jobs, change orders, crew requests, finance, schedule, logistics,
  inventory, drawings, documents, contractors, meetings, risk, and the audit log itself — with
  zero create/edit permissions anywhere. **Not seeded — the one role whose entire reason to
  exist is oversight has never been used to open the app.**
- **GUEST (GST)** — the most restricted role, presumably for a temporary or visiting party
  (e.g. a prospective buyer, a broker). Two permissions only: `change_order.view` and
  `schedule.view`. **Not seeded.**

12 of 19 roles have a seeded account; 7 do not (Chief Officer, Purser, HOD, Yard Trade Lead,
Supplier, Auditor, Guest) — matching `SITE_MAP.md` and `README.md`'s seeded-accounts table
exactly, and tracked as `ACTION_PLAN.md` **G6.9**.

---

## Matrix, grouped by module

### Change orders

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `change_order.view` (CO_VIEW) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `change_order.create` (CO_CREATE) | | ✓ | ✓ | ✓ | | ✓ | | | | | | | | | | | | | |
| `change_order.edit` (CO_EDIT) | | ✓ | ✓ | | | | | | | | | | | | | | | | |
| `change_order.submit` (CO_SUBMIT) | | ✓ | ✓ | | | | | | | | | | | | | | | | |
| `change_order.approve.captain` (CO_APPROVE_CAPTAIN) | | | | ✓ | | | | | | | | | | | | | | | |
| `change_order.approve.owners_rep` (CO_APPROVE_OWNERS_REP) | | ✓ | | | | | | | | | | | | | | | | | |
| `change_order.approve.yard` (CO_APPROVE_YARD) | | | | | | | | | | ✓ | | | | | | | | | |
| `change_order.approve.finance` (CO_APPROVE_FINANCE) | | | | | | | | | | | | | | ✓ | | | | | |
| `change_order.approve.tech_manager` (CO_APPROVE_TECH) | | | | | | | | | | | | | | | ✓ | | | | |
| `change_order.approve.class` (CO_APPROVE_CLASS) | | | | | | | | | | | | | | | | ✓ | | | |
| `change_order.approve.flag` (CO_APPROVE_FLAG) | | | | | | | | | | | | | | | | | ✓ | | |
| `change_order.cancel` (CO_CANCEL) | | ✓ | | | | | | | | | | | | | | | | | |

Note: CAPTAIN and CHIEF_ENGINEER hold `CO_CREATE` but none of `CO_EDIT`/`CO_SUBMIT`/
`CO_CANCEL` — cited in `audit/findings-workflow-logic.md` "Roles that can raise a change order
cannot submit, edit or cancel it, and drafts notify nobody."

### Crew requests

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `crew_request.view` (CR_VIEW) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | | | | | ✓ | |
| `crew_request.create` (CR_CREATE) | | | | | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | | | | | | |
| `crew_request.triage` (CR_TRIAGE) | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | | | | | | | |
| `crew_request.assign` (CR_ASSIGN) | | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | | | | | | | | | | | |
| `crew_request.complete` (CR_COMPLETE) | | | ✓ | ✓ | | ✓ | | ✓ | | | | | | | | | | | |

Note: none of OWNERS_REP, PROJECT_MANAGER or CAPTAIN holds `CR_CREATE` — only the
department-level/crew roles (Chief Officer, Chief Engineer, Purser, HOD, Crew) can originate a
crew request, though the management roles can triage, assign and (PM/Captain) complete one.

### Financials

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `financial.view` (FIN_VIEW) | ✓ | ✓ | ✓ | ✓ | | | ✓ | | | | | | | ✓ | | | | ✓ | |
| `financial.budget.edit` (FIN_EDIT_BUDGET) | | | ✓ | | | | | | | | | | | ✓ | | | | | |
| `financial.approve` (FIN_APPROVE) | | ✓ | | | | | | | | | | | | ✓ | | | | | |

**Neither `FIN_EDIT_BUDGET` nor `FIN_APPROVE` is checked anywhere in application code** —
dead grants (see Part 2 findings below).

### Schedule

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `schedule.view` (SCH_VIEW) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ | | | ✓ | ✓ |
| `schedule.edit` (SCH_EDIT) | | ✓ | ✓ | | | | | | | ✓ | | | | | | | | | |

`SCH_EDIT` is never checked anywhere — dead grant.

### Logistics

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `logistics.view` (LOG_VIEW) | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | | | ✓ | ✓ | | | | | | | ✓ | |
| `logistics.edit` (LOG_EDIT) | | ✓ | ✓ | | | | ✓ | | | ✓ | | | | | | | | | |

`LOG_EDIT` is never checked anywhere — dead grant.

### Inventory

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `inventory.view` (INV_VIEW) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | | | | | | | | | | ✓ | |
| `inventory.edit` (INV_EDIT) | | | ✓ | ✓ | ✓ | ✓ | | ✓ | | | | | | | | | | | |

`INV_EDIT` is never checked anywhere — dead grant, and it's the widest-held dead grant (5
roles).

### Drawings

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `drawing.view` (DRW_VIEW) | ✓ | ✓ | ✓ | ✓ | | ✓ | | | | ✓ | ✓ | | | | ✓ | ✓ | ✓ | ✓ | |
| `drawing.upload` (DRW_UPLOAD) | | | ✓ | | | | | | | | | | | | | | | | |
| `drawing.approve` (DRW_APPROVE) | | ✓ | | | | | | | | | | | | | ✓ | | | | |

`DRW_UPLOAD` and `DRW_APPROVE` are never checked anywhere — dead grants.

### Documents

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `document.view` (DOC_VIEW) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `document.upload` (DOC_UPLOAD) | | ✓ | ✓ | | | | ✓ | | | | | | | | | | | | |
| `document.view.confidential` (DOC_VIEW_CONFIDENTIAL) | ✓ | ✓ | | | | | | | | | | | | ✓ | | | | | |

Note: neither YARD_PM nor YARD_TRADE_LEAD holds `DOC_VIEW` at all. `DOC_UPLOAD` is never
checked anywhere — dead grant.

### Contractors

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `contractor.view` (CON_VIEW) | ✓ | ✓ | ✓ | ✓ | | | | | | ✓ | | | | | | | | ✓ | |
| `contractor.edit` (CON_EDIT) | | ✓ | ✓ | | | | | | | ✓ | | | | | | | | | |

`CON_EDIT` is never checked anywhere — dead grant.

### Meetings

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `meeting.view` (MTG_VIEW) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | | | | ✓ | |
| `meeting.edit` (MTG_EDIT) | | ✓ | ✓ | ✓ | | | | ✓ | | | | | | | | | | | |

`MTG_EDIT` is never checked anywhere — dead grant.

### Risks

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `risk.view` (RSK_VIEW) | ✓ | ✓ | ✓ | ✓ | | ✓ | | | | | | | | | ✓ | | | ✓ | |
| `risk.edit` (RSK_EDIT) | | ✓ | ✓ | ✓ | | | | | | | | | | | ✓ | | | | |

`RSK_EDIT` is never checked anywhere — dead grant.

### Projects

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `project.edit` (PROJ_EDIT) | | ✓ | ✓ | | | | | | | | | | | | | | | | |

Enforced, but with no scope check on which project — `updateProjectAction` edits any project
by id (`audit/findings-auth-security.md` "`updateProjectAction` edits any project by id, with
no scope check").

### Jobs & quotes

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `job.view` (JOB_VIEW) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | | ✓ | |
| `job.request` (JOB_REQUEST) | | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | | | | | | | | | |
| `job.issue_quote` (JOB_ISSUE_QUOTE) | | | | | | | | | | ✓ | | | | | | | | | |
| `job.accept` (JOB_ACCEPT) | | ✓ | ✓ | ✓ | | | | | | | | | | | | | | | |
| `job.countersign` (JOB_COUNTERSIGN) | | | | | | | | | | ✓ | | | | | | | | | |
| `job.cancel` (JOB_CANCEL) | | ✓ | ✓ | ✓ | | | | | | ✓ | | | | | | | | | |
| `job.progress` (JOB_PROGRESS) | | | | | | | | | | ✓ | ✓ | | | | | | | | |
| `job.complete` (JOB_COMPLETE) | | | | | | | | | | ✓ | | | | | | | | | |
| `job.works_accept` (JOB_WORKS_ACCEPT) | | ✓ | ✓ | ✓ | | | | | | | | | | | | | | | |
| `job.deficiency` (JOB_DEFICIENCY) | | ✓ | ✓ | ✓ | | | | | | | | | | | | | | | |
| `job.comment` (JOB_COMMENT) | | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | | ✓ | ✓ | | | | ✓ | | | | |

All 11 job/quote permissions are enforced (this is the finished subsystem — see `SITE_MAP.md`
"the quality gradient runs from `/jobs` outward").

### Minutes

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `minutes.record` (MINUTES_RECORD) | | ✓ | ✓ | ✓ | | | | | | ✓ | | | | | | | | | |

### Admin

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `admin.users` (ADM_USERS) | | | | | | | | | | | | | | | | | | | |
| `admin.roles` (ADM_ROLES) | | | | | | | | | | | | | | | | | | | |
| `admin.settings` (ADM_SETTINGS) | | | | | | | | | | | | | | | | | | | |

All three rows are entirely blank — granted to **no role**, confirming `SITE_MAP.md`'s note
verbatim. `ADM_USERS` is checked in code anyway (`admin/page.tsx:13`) and can therefore never
pass for anyone; `ADM_ROLES`/`ADM_SETTINGS` are never checked at all. Full detail in Part 2
findings below.

### Audit & export

| Permission | OWNER | REP | PM | CAPT | CHOF | CENG | PURS | HOD | CREW | YPM | YTL | CTR | SUP | FIN | TECH | CLS | FLG | AUD | GST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `audit.view` (AUDIT_VIEW) | ✓ | ✓ | ✓ | | | | | | | | | | | | | | | ✓ | |
| `export` (EXPORT) | ✓ | ✓ | ✓ | | | | | | | | | | | ✓ | | | | | |

`EXPORT` is never checked anywhere — dead grant (the export routes gate on `CO_VIEW`/
`JOB_VIEW` instead, per `audit/findings-dead-code.md`).

---

## Cross-reference: grant vs. enforcement, all 56 keys

Enforcement was checked by grepping every `hasPermission(`/`assertPermission(` call site in
`src/` (32 files, ~90 call sites) plus the five hand-rolled DB `RolePermission` traversals
noted in `audit/findings-dead-code.md` (`jobs/actions.ts:75-78,131-134`,
`change-orders/actions.ts:119-122`, `jobs/new/page.tsx:37`, `jobs/[id]/accept/actions.ts:237-238`),
since those also gate real code paths even though they bypass `hasPermission`.

- **(a) Granted to ≥1 role and enforced somewhere** — **41 of 56 keys**. This includes every
  key in Change Orders (view/create/edit/submit/cancel/all 7 approval stages), Crew Requests
  (all 5), `FIN_VIEW`, `SCH_VIEW`, `LOG_VIEW`, `INV_VIEW`, `DRW_VIEW`, `DOC_VIEW`,
  `DOC_VIEW_CONFIDENTIAL`, `CON_VIEW`, `MTG_VIEW`, `RSK_VIEW`, `PROJ_EDIT`, all 11 Jobs & Quotes
  keys, `MINUTES_RECORD`, and `AUDIT_VIEW`.
- **(b) Granted but never checked anywhere — dead grant** — **14 of 56 keys**, matching
  `audit/findings-dead-code.md`'s count exactly (re-verified by grep here against every
  `hasPermission`/`assertPermission` call site and every hand-rolled DB permission traversal,
  not re-derived by a different method — the same 14 names): `FIN_EDIT_BUDGET`, `FIN_APPROVE`,
  `SCH_EDIT`, `LOG_EDIT`, `INV_EDIT`, `DRW_UPLOAD`, `DRW_APPROVE`, `DOC_UPLOAD`, `CON_EDIT`,
  `MTG_EDIT`, `RSK_EDIT`, `EXPORT` (12 keys, each granted to at least one real role — the
  "textbook" dead grant), plus `ADM_ROLES` and `ADM_SETTINGS` (2 keys granted to **zero** roles
  *and* never checked — doubly vestigial, worse than a dead grant since there is no role for
  which "granting the guard" would even be a well-formed fix).
- **(c) Checked in code but can never pass for any role's actual grants — broken/unreachable
  guard** — **1 of 56 keys**: `ADM_USERS` (`admin/page.tsx:13`), already the known finding in
  `audit/findings-auth-security.md` ("the admin user directory is gated on `audit.view`, and no
  role is granted `admin.users`"). No other checked key is unreachable — every other key that
  appears in a `hasPermission`/`assertPermission` call, or in a hand-rolled DB traversal, is
  granted to at least one role, so every other guard in the codebase *can* pass for someone.

41 + 14 + 1 = 56, accounting for every key exactly once. `admin.users`/`admin.roles`/
`admin.settings` are the three keys `SITE_MAP.md` already flags as "granted to no role"; this
pass confirms all three are still granted to nobody, and additionally establishes that they
split into two different failure modes — `ADM_USERS` is an active, unreachable *guard* (case
c), while `ADM_ROLES`/`ADM_SETTINGS` are inert declarations nothing ever reads (case b).

Full detail, severities and file:line citations for every (b) and (c) beyond the three known
`admin.*` keys are in `audit/findings-notifications-permissions.md`.
