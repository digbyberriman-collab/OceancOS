# Findings — role walkthrough: yard-side and external roles

Scope: eight roles whose relationship to the project is yard-side or external to the owner's
organisation — `YARD_PM`, `YARD_TRADE_LEAD`, `CONTRACTOR`, `SUPPLIER`, `CLASS_SURVEYOR`,
`FLAG_SURVEYOR`, `AUDITOR`, `GUEST`. Four have a seeded dev account and were walked through live with
Playwright against the running dev server (read-only — no records created, edited or deleted). Four
have no seeded account (`YARD_TRADE_LEAD`, `SUPPLIER`, `AUDITOR`, `GUEST`) and are reasoned statically
from `src/lib/rbac.ts` and the route guards under `src/app/(app)/`; that reasoning is marked
**[static]** throughout and is a ceiling on what the role could do if someone were logged in as it
today, not a confirmed observation.

This file does not re-log findings already in `AUDIT_REPORT.md` or the other `audit/findings-*.md`
files (the demo-credential leak, the unscoped `/suppliers` page, the ungated comment actions, the
crew-request transition gaps, the sidebar showing every destination to every role, the ten
list-only scaffold modules). Where one of those pre-existing defects lands with unusual force on a
specific role in this set, it is cited by its existing location and reframed for that role rather
than re-scored.

Screenshots: `/tmp/audit-scripts/screenshots/{yard_pm,contractor,class,flag}*.png`. Live walkthrough
transcript: `/tmp/audit-scripts/yard_external_log2.txt`.

Counts (this file only) — Critical: 10 · High: 8 · Medium: 8 · Low: 5

---

## YARD_PM — seeded Y (`yard@oceancos.dev`)

Reachable scope, live-confirmed: Dashboard, Quotes & requests (full read/quote/countersign/progress),
Change Orders (view + the YARD approval stage), Approvals, Schedule (view/edit), Logistics
(view/edit), Drawings (view), Meetings (view), Contractors (view/edit), Notifications, Search. Blocked:
new job requests, Crew Requests, Financials, Inventory, Documents, Risks, Admin.

- **[RBAC] Yard PM cannot view Documents, which explicitly houses RAMs and certs** — Severity: High.
  `YARD_PM`'s grant (`src/lib/rbac.ts:166-173`) has no `DOC_VIEW`. Live: `/documents` renders
  "Forbidden — Documents are restricted." (`yard_pm_documents.png`) while the same page's own subtitle
  for roles that can see it reads "Upload contracts, certs, manuals, **RAMs**, minutes"
  (`src/app/(app)/documents/page.tsx`). A yard PM running site work is the person who most needs to
  reference and reconcile RAMs (risk assessment method statements) and certificates against class/flag
  requirements; as modelled they cannot open the module at all, with no explanation beyond the generic
  "Documents are restricted."

- **[TENANCY] Unscoped provisioning gives the Yard PM every vessel on the platform, not the one it is engaged for** — Severity: Critical.
  The seed creates every yard/external `UserRole` with no `projectId`/`vesselId`
  (`prisma/seed.ts:147,155-165`), and `listProjectsForUser` treats an unscoped role as "sees every
  active project" (`src/lib/project.ts:24-26,36-46`). Live: the project switcher and Dashboard both
  list `R-00721 · M/Y Solstice` **and** `R-00806 · M/Y Northern Light`
  (`yard_pm_dashboard.png`), and the Dashboard's own subtitle is "Live operational view across all
  active vessels and projects" (`src/app/(app)/dashboard/page.tsx:149`). A yard PM contracted for one
  refit can switch into and read a second vessel's change orders, jobs and budgets it has no
  relationship to. There is no admin UI to scope a `UserRole` to a project — `/admin` is read-only
  (`SITE_MAP.md:57`) — so this is not a seed-data quirk that a real deployment would naturally avoid;
  nothing in the product can set it correctly.

- **[WORKFLOW] The YARD approval-stage buttons render out of order, confirmed live for this role** — Severity: Medium (pre-existing finding, live-confirmed for `YARD_PM`).
  Opening `CO-0001` as `yard@oceancos.dev` shows "1. CAPTAIN PENDING · 2. TECH MANAGER PENDING ·
  3. YARD PENDING — Approve / Request Info / Reject" (`yard_pm__co_detail.png`): the Yard PM's decision
  buttons are live and clickable while the two stages ahead of it in the chain are still undecided.
  Already logged as `findings-workflow-logic.md:605-634` ("the approval chain's order is stored but
  never enforced"); recorded here only as the concrete instance a Yard PM will actually click through.

---

## YARD_TRADE_LEAD — seeded N — **[static]**

No seeded account exists (`README.md:46`, `SITE_MAP.md:138-140`), so nothing below has been walked
through in a browser; it is the ceiling `src/lib/rbac.ts:174` and the route guards allow. Reachable
scope if provisioned today: `/jobs` and `/jobs/[id]` (view + progress + comment), `/change-orders`
(view only), `/schedule`, `/logistics` (view only), `/drawings` (view only). Everything else 403s.

- **[MISSING ACCOUNT] Never walked through** — Severity: Medium. Confirmed absent from
  `prisma/seed.ts`; `README.md:46-47` and `SITE_MAP.md:138-140` both flag this. A role whose entire
  point is a filtered, trade-specific worklist has never had its filtered view looked at by a human.

- **[RBAC] "Trade" is not a concept anywhere the role could be scoped by** — Severity: High.
  `YARD_TRADE_LEAD`'s grant is `[JOB_VIEW, JOB_PROGRESS, JOB_COMMENT, CO_VIEW, SCH_VIEW, LOG_VIEW,
  DRW_VIEW]` (`src/lib/rbac.ts:174`) — project-level, not trade-level. The only `trade` field in the
  schema is `Contractor.trade` (`prisma/schema.prisma:456-458`), a free-text attribute of an external
  company directory row; `Job`, `JobSection`, `User` and `UserRole` have no trade field at all
  (`prisma/schema.prisma:630+`, `:14-28`, `:66-78`). There is no mechanism — not a filter, not a
  join table — that could ever produce "my trade's worklist." As built, a Trade Lead's `JOB_VIEW` is
  identical to the Yard PM's: every job in every section (Dry Dock, Interior, Engineering, Projects,
  Services) for every project the role is scoped to.

- **[RBAC] `JOB_PROGRESS` is not bounded to the lead's own trade** — Severity: High. `setJobProgress`
  (`src/app/(app)/jobs/actions.ts:410-420`) checks `JOB_PROGRESS` and project membership via `loadJob`,
  nothing else. A Trade Lead granted this permission could set the progress percentage on any job in
  the project — plumbing, paint, engineering, all of it — not only the jobs their trade is performing.
  This is the same root cause as the item above (no trade scoping exists to check against), but a
  distinct write-surface consequence: over-broad write, not just over-broad read.

- **[TENANCY] Same unscoped-seed risk as every other external role, if provisioned the same way** —
  Severity: High (inferred). `prisma/seed.ts:147-165` applies one unscoped `UserRole` pattern to every
  yard/external account; nothing about `YARD_TRADE_LEAD` would be treated differently were an account
  added the same way, which would repeat the Yard PM's cross-project exposure (above) for a role with
  an even narrower intended scope (one trade, one job site).

---

## CONTRACTOR — seeded Y (`contractor@oceancos.dev`)

Reachable scope, live-confirmed: Dashboard, Quotes & requests (view only — the full project worklist,
not a filtered one), Change Orders (view + an unrestricted comment box), Documents (view), Suppliers
(view, via the pre-existing unguarded page), Notifications, Search. Blocked: new job requests, Crew
Requests, Financials, Logistics, Inventory, Drawings, Meetings, Risks, Contractors, Admin.

- **[RBAC] A contractor sees full per-line pricing for every trade on the vessel, not only its own scope** — Severity: High.
  `Job` has no assignment field to a contractor or trade at all (`prisma/schema.prisma:630+` — no
  `contractorId`, no trade FK), and `CONTRACTOR`'s grant (`src/lib/rbac.ts:175`) is plain `JOB_VIEW`.
  Live: `contractor@oceancos.dev` on `/jobs` sees the identical 4-group, 15-job worklist the Yard PM
  sees (`contractor_jobs.png`), and opening `E.2500.10` — sludge/waste-oil disposal, a trade this
  contractor almost certainly has nothing to do with — shows the full line-item breakdown: "Labour —
  skilled worker · 30 HR · €68 · €2,040" and "Materials and consumables · €1,360"
  (`contractor__job_detail.png`). One external contractor can read exactly what the yard billed every
  other contractor for every other trade on the refit — a real commercial-confidentiality problem for
  "an external party doing scoped work," which is the opposite of scoped.

- **[RBAC] The one job a contractor can see, it cannot ask a question about** — Severity: Medium.
  `CONTRACTOR` has no `JOB_COMMENT` (`src/lib/rbac.ts:175`), and the job-detail comment box is gated on
  exactly that permission (`src/app/(app)/jobs/[id]/page.tsx:336`). Live: the contractor's job-detail
  page shows "COMMENTS — No comments yet." with no add-a-comment form at all
  (`contractor__job_detail.png`), where the same page for `yard@oceancos.dev` on the same job shows
  "ADD A COMMENT — Send message / Record minute" (`yard_pm__job_detail.png`). An external party doing
  scoped work that they can view in full has no in-product channel to flag a problem or ask a question
  about it.

- **[RBAC] …yet the same contractor can post, unrestricted, on any change order in the database** —
  Severity: Medium (pre-existing Critical, reframed for this role). `addChangeOrderComment`
  (`src/app/(app)/change-orders/actions.ts:218-234`) checks nothing but `requireUser()` — no `CO_VIEW`,
  no project match (already logged: `audit/findings-auth-security.md:469-475`,
  `audit/findings-data-api.md:865-904`). Live: `contractor@oceancos.dev` opening `CO-0001` — "Replace
  owner's suite carpet," nothing to do with any contracted trade — is shown a live "ADD A COMMENT / Post
  Comment" form (`contractor__co_detail.png`). The net effect for this role is backwards: no comment
  path on the one record type it is scoped to work through (jobs), an open one on the record type it
  has no operational reason to write to (change orders).

- **[TENANCY] Cross-project exposure, live-confirmed for a Contractor account** — Severity: Critical.
  Same mechanism as the Yard PM finding above (unscoped `UserRole`, `prisma/seed.ts:152,155-165`):
  `contractor@oceancos.dev`'s Dashboard reads "Live operational view across all active vessels and
  projects" and lists both `R-00721` and `R-00806` in the project switcher
  (`contractor_dashboard.png`). A contractor engaged for one vessel's refit can read a second,
  unrelated vessel's change-order register.

- **[RBAC] Dashboard and Approvals ignore the contractor's actual grant** — Severity: Critical.
  `dashboard/page.tsx` computes `coOpen`, `coPending`, `myApprovals` and `recent` (the platform's last
  10 audit-log rows) with no permission check at all (`src/app/(app)/dashboard/page.tsx:33-54,65-69`),
  and renders the "Approvals waiting on you and others" table and "Top risks" panel unconditionally
  (`:256-300`, `:302-344`). `/approvals` has no page-level permission check whatsoever
  (`src/app/(app)/approvals/page.tsx` — no `hasPermission`/`assertPermission` call gates the page
  itself, only which rows land in "Waiting on You" vs "Pending with Other Approvers"). Live:
  `contractor@oceancos.dev`'s `/approvals` shows "PENDING WITH OTHER APPROVERS · 15" with every stage
  (CAPTAIN, TECH MANAGER, YARD, OWNERS REP, FINANCE), every change-order number, title and cost, for a
  role that holds `CO_VIEW` but zero `CO_APPROVE_*` permission and no legitimate reason to see the
  internal approval workflow at all. The same pattern hits `SUPPLIER` and `GUEST` even harder (see
  below), since neither holds `CO_VIEW` in the first place.

---

## SUPPLIER — seeded N — **[static]**

No seeded account exists (`README.md:46`, `SITE_MAP.md:138-140`). Grant is `[DOC_VIEW]`
(`src/lib/rbac.ts:176`) — the smallest of any role in the matrix. Reachable scope if provisioned today:
`/documents` (view only, non-confidential). Every other guarded page 403s. `/suppliers` and the
Dashboard are reachable regardless of grant (see below) purely because those two pages carry no
permission check at all.

- **[MISSING ACCOUNT] Never walked through** — Severity: Medium. Same absence as `YARD_TRADE_LEAD`,
  `AUDITOR`, `GUEST` (`README.md:46-47`).

- **[RBAC] No permission exists for the resource this role is defined around** — Severity: Medium.
  `PurchaseOrder` is a real, migrated model (`prisma/schema.prisma:314-327`, status workflow
  `DRAFT|SUBMITTED|APPROVED|REJECTED|RECEIVED|CLOSED`), but `PERMISSIONS`
  (`src/lib/rbac.ts:6-77`) has no `purchase_order.*` key at all — unlike every other scaffolded module,
  which at least got a `_VIEW` permission wired to a page guard (`SCH_VIEW`/`schedule/page.tsx:27`,
  `LOG_VIEW`/`logistics/page.tsx:62`, `INV_VIEW`/`inventory/page.tsx:55`, `DRW_VIEW`, `CON_VIEW`, etc.).
  This is not "the PO module isn't built" (out of scope per `SITE_MAP.md`) — it is that the permission
  matrix, which is a working, enforced file today, was never extended for the one record type
  `SUPPLIER` exists to interact with, so `SUPPLIER`'s grant defaults to an unrelated permission
  (`DOC_VIEW`) instead.

- **[RBAC] The one page a Supplier can reach on its own grant is not the one it can actually reach** —
  Severity: Low. Because `/suppliers` has no permission check at all (pre-existing Critical, "the
  unguarded suppliers page," `AUDIT_REPORT.md` §6), a `SUPPLIER` account can see the Suppliers
  directory — but only by accident of that bug, not because `DOC_VIEW` covers it. Meanwhile the one
  thing `DOC_VIEW` does legitimately grant (`/documents`) is a scaffold with nothing in it. Net effect:
  a Supplier account has no reachable page that is both intentionally granted and populated.

- **[RBAC] Dashboard exposes company-wide change-order and audit data to a role with zero `CO_VIEW`** —
  Severity: Critical. As detailed under `CONTRACTOR` above, `dashboard/page.tsx:33-54,65-69,256-300`
  and `approvals/page.tsx` carry no permission gate on the change-order stat cards, the CO-by-status
  donut, the "Approvals waiting on you and others" table (real CO numbers, titles and costs across all
  five approval stages) or the platform's last-10-row audit log (`:347-376`, no `AUDIT_VIEW` check).
  `SUPPLIER` is the sharpest instance of this in the whole role set: it is the only one of the eight
  roles that holds neither `CO_VIEW` nor `RSK_VIEW` nor `AUDIT_VIEW`, so every one of those panels is
  pure permission bypass for this role specifically, not merely over-broad scope on top of a legitimate
  grant.

---

## CLASS_SURVEYOR — seeded Y (`class@oceancos.dev`)

Reachable scope, live-confirmed: Dashboard, Change Orders (view + the CLASS approval stage, plus an
unrestricted comment box on every CO), Approvals, Drawings (view), Documents (view), Suppliers (view,
unguarded page), Notifications. Blocked: Quotes & requests, Crew Requests, Schedule, Financials,
Contractors, Admin.

- **[RBAC] A class surveyor cannot see the schedule, which has a milestone type built for exactly this role** — Severity: High.
  `CLASS_SURVEYOR`'s grant (`src/lib/rbac.ts:189`) has no `SCH_VIEW`. Live: `/schedule` renders
  "Forbidden — Schedule is restricted." (`class_schedule.png`). Yet `MILESTONE_TYPE_LABEL` in
  `src/app/(app)/schedule/page.tsx:27-36` defines a dedicated `CLASS_INSPECTION → "Class"` milestone
  type, and the seeded schedule has one: `yard_pm_schedule.png` shows "Class inspection · PENDING ·
  15 May 2026 · Class · 133d ago." The one role the milestone type exists for cannot see the page that
  shows it, with no in-product explanation beyond the generic "Schedule is restricted."

- **[RBAC] `CO_APPROVE_CLASS` is not scoped to the vessel under survey** — Severity: Critical.
  `decideChangeOrderApproval` (`src/app/(app)/change-orders/actions.ts:140-155`) checks only that the
  caller holds the stage's permission — no project or vessel match against the change order being
  decided. Combined with the unscoped provisioning below, a Class Surveyor engaged for one vessel's
  class renewal can approve, reject or request info on the CLASS stage of a change order belonging to
  any project on the platform. For a role the task brief itself flags as one where write access should
  be exactly one named, in-scope decision, an unscoped one is the sharpest possible version of that
  risk.

- **[RBAC] The "read-only" compliance role has a live, working comment box on every change order** —
  Severity: Critical (pre-existing bug, reframed — this is the concrete case the task asks to flag).
  `addChangeOrderComment` has no permission check at all (`src/app/(app)/change-orders/actions.ts:218-234`;
  logged generally at `audit/findings-auth-security.md:469-475`). Live: opening `CO-0001` as
  `class@oceancos.dev` — a change order whose own metadata reads "CLASS REVIEW · Not required" — still
  renders a working "ADD A COMMENT / Post Comment" form (`class__co_detail.png`). `CLASS_SURVEYOR`'s
  RBAC grant contains no comment or edit permission of any kind (`src/lib/rbac.ts:189`); the write
  surface exists purely because the action forgot to check anything, and it is reachable on records
  that have nothing to do with class at all.

- **[RBAC] Unscoped "Pending with Other Approvers" visibility, not limited to class-relevant items** —
  Severity: High. `/approvals` has no page-level permission check (`src/app/(app)/approvals/page.tsx`),
  and "Pending with Other Approvers" lists every stage of every pending change order regardless of the
  viewer's own stage (`:45-53`). Live: `class@oceancos.dev`'s `/approvals` shows "PENDING WITH OTHER
  APPROVERS · 15" — CAPTAIN, TECH MANAGER, YARD, OWNERS REP and FINANCE stages, real costs, none of it
  class-relevant (`class_approvals.png`). A role meant to have "read-only visibility into specific
  records" (per the task's own framing) instead gets unscoped visibility into the entire commercial
  approval workflow, whether or not class review was ever required for the item.

- **[TENANCY] Unscoped seed puts every vessel on the platform in view** — Severity: Critical. Same
  mechanism as `YARD_PM`/`CONTRACTOR` above (`prisma/seed.ts:150,155-165`): `class@oceancos.dev`'s
  Dashboard and Change Orders list both read across every project (`class_dashboard.png`,
  `class_change-orders.png`, 11 change orders with no project filter — the pre-existing C4 defect,
  landing here on a role surveying a single, specific vessel).

---

## FLAG_SURVEYOR — seeded Y (`flag@oceancos.dev`)

Reachable scope, live-confirmed: identical shape to `CLASS_SURVEYOR` — Dashboard, Change Orders (view +
the FLAG approval stage, plus the same unrestricted comment box), Approvals, Drawings (view), Documents
(view), Suppliers (view, unguarded page), Notifications. Blocked: Quotes & requests, Crew Requests,
Schedule, Financials, Contractors, Admin. All five findings under `CLASS_SURVEYOR` apply symmetrically
(same code paths, `PERMISSIONS.CO_APPROVE_FLAG` in place of `CO_APPROVE_CLASS`); role-specific evidence
below.

- **[RBAC] No `SCH_VIEW`, despite a dedicated `FLAG_INSPECTION` milestone type** — Severity: High.
  `src/lib/rbac.ts:190` grants no `SCH_VIEW`; `MILESTONE_TYPE_LABEL` defines `FLAG_INSPECTION →
  "Flag"` (`src/app/(app)/schedule/page.tsx:27-36`). Live: `flag@oceancos.dev`'s `/schedule` is
  "Forbidden — Schedule is restricted." (`flag_schedule.png`).

- **[RBAC] `CO_APPROVE_FLAG` unscoped by project** — Severity: Critical. Same code path as
  `CLASS_SURVEYOR` (`change-orders/actions.ts:140-155`); a flag-state surveyor's sign-off authority on
  the FLAG stage is not limited to the vessel whose flag they are surveying for.

- **[RBAC] Working, unpermissioned comment box confirmed live** — Severity: Critical (pre-existing bug,
  reframed). `flag@oceancos.dev` on `CO-0001` sees the same live "ADD A COMMENT / Post Comment" form
  (`flag__co_detail.png`) despite holding no comment permission (`src/lib/rbac.ts:190`).

- **[RBAC] Full unscoped approvals-queue visibility** — Severity: High. `flag_approvals.png` shows the
  identical "PENDING WITH OTHER APPROVERS · 15" table, all five stages, no flag-relevance filter.

- **[TENANCY] Unscoped seed** — Severity: Critical. `prisma/seed.ts:151,155-165`; `flag_dashboard.png`
  shows the same "across all active vessels and projects" scope as every other unscoped external role.

---

## AUDITOR — seeded N — **[static]**

No seeded account exists (`README.md:46`, `SITE_MAP.md:138-140`) — notable in particular for this role,
since an auditor never having been able to log in means the platform's one deliberately
comprehensive-read-only role has never had its actual screen looked at. Grant
(`src/lib/rbac.ts:191-196`) is `JOB_VIEW, CO_VIEW, CR_VIEW, FIN_VIEW, SCH_VIEW, LOG_VIEW, INV_VIEW,
DRW_VIEW, DOC_VIEW, CON_VIEW, MTG_VIEW, RSK_VIEW, AUDIT_VIEW` — every `_VIEW` in the matrix, and
**correctly no edit, approve, create, upload or admin permission anywhere in the list.** As RBAC design
goes, this is the one role in the set that matches its job exactly: broad read, zero write, by grant.

- **[RBAC] The grant is right; the guards underneath it are not, and that gives the "read-only" role live write access** — Severity: Critical.
  Two pre-existing, permission-blind write paths land squarely on `AUDITOR`: (1)
  `addChangeOrderComment`/`addCrewRequestComment` check only `requireUser()`
  (`src/app/(app)/change-orders/actions.ts:218-234`; `crew-requests/actions.ts` equivalent; logged at
  `audit/findings-data-api.md:865-904`), so an Auditor could post to any change order or crew request in
  the system despite holding no comment permission of any kind; (2) `transitionCrewRequest`
  (`src/app/(app)/crew-requests/actions.ts:49-70`) only gates `TRIAGED`/`ASSIGNED` (behind
  `CR_TRIAGE`) and `COMPLETED`/`CLOSED` (behind `CR_COMPLETE`) — `REJECTED`, `IN_PROGRESS`, `BLOCKED`
  and `AWAITING_APPROVAL` fall through with no permission check at all (this is the already-logged C6),
  so an Auditor holding only `CR_VIEW` could legally call `transitionCrewRequest(id, "REJECTED")` (or
  `IN_PROGRESS`/`BLOCKED`/`AWAITING_APPROVAL`) on any crew request in the database. This is precisely
  the scenario the brief calls a red flag: a role whose contract is "no write capability at all" has
  two confirmed, callable write paths, not because RBAC grants them but because the actions never check
  RBAC in the first place.

- **[RBAC] No `DOC_VIEW_CONFIDENTIAL`** — Severity: Medium. `src/lib/rbac.ts:191-196` gives `AUDITOR`
  `DOC_VIEW` but not `DOC_VIEW_CONFIDENTIAL` (held only by `OWNER`, `OWNERS_REP`, `FINANCE`). An
  independent compliance review is exactly the case where confidential contracts and certificates are
  most likely to be the material under review; as modelled the auditor sees the document register with
  the confidential rows filtered out and no indication that anything was withheld
  (`src/app/(app)/documents/page.tsx:13,17`), which could read as a complete register when it is not.

- **[RBAC] The one place platform-wide audit data is properly gated is not the only place it appears** —
  Severity: Low (context, not a defect for this role specifically — see `SUPPLIER`/`GUEST` above and
  below for where it is a defect). `/admin` correctly checks `AUDIT_VIEW` before showing the 50-row
  audit log (`src/app/(app)/admin/page.tsx:13,22`), but the Dashboard's 10-row "Recent activity" panel
  shows the same `AuditLog` table with no permission check at all
  (`src/app/(app)/dashboard/page.tsx:54,347-376`). For `AUDITOR` this happens to be harmless (the role
  holds `AUDIT_VIEW` anyway), but it means the one deliberately-gated view of this data
  (`/admin`) is inconsistent with the ungated one every other role also lands on.

---

## GUEST — seeded N — **[static]**

No seeded account exists. Grant (`src/lib/rbac.ts:197`) is `[CO_VIEW, SCH_VIEW]` — nothing else.
Reachable scope if provisioned today: Change Orders (view only), Schedule (view only), plus whatever
the Dashboard, `/approvals` and `/suppliers` leak regardless of grant (see below). Everything else
403s, including `/jobs`, which `GUEST` cannot reach at all.

- **[PROVISIONING] There is no way to ever assign this role to a person** — Severity: Critical.
  A repo-wide search for an invite, signup, "create user" or user-provisioning code path
  (`invite|signup|createUser|registerUser`) returns nothing under `src/`. The only place a `User` row
  is ever created is `prisma/seed.ts`. `/admin` is read-only lists (`SITE_MAP.md:57`,
  `src/app/(app)/admin/page.tsx`) with no create-user or assign-role form. The permissions that would
  presumably gate such a feature exist — `ADM_USERS`, `ADM_ROLES`, `ADM_SETTINGS`
  (`src/lib/rbac.ts:72-74`) — but are granted to **zero** roles in `ROLE_PERMISSIONS`
  (`src/lib/rbac.ts:82-198`; also noted generically in `SITE_MAP.md:22`). `GUEST` is not "a minimal,
  time-boxed viewer" in the running product — it is a row in a permission table with no code path that
  can ever assign it to a real person, seed script aside. This is true in some sense of every role
  (there is no self-service signup for anyone), but it lands hardest on `GUEST`, whose entire premise
  is ad hoc, short-lived access granted without going through the full hiring/role-assignment story the
  other eighteen roles imply.

- **[RBAC] The grant does not match "minimal, time-boxed viewer," and the platform's other gaps make it worse** — Severity: Critical (conditional on provisioning).
  `GUEST` omits `JOB_VIEW` — the one plausibly guest-appropriate, presentational view (quote/job status,
  the closest analogue to what a broker or a visiting owner's guest would want) — while granting full
  `CO_VIEW`. Layered onto the unscoped-project default (`src/lib/project.ts:36-46` — nothing marks
  `GUEST` for different treatment) and the Dashboard/`/approvals` permission gaps documented under
  `CONTRACTOR` and `SUPPLIER` above, a provisioned Guest would see, on first login: every change order
  across every project on the platform, full cost figures in the "Approvals waiting on you and others"
  and "Pending with Other Approvers" tables, and the platform's raw audit-log feed
  (`dashboard/page.tsx:33-54,65-69,256-300,347-376`) — none of it gated by `GUEST`'s own two-permission
  grant. A role designed to be minimal would, in practice, be one of the most exposed accounts on the
  platform.

- **[UI] The visible role label conflates "no role assigned" with "the GUEST role"** — Severity: Low.
  `src/components/layout/TopBar.tsx:53` renders `{user.roleKeys[0] ?? "GUEST"}` — if a signed-in user's
  `roleKeys` array is empty (a data-integrity state: a `User` row with no `UserRole` at all), the
  header displays the literal string "Guest," which reads as if that person holds the actual `GUEST`
  role and its `[CO_VIEW, SCH_VIEW]` grant. They do not — `hasPermission` checks `user.permissions`,
  computed from actual role grants, so a no-role user in fact has zero permissions, not `GUEST`'s two.
  The label overstates what such an account can do and misnames a data problem as an intentional role.

---

## Summary for the record

The worst experience in this set belongs jointly to **`CLASS_SURVEYOR`/`FLAG_SURVEYOR`**: both are
compliance/inspection roles that the platform's own design intends to be narrow and read-only (one
named approval stage, view-only elsewhere), and both were confirmed live to have (a) a fully working,
completely unpermissioned "Post Comment" button on every change order in the database, (b) unscoped
approval authority on their one legitimate write action, and (c) unscoped read access to every vessel
on the platform via the seed's unscoped `UserRole`. `AUDITOR` is a close second on the same axis —
its RBAC grant is the one genuinely correct design in the whole set (broad read, zero write, by
permission), and it is still confirmed to have two live, callable write paths purely because the
underlying actions never check permissions at all.

Three findings matter most:

1. **The Dashboard and Approvals pages have no RBAC gate on financial/workflow data.** Every one of
   the eight roles — including `SUPPLIER`, which holds `DOC_VIEW` and nothing else — sees change-order
   counts, a cost-bearing "Approvals waiting on you and others" table, and the platform's raw audit-log
   feed the moment they land on `/dashboard`, regardless of `CO_VIEW`, `RSK_VIEW` or `AUDIT_VIEW`.
   (`src/app/(app)/dashboard/page.tsx:33-54,65-69,256-300,347-376`; `src/app/(app)/approvals/page.tsx`.)

2. **Compliance roles have live write access the RBAC design never intended.** `CLASS_SURVEYOR`,
   `FLAG_SURVEYOR` and `AUDITOR` can each post an unrestricted comment on any change order or crew
   request, and `AUDITOR` can additionally transition a crew request's status, purely because
   `addChangeOrderComment`, `addCrewRequestComment` and part of `transitionCrewRequest` check nothing
   but `requireUser()`. This is a pre-existing defect, but this walkthrough is the first place it is
   tied to the specific roles the brief calls out as ones where write access is itself a red flag.

3. **Every seeded yard/external role is provisioned with unscoped project access, and nothing in the product can fix that.** `prisma/seed.ts` gives `YARD_PM`, `CONTRACTOR`, `CLASS_SURVEYOR` and
   `FLAG_SURVEYOR` a `UserRole` with no `projectId`/`vesselId`, which `listProjectsForUser` treats as
   "every active project." Each of the four external/yard accounts can switch into and read a second,
   unrelated vessel's change orders and jobs. `/admin` is read-only, so there is no way for an operator
   to scope one of these accounts to a single project even if they wanted to — this is a missing
   capability, not a seed-data oversight.
