# OceancOS — Platform audit report: addendum (Phase 2b)

Phase 2b of the Universal Platform Audit. Five further passes produced 104 severity-tagged entries:
a cross-page aesthetic review, a live functional walk of the four workflows, a notification and
permission-matrix cross-reference, and two role walkthroughs covering all 19 roles (12 live, 7
reasoned from source). The raw entries are in
`audit/findings-{aesthetic-consistency,workflow-functional,notifications-permissions,role-walkthrough-yard-external,role-walkthrough-vessel}.md`,
with three reference documents alongside: `NOTIFICATION_MAP.md`, `PERMISSION_MATRIX.md` and
`DESIGN_CONSISTENCY_SPEC.md`. This addendum de-duplicates those entries against the 187 distinct
defects in `AUDIT_REPORT.md` and against each other. It uses that report's structure and its §2
severity scale. It adds to that report and does not replace it.

The raw findings files remain the record. Where this addendum and a Phase 2b findings file disagree
on severity, on counts, or on whether something is new, this addendum has been checked against
source and the findings file has not. Every Critical below was re-read in source before being
recorded.

**No fixes have been made.** Of `ACTION_PLAN.md`, only Gate 0 and G1.1 (the error boundary) have
been executed, and the tree walked in Phase 2b already includes G1.1. The additions are sequenced
in `ACTION_PLAN.md` and marked *(Phase 2b)*.

---

## 1. Headline

Three new defects are worse than anything else Phase 2b found. Two of them sit on paths that
`ACTION_PLAN.md` believed it had already covered.

**The dashboard and the Approvals Centre have no permission gate (C15).** Each module guards its
own pages with its own `_VIEW` key. These two pages aggregate across modules and belong to none,
and neither has a gate. `dashboard/page.tsx` calls `hasPermission` once (`:71`), and that call
covers only the budget panel and the cumulative-value chart. The change-order and crew-request
counts, the milestone list, the approvals table, the top risks and the audit feed
(`:33-54,65-69`) are fetched and rendered for whoever is signed in. `/approvals` runs all three of
its queries after a bare `requireUser()` (`approvals/page.tsx:25-61`). Its "Pending with Other
Approvers" filter is `stage: { notIn: myStages }`, and for a user who holds no stage that matches
every stage. Live as `crew@oceancos.dev`, whom `/change-orders` refuses: change orders by number,
title and exact cost across all five approval stages, the top risks, and the raw audit feed with
entity ids. The audit-feed panel alone bypasses permissions for 15 of the 19 roles. Phase 2 missed
this because the auth pass recorded that every other `(app)` page carries a `hasPermission` test
(`findings-auth-security.md`, suppliers and sidebar findings). For these two pages that is false.

**An unscoped role assignment grants every project, whatever the role (C16).** When an assignment
names neither a project nor a vessel, `listProjectsForUser` treats it as "every active project"
(`lib/project.ts:36-39`). That is deliberate for owner-side staff (`:24-26`), but the function
applies it to a contractor, a yard PM and a class surveyor in exactly the same way. The seed
creates every account unscoped (`prisma/seed.ts:164`). Nothing in the product can create a scoped
account: `/admin` is read-only and no role holds `admin.users`. Live, the yard PM, the contractor
and both surveyors can each switch into a second, unrelated vessel. This is not C4. The jobs
subtree already calls `listProjectsForUser`, and the yard PM still sees both vessels' jobs.
G2.1 applies that function everywhere, so it would leave every yard and external account as
exposed as it is today. `AUDIT_REPORT.md` §7 recorded `lib/project.ts` as correct. It is correct
only for the owner-side case it was written for.

**Any authoriser can sign a quote addressed to someone else (C17).** The request form limits
"Designated authoriser" to `JOB_ACCEPT` holders and labels it "Who may accept the quote". The
ceremony then checks only `JOB_ACCEPT` (`accept/page.tsx:30`, `accept/actions.ts:50,127`). It
never compares the signer with `job.designatedAuthoriserId`. Live: the project manager accepted a
quote addressed to the captain. The code arrived in the PM's own inbox, and the ceremony wrote a
correct-looking `APPROVE` audit row. The job now reads "Authoriser: Cara Captain" next to
"Accepted by: Pat Manager", and neither the captain nor the job's creator was told. All of this
runs through the legitimate ceremony, so G2.3, which closes the `transitionJob` side door (C2),
does not touch it.

Two further patterns matter. Ten roles without `FIN_VIEW` see change-order cost on the list and
detail pages, although the print and export versions of the same record redact it (T2 again).
And every decision the workflows record is recorded without a reason: rejecting, requesting more
information, blocking, reporting a deficiency, countersigning (T12).

---

## 2. Findings by severity

The five files contain 104 severity-tagged entries:

- 26 re-observe a defect already in `AUDIT_REPORT.md`. Each is cited once in §5.2 against every
  role it lands on, and none adds to the count.
- 11 are not defects: confirmations of correct behaviour, choices the file itself calls
  deliberate, or features that `SITE_MAP.md` places out of scope (§5.3).
- The remaining 67 reduce to **35 distinct new defects**.

13 of the 35 are **grant-fit** findings. In these, the code does exactly what `src/lib/rbac.ts`
says, and the finding is that `rbac.ts` does not match the job the role exists to do. They are
counted separately, prefixed `R`, so that whoever owns the role model can re-score or reject them.
The other 22 are code defects, prefixed `C` (Critical) or `N`.

| Severity | Raw (5 files) | Distinct new | of which grant-fit | Running total (187 + 35) |
|---|---|---|---|---|
| **Critical** | 20 | **3** | 0 | **17** |
| **High** | 37 | 9 | 4 | 63 |
| **Medium** | 29 | 14 | 8 | 85 |
| **Low** | 18 | 9 | 1 | 48 |
| **Cosmetic** | 0 | 0 | 0 | 9 |
| **Total** | 104 | **35** | 13 | **222** |

### Per file

| File | Entries | C | H | M | L | → new | → existing | → not a defect |
|---|---|---|---|---|---|---|---|---|
| role-walkthrough-yard-external | 32 | 13 | 9 | 7 | 3 | 22 | 10 | 0 |
| role-walkthrough-vessel | 50 | 7 | 23 | 14 | 6 | 28 | 13 | 9 |
| workflow-functional | 9 | 0 | 5 | 2 | 2 | 9 | 0 | 0 |
| aesthetic-consistency | 10 | 0 | 0 | 5 | 5 | 8 | 1 | 1 |
| notifications-permissions | 3 | 0 | 0 | 1 | 2 | 0 | 2 | 1 |
| **Total** | **104** | **20** | **37** | **29** | **18** | **67** | **26** | **11** |

Three files state count headers that do not match their own entries. The table above counts the
entries:

- aesthetic-consistency states 4 Medium and 6 Low; its entries are 5 Medium and 5 Low.
- notifications-permissions states 2 Medium and 1 Low; its entries are 1 Medium and 2 Low.
- role-walkthrough-yard-external states 10/8/8/5 (31); its entries are 13/9/7/3 (32).

The vessel file has no count header.

### Re-scored

Where this addendum's severity differs from the specialist's:

| Finding | Specialist | Here | Why |
|---|---|---|---|
| Designated authoriser not enforced | High | **Critical (C17)** | The designation controls who may sign money. Defeating it is "a financial control that can be defeated" (`AUDIT_REPORT.md` §2) |
| Approvals Centre has no view gate | High | **Critical (C15)** | Merged with [X1]. The same pages, the same missing gate, the same data |
| CAPTAIN has no `CR_CREATE` | Critical | High (R1) | An under-grant exposes nothing and bypasses nothing. It is a defect on a normal path |
| PURSER has no `JOB_VIEW` | Critical | Medium (R7) | Reasoned only, and an under-grant |
| HOD department scoping absent | Critical | High (in N2) | Over-breadth inside one project, not across tenants |
| GUEST grant does not fit a "minimal viewer" | Critical (conditional) | Medium (R10) | The role cannot be provisioned today. It becomes live when G6.9 seeds it, which is why G3.15 must come first |
| GUEST cannot be provisioned | Critical | existing Medium | This is the operational half of auth-security's admin finding |
| Comment box on the read-only roles | Critical (reframed) | existing Medium, held | Writes attributed text, but exposes nothing and defeats no control. The walkthroughs add seven landings and show that the defect had no closing item (§6) |
| `CO_APPROVE_CLASS` / `_FLAG` unscoped | Critical | compounds C5 | The same function and the same missing check |
| [X2] crew-request buttons | Critical | compounds C6 | See §3 |
| [X5] "All caught up" with no stage held | Medium | Low (N12) | Copy, which is avoidable confusion. The grant half is separation of duties, not a defect |
| aesthetic [TABLES] `row-hover` | Medium | existing Low | The same defect as accessibility's `row-hover` finding, on two more tables |
| CHIEF_OFFICER has no `RSK_VIEW` | High | Medium (R5) | Reasoned only |
| CHIEF_ENGINEER has no `FIN_VIEW` | High | Medium (R8) | The walkthrough itself calls withholding the portfolio budget reasonable |

---

## 3. The new Criticals

| # | Finding | Location | Found by |
|---|---|---|---|
| C15 | The dashboard and the Approvals Centre render change-order, crew-request, risk, milestone and audit data with no permission gate | `dashboard/page.tsx:33-54,65-69,154-168,195,256-376`; `approvals/page.tsx:25-61` | role-walkthrough-vessel [X1]; role-walkthrough-yard-external (CONTRACTOR, SUPPLIER, CLASS_SURVEYOR, FLAG_SURVEYOR, AUDITOR); workflow-functional [APPROVALS] |
| C16 | An unscoped role assignment resolves to every project for every role. The seed scopes no one, and nothing in the product can scope anyone | `lib/project.ts:36-46`; `prisma/seed.ts:164`; `admin/page.tsx` (read-only) | role-walkthrough-yard-external (YARD_PM, CONTRACTOR, CLASS_SURVEYOR, FLAG_SURVEYOR live; YARD_TRADE_LEAD, GUEST reasoned) |
| C17 | The acceptance ceremony never checks that the signer is the designated authoriser | `jobs/[id]/accept/page.tsx:30`; `accept/actions.ts:50,127,261`; `jobs/[id]/page.tsx:493` | workflow-functional (re-scored High → Critical) |

**Verified against source.**

- **C15.** `dashboard/page.tsx` imports `hasPermission` and calls it only at `:71`. Beyond the
  walkthroughs' claim, the crew-request stat cards (`:39-42,162-168`) and upcoming milestones
  (`:44,195`) are also ungated. The panel titled "Approvals waiting on you and others" is built
  from `where: { decision: "PENDING" }` (`:65-69`), which is every pending approval on the platform
  and is not filtered to the viewer. By role, the bypass covers:
  - the audit feed for 15 roles;
  - the risk panel for 12;
  - the change-order panels for PURSER, CREW and SUPPLIER.
- **C16.** Confirmed the `hasUnscopedRole` branch returns `{ archivedAt: null }` with no role test.
  The seed creates every `UserRole` with only `{ userId, roleId }`.
- **C17.** Zero references to `designatedAuthoriserId` in `jobs/[id]/accept/`. Verification also
  found that `rejectQuote` (`accept/actions.ts:259-261`) is gated on `JOB_CANCEL`, which YARD_PM
  holds, so the yard can also write the client's `REJECT` / `QUOTE_REJECTED` audit record.

### Walkthrough Criticals that are existing defects

| Walkthrough Critical | Lands on | Disposition | Closed by |
|---|---|---|---|
| [X2] crew-request transition buttons, and five target statuses with no server check | CREW (live); PURSER, HOD, CHIEF_OFFICER, AUDITOR (reasoned) | **Compounds C6.** The workflow-logic finding merged into C6 already recorded that the detail page renders every transition unfiltered ("every viewer is shown a live 'Reject' button"). What [X2] adds is live confirmation through the ordinary UI, not a new fact | G2.4 |
| `CO_APPROVE_CLASS` / `CO_APPROVE_FLAG` not scoped to the vessel | CLASS_SURVEYOR, FLAG_SURVEYOR | **Compounds C5.** Once G2.2 adds the project check, C16 lets an unscoped surveyor pass it for every project | G2.2 with G1.4 |
| Working comment form on read-only roles | CLASS_SURVEYOR, FLAG_SURVEYOR, AUDITOR; also CONTRACTOR and OWNER at Medium/High | Existing Medium (auth-security [RBAC] comment actions, **[verified]**), held at Medium | G2.12 (no closing item existed) |
| AUDITOR's two write paths | AUDITOR | C6 plus the comment Medium | G2.4, G2.12 |
| Cross-project exposure | YARD_PM, CONTRACTOR, CLASS_SURVEYOR, FLAG_SURVEYOR | **C16** (new); also C4 on the pages G2.1 has not yet reached | G1.4, G2.1 |
| GUEST cannot be assigned to a person | GUEST | Existing Medium: auth-security's admin finding, operational half | G6.9. G1.4 is designed not to need an admin UI |
| GUEST grant does not fit a "minimal viewer" | GUEST | Grant-fit R10, Medium | G3.15 |
| CAPTAIN cannot create a crew request | CAPTAIN | Grant-fit R1, High | G3.15 |
| PURSER has no `JOB_VIEW` | PURSER | Grant-fit R7, Medium | G3.15 |
| HOD department scope does not exist | HOD | New N2, High | G3.16 |

---

## 4. Cross-cutting themes

Four new themes, numbered after T1–T10.

### T11 — Pages that span modules have no owner, so they have no guard

Each module page opens with its module's `_VIEW` check. The one exception is `/suppliers`, whose
module was never given a key. The failures sit on the pages that aggregate across modules, which no
single key obviously owns:

| Page | Aggregates | Gated |
|---|---|---|
| `/dashboard` | change orders, crew requests, milestones, approvals, risks, audit log, budget | budget and value chart only (`:71`) |
| `/approvals` | change-order approvals across all stages, generic approvals | nothing at page level |
| `/search` | seven resource types | six of seven (supplier branch ungated; existing Medium) |
| `/suppliers` | — (no `supplier.*` key exists) | nothing (existing Medium) |

This is not T2. T2 is a correct guard that is then routed around. Here no guard was written,
because the permission model is organised by module and these pages fall between modules. It also
explains why the Phase 2 auth pass missed C15: that pass enumerated the pages module by module.

Touches: C15, and auth-security's suppliers and search findings.

### T12 — Decisions are recorded without reasons

The workflows record that a decision happened and who made it, but not why:

| Decision | Reason captured? | Finding |
|---|---|---|
| Approve / Reject / Request Info from the Approvals Centre | No field (the change-order page has one) | N4 |
| Any crew-request transition, including Reject and Block | The action accepts `comment`; no caller ever passes one | N5 |
| Report minor deficiency | No field, no column; a fixed "Client reported a minor deficiency." | N3 |
| Cancel quote / cancel works | Field present, not required | N13 |
| Yard countersignature | One-click `STATUS` change, no note | N6 |

Two existing findings mean the reason could not be delivered anyway: rejections notify nobody, and
comments notify nobody (workflow-logic `[CHANGE ORDERS]`, `[NOTIFICATIONS]`). So a requester whose
change order is rejected from the Approvals Centre is not told, and when they find out there is no
record of why. For a product whose premise is the audit trail around a commercial decision, this
gap sits at the centre of that trail.

### T13 — Scope has one dimension, and it fails open

`listProjectsForUser` is the only scoping function in the codebase. It knows two dimensions,
project and vessel, and resolves "neither named" to "everything" (C16). The role names imply three
more dimensions that exist nowhere in a query:

- **Department (HOD).** `UserRole.departmentId` is declared in the schema and never read or
  written in `src/`.
- **Trade (YARD_TRADE_LEAD).** No `trade` field exists on `Job`, `JobSection`, `User` or
  `UserRole`.
- **Contracted scope (CONTRACTOR).** `Job` carries no assignment to a contractor.

The consequence is that `JOB_VIEW`, `JOB_PROGRESS` and `CR_VIEW` are project-wide for every role
that holds them (N2). A contractor reads every other contractor's line pricing. A trade lead can
set progress on every trade's jobs. A head of department sees every department's crew requests.

C4 is the failure to *apply* scoping, and G2.1 fixes it by applying `listProjectsForUser`
everywhere. T13 is about the *shape* of the scope that G2.1 would apply. G1.4 must land before
G2.1, or G2.1 enforces a scope that is open by default.

Touches: C16, N2, and §7 of `AUDIT_REPORT.md` (corrected in §6 below).

### T14 — The role matrix was written, never walked

`PERMISSION_MATRIX.md` accounts for all 56 keys: 41 enforced, 14 granted but never checked, 1
checked but grantable to no one. The walkthroughs add the other half of the picture:

- Seven roles have never had an account.
- 13 grant-fit mismatches (R1–R13). For example, the class and flag surveyors cannot open the
  schedule, which carries milestone types built for them. The yard PM cannot open the document
  register that holds RAMs. The captain cannot raise a crew request.
- SUPPLIER has no function at all: one permission, which opens an empty scaffold, for a role named
  after a model that G6.7 deletes.

None of this is wrong code. It is a matrix whose grants no one has checked against the job each
role performs. It needs one review with a product owner (G3.15), and that review must come before
G6.9 seeds the seven missing roles. Otherwise the review's gaps become live accounts.

### Existing themes, extended

- **T2** gains three instances, each a guard on one path that another path skips:
  - The print page and the export redact change-order cost without `FIN_VIEW`; the list, detail,
    approvals and dashboard pages do not (N1).
  - `/admin` gates the audit log on `AUDIT_VIEW`; the dashboard's copy of it is ungated (C15).
  - The authoriser is validated when the request is made and never when the quote is signed (C17).
    The guard is on the wrong end of the flow.
- **T3.** The error boundary now exists (G1.1). Its "Try again" button on a `forbidden` error is
  N8. Every page component that throws `forbidden` inherits that button, which is why
  `DESIGN_CONSISTENCY_SPEC.md` §4 requires a page-level `hasPermission` check ahead of any
  `assertPermission`.
- **T1.** The aesthetic divergence follows the same gradient as T1. `jobs/new` is the reference
  implementation for form architecture, section headers and the submit row, and the two older
  modules deviate from it (N10, N11).
- **T10.** Three of the five new findings files miscount themselves (§2).

---

## 5. De-duplication register

### 5.1 New distinct defects

"Merged from" lists every raw entry that reduced to the defect. The roles listed are the ones the
defect lands on (L = live, R = reasoned from source).

| ID | Sev | Finding | Merged from | Lands on | Plan |
|---|---|---|---|---|---|
| C15 | C | Dashboard and Approvals Centre have no permission gate | vessel [X1], CREW; yard CONTRACTOR, SUPPLIER, CLASS (approvals), FLAG (approvals), AUDITOR (audit feed); workflow-functional [APPROVALS]. **8 entries, 3 files** | CREW, CONTRACTOR, CLASS, FLAG (L); SUPPLIER, GUEST, PURSER, CHIEF_OFFICER, HOD, YARD_TRADE_LEAD (R) | G2.9 |
| C16 | C | Unscoped assignment fails open to every project; seed scopes no one; no path to scope | yard YARD_PM, YARD_TRADE_LEAD, CONTRACTOR, CLASS, FLAG. **5 entries, 1 file** | YARD_PM, CONTRACTOR, CLASS, FLAG (L); CAPTAIN, CHIEF_ENGINEER, CREW (same seeded state); YARD_TRADE_LEAD, SUPPLIER, GUEST (R) | G1.4 |
| C17 | C | Ceremony never checks the signer is the designated authoriser; `rejectQuote` likewise | workflow-functional [JOBS] | OWNERS_REP, PROJECT_MANAGER, CAPTAIN (L: PM signed for CAPTAIN); YARD_PM via `rejectQuote` | G2.11 |
| N1 | H | Change-order and crew-request cost shown without `FIN_VIEW` on list, detail, approvals and dashboard, although print and export redact it. Extended during verification to `crew-requests/[id]/page.tsx:109` and `approvals/page.tsx:134,208,261` | vessel [X3], CAPTAIN, CHIEF_OFFICER, CHIEF_ENGINEER, FINANCE, TECH_MANAGER. **6 entries** | 10 roles holding `CO_VIEW` without `FIN_VIEW` (CHIEF_OFFICER, CHIEF_ENGINEER, HOD, YARD_PM, YARD_TRADE_LEAD, CONTRACTOR, TECH_MANAGER, CLASS, FLAG, GUEST); CREW for crew-request cost | G2.10 |
| N2 | H | No scope below the project: department, trade and contracted scope do not exist in any query | yard YARD_TRADE_LEAD ×2, CONTRACTOR (pricing); vessel HOD ×2, CREW (pricing). **6 entries, 2 files** | CONTRACTOR (L), CREW (L), HOD, YARD_TRADE_LEAD (R) | G3.16 |
| N3 | H | "Report minor deficiency" captures nothing about the deficiency: no field, no column (`workflow.ts:126`, `jobs/[id]/page.tsx:473`, `jobs/actions.ts:322-341`) | workflow-functional | CAPTAIN (L), OWNERS_REP, PM | G3.12 |
| N4 | H | Approvals Centre decisions carry no comment field (`approvals/page.tsx:144-156` vs `change-orders/[id]/page.tsx:251-255`) | workflow-functional | CAPTAIN (L); every stage holder | G3.12 |
| N5 | H | Crew-request transitions can never record a reason; the `comment` parameter is never supplied (`crew-requests/[id]/page.tsx:141`) | workflow-functional | PM (L); every `CR_TRIAGE` / `CR_COMPLETE` holder | G3.12 |
| N6 | M | The yard countersignature is a one-click `STATUS` change with none of the client ceremony's evidence (`jobs/actions.ts:311-328`) | workflow-functional | YARD_PM (L) | G3.13 |
| N7 | M | Crew-request assignee list is every active user, unfiltered by role or relevance (`crew-requests/[id]/page.tsx:31,152-166`; `new/page.tsx:17`) | workflow-functional | every `CR_ASSIGN` / `CR_CREATE` holder | G3.14 |
| N8 | M | Permission failures render in two shells; the error-boundary shell offers "Try again", which cannot succeed (`(app)/error.tsx:35-71` vs `EmptyState`) | aesthetic [EMPTY STATES]; vessel CAPTAIN (`/crew-requests/new`), TECH_MANAGER (`/change-orders/new`). **3 entries, 2 files** | any role without `CO_CREATE` / `CR_CREATE` | G3.17 |
| N9 | M | Three filter implementations; `FilterBar` is used on 2 of 12 filterable lists; jobs and inventory lack Reset | aesthetic [FILTERS] | all | G3.19 |
| N10 | M | The three create forms diverge in card architecture, section header and submit alignment. A superset of ui-ux's no-Cancel Medium | aesthetic [FORMS] | all creating roles | G3.18 |
| N11 | M | Three incompatible "titled section" styles (`SectionCard`, `Panel`, `.eyebrow` as a section header) | aesthetic [TYPOGRAPHY] | all | G3.19 |
| N12 | L | The Approvals Centre says "All caught up" to a user who can never be an approver (`approvals/page.tsx:99`) | vessel [X5], PM, CHIEF_ENGINEER. **3 entries** | PM (L), CHIEF_ENGINEER, HOD, CHIEF_OFFICER | G3.17 |
| N13 | L | The cancellation reason is optional (`jobs/[id]/page.tsx:473-479`) | workflow-functional | `JOB_CANCEL` holders | G3.12 |
| N14 | L | The crew-request create caption says the request is "routed for triage" when Assign To skips triage (`new/page.tsx:136-138` vs `actions.ts:27`) | workflow-functional | `CR_CREATE` holders | G3.14 |
| N15 | L | The top bar shows "GUEST" for a user with no role at all (`TopBar.tsx:53`) | yard GUEST | — | G3.17 |
| N16 | L | The back link is repeated at the bottom of two of the three detail pages | aesthetic [PAGE HEADERS] | all | G3.19 |
| N17 | L | No confirmation step on any irreversible decision; Reject sits beside Approve | aesthetic [MODALS] | approvers | G3.19 |
| N18 | L | The three auth pages disagree on the card wrapper | aesthetic [FORMS] | all | G3.19 |
| N19 | L | Three stat-tile implementations; the pattern is copied into six files | aesthetic [TYPOGRAPHY] | all | G3.19 |
| R1 | H | `CR_CREATE` absent from CAPTAIN, and from OWNERS_REP and PM | vessel CAPTAIN | CAPTAIN (L) | G3.15 |
| R2 | H | `SCH_VIEW` absent from CLASS_SURVEYOR and FLAG_SURVEYOR, although `schedule/page.tsx:27-36` defines `CLASS_INSPECTION` / `FLAG_INSPECTION` milestone types; also absent from FINANCE and PURSER | yard CLASS, FLAG; vessel FINANCE, PURSER. **4 entries, 2 files** | CLASS, FLAG, FINANCE (L); PURSER (R) | G3.15 |
| R3 | H | `DOC_VIEW` absent from YARD_PM and YARD_TRADE_LEAD (RAMs, certificates) | yard YARD_PM | YARD_PM (L) | G3.15 |
| R4 | H | `LOG_VIEW` / `INV_VIEW` absent from the engineering-side reviewers | vessel CHIEF_ENGINEER, TECH_MANAGER, HOD. **3 entries** | CHIEF_ENGINEER, TECH_MANAGER (L); HOD (R) | G3.15 |
| R5 | M | `RSK_VIEW` absent from CHIEF_OFFICER, PURSER and HOD. Their only view of risk today is C15's leak | vessel CHIEF_OFFICER, PURSER | R | G3.15 |
| R6 | M | `DRW_VIEW` absent from CHIEF_OFFICER and HOD | vessel CHIEF_OFFICER | R | G3.15 |
| R7 | M | PURSER is the only vessel-side role without `JOB_VIEW` | vessel PURSER | R | G3.15 |
| R8 | M | `FIN_VIEW` absent from roles that raise costed change orders (CHIEF_ENGINEER, HOD) | vessel CHIEF_ENGINEER | CHIEF_ENGINEER (L) | G3.15 |
| R9 | M | No comment channel where the role works: CONTRACTOR lacks `JOB_COMMENT`, CHIEF_OFFICER lacks `MINUTES_RECORD` | yard CONTRACTOR; vessel CHIEF_OFFICER. **2 entries, 2 files** | CONTRACTOR (L) | G3.15 |
| R10 | M | GUEST holds `CO_VIEW`, and therefore cost through N1, but not `JOB_VIEW` | yard GUEST | R | G3.15, before G6.9 |
| R11 | M | `DOC_VIEW_CONFIDENTIAL` absent from AUDITOR, and the register drops confidential rows with no indication. PURSER's own uploads would vanish the same way | yard AUDITOR; vessel PURSER (merged) | R | G3.15 |
| R12 | M | SUPPLIER has no function: `DOC_VIEW` only, on an empty scaffold, and the model it is named for is dead | yard SUPPLIER ×2 | R | G3.15 |
| R13 | L | OWNER can record no decision anywhere, and no screen says the Owner's Rep acts for them | vessel OWNER ×2 | OWNER (L) | G3.15, G3.17 |

### 5.2 Re-observations of existing defects

These add no count.

| Existing defect | Re-observed in | Lands on | What Phase 2b adds | Plan |
|---|---|---|---|---|
| C6: crew-request permission gaps | vessel [X2], CREW, PURSER, HOD; yard AUDITOR | CREW (L), PURSER, HOD, CHIEF_OFFICER, AUDITOR | Reachable through the ordinary UI, not only by a crafted request | G2.4 |
| C5: approval has no record or project check | yard CLASS, FLAG | CLASS, FLAG | After G2.2, C16 lets the new check pass vacuously | G2.2 + G1.4 |
| C4: project scoping absent | vessel [X4], CREW, CHIEF_ENGINEER | CREW (L), CHIEF_ENGINEER, PURSER | The first time the gap is visible in a dropdown. After G2.1, C16 still lists both vessels | G2.1 + G1.4 |
| auth-security [RBAC] comment actions (M, **[verified]**) | yard CONTRACTOR, CLASS, FLAG; vessel OWNER | CONTRACTOR, CLASS, FLAG, OWNER (L); AUDITOR, GUEST, SUPPLIER (R) | No closing item existed | G2.12 |
| auth-security [RBAC] admin directory gated on `AUDIT_VIEW` (M) | vessel OWNERS_REP, PM | OWNERS_REP, PM (L) | G6.9 as written does not split the rendering | G2.9 |
| auth-security [RBAC] admin: no user administration (M, operational half) | yard GUEST | GUEST | No path exists to create an account or scope a role | G6.9. G1.4 does not need it |
| workflow-logic: chain order not enforced (M) | yard YARD_PM | YARD_PM (L) | Live instance | G2.2 |
| dead-code [RBAC]: 14 unenforced keys (M) | notifications-permissions; vessel PM, FINANCE, CAPTAIN (`EXPORT`) | PM, FINANCE, CAPTAIN | Per-key grant lines, in `PERMISSION_MATRIX.md` | G6.7, after G3.15 |
| admin.* granted to no role (SITE_MAP, G6.9) | notifications-permissions | — | `ADM_USERS` is an unreachable guard; `ADM_ROLES` and `ADM_SETTINGS` are inert | G6.9 |
| Seven roles unseeded (SITE_MAP, G6.9) | yard YARD_TRADE_LEAD, SUPPLIER | seven roles | — | G6.9 |
| accessibility [SEMANTICS] `row-hover` (L) | aesthetic [TABLES] | — | Two more tables: change orders, crew requests | G3.19 |

### 5.3 Not defects

| Entry | Why |
|---|---|
| notifications-permissions [GAP]: no per-user notification preferences | An absent feature from `BRIDGE_ALIGNMENT_PLAN.md` Phase 3+, out of scope per `SITE_MAP.md`. The file says so itself |
| aesthetic [BUTTON PLACEMENT] | The file says it is not a bug. Recorded as a rule in `DESIGN_CONSISTENCY_SPEC.md` §1 |
| vessel PURSER: "role concept barely maps; no welfare module" | Absent feature |
| vessel TECH_MANAGER: no `FIN_VIEW` | The file calls it consistent with the role. The cost it sees anyway is N1 |
| vessel TECH_MANAGER `/change-orders/new`, TECH_MANAGER `/admin`, CAPTAIN `/admin` | Correct refusals given the grant. The shell they render is N8, and the dead-end link is auth-security's sidebar Low (G3.17) |
| vessel OWNER, CREW and FINANCE Low entries; OWNERS_REP triage without complete | Confirmations of working controls, or noted by the file as "plausibly intentional" |

---

## 6. Corrections and claims that did not survive verification

1. **`AUDIT_REPORT.md` §7 — "`lib/project.ts`. The scoping model is correct."** It is correct
   for the query it runs and for owner-side users. For every other role, its default of treating
   an unscoped assignment as all projects is C16. G2.1 builds on this function, so G1.4 has to
   land first.
2. **`findings-auth-security.md` stated that every other `(app)` page carries a `hasPermission`
   test.** The suppliers finding says "Every other page under `(app)` follows `requireUser()` with
   a `hasPermission` test", and the sidebar finding says "the pages themselves do guard". Both are
   false for `/dashboard` and `/approvals` (C15).
3. **Vessel [X2] calls reachability through the ordinary UI a new fact.** It is not.
   `findings-workflow-logic.md`'s crew-request finding already records the unfiltered detail-page
   buttons. The live confirmation for CREW is what is new.
4. **role-walkthrough-yard-external says it does not re-log the ungated comment actions or the
   crew-request gaps.** It re-logs them as three Critical entries (CLASS, FLAG, AUDITOR) and one
   Medium (CONTRACTOR). They are counted here as re-observations (§5.2).
5. **Count headers.** Three new files misstate their own totals (§2).
6. **workflow-functional scored C17 High.** It is re-scored Critical (§2).
7. **dead-code's "two parallel permission systems".** `PERMISSION_MATRIX.md` refines this: there
   is one grant source and two check paths. `prisma/seed.ts:50-56` rewrites every `RolePermission`
   row from `ROLE_PERMISSIONS` on each seed, so the database traversals and `hasPermission` can
   disagree only if the matrix changes without a reseed. The dead-code fix (one check path) and its
   severity stand.
8. **N1 is wider than [X3] states.** Crew-request cost (`crew-requests/[id]/page.tsx:109`) and the
   three cost columns on `/approvals` (`:134,208,261`) are also rendered without `FIN_VIEW`.
9. **C17 is wider than the finding states.** `rejectQuote` is gated on `JOB_CANCEL`, which YARD_PM
   holds, so the yard can produce the client's quote-rejection record.
10. **Seven existing defects that Phase 2b re-observed had no closing item in `ACTION_PLAN.md`:**
    - the ungated comment actions (M);
    - the admin directory rendering (M);
    - the suppliers page permission (M);
    - no Cancel on the two older create forms (M);
    - the four "no access" wordings (L);
    - the unfiltered sidebar (L);
    - `row-hover` (L).

    The additions close each one (G2.9, G2.12, G3.17, G3.18, G3.19).

---

## 7. What was checked and found correct

Recorded so that Phase 5 does not "fix" working code.

- **The acceptance ceremony's internals**, re-exercised live end to end: code delivery, the
  fingerprint check, the attempt counter, the `APPROVE` audit row with IP and user agent. C17 is
  about *who* may start the ceremony, not how it runs.
- **AUDITOR's grant** gives every `_VIEW` key and nothing else. It is the one grant that exactly
  matches its role. Its write paths come from missing guards (C6, the comment actions), not from
  the grant.
- **The job pages' own gates.** The comment box requires `JOB_COMMENT`, "Record minute" requires
  `MINUTES_RECORD`, and transition buttons are filtered by permission. The change-order detail
  page also filters its transitions, and the crew-request Assignment panel requires `CR_ASSIGN`.
  The check-then-hide pattern is known; the gaps above are places it was not applied.
- **G1.1's boundary** catches a thrown `forbidden` and keeps the shell. This was confirmed live by
  CAPTAIN and TECH_MANAGER. Only the "Try again" button is wrong (N8).
- **The budget panel and value chart** on the dashboard correctly require `FIN_VIEW`, and the
  change-order print page and export correctly redact cost.
- **`/change-orders` and `/crew-requests`** correctly hide "New" from roles that cannot create.
- **Notification fan-out** has one writer, `notify()`, and ten call sites, all mapped in
  `NOTIFICATION_MAP.md`. No SMS or push path exists, and none is claimed.
- **The permission matrix** accounts for all 56 keys (41 enforced, 14 dead, 1 unreachable), with
  one grant source (item 7 in §6).
- **Mobile** at 390px reproduces C12 and nothing further.
- **Modals** are uniformly absent, and creation flows are uniformly full pages. That consistency is
  correct and is kept as `DESIGN_CONSISTENCY_SPEC.md` §3 Rule A.

---

## 8. Sequencing note for `ACTION_PLAN.md`

The additions follow the plan's own rule: dependency first, severity second.

- **C16 → G1.4, in Gate 1.** G2.1's effect depends on it, so it is a foundation as well as a
  Critical. Without it, G2.1 enforces a scope that is open by default for every yard, external and
  vessel-side account.
- **C15 → G2.9.** It needs no machinery: `hasPermission` and `EmptyState` exist, and a page that
  returns `EmptyState` never throws. It is the same early-return guard every module page already
  has, so it does not warrant a gate of its own. It sits in Gate 2 marked independent, as C3 (G2.5) does. It is not in
  Gate 0, which has been executed and was reserved for anonymous exposure. It can run immediately.
- **C17 → G2.11.** It is independent of G2.3 and should land in the same release so that both
  doors into the ceremony close together. **G2.3 as scoped does not fix C17.**
- **[X2] → no new item.** It is C6, and G2.4 already closes the unfiltered-button half through
  workflow-logic's finding. A note under Gate 2 makes the acceptance criterion explicit.
- **The comment actions → G2.12.** auth-security's own fixes for C5 and C6 name the comment
  actions, but G2.2's and G2.4's bullets omit them.
- **N1 → G2.10**, independent.
- **Workflow reasons, the countersignature, crew-request assignment, the grant review, sub-project
  scope, the no-access experience, and the design-spec work → Gate 3** (G3.12–G3.19). They depend
  on Gate 2's rewrites.
- **The grant review (G3.15) must precede G6.7 and G6.9.** G6.7 would otherwise delete keys the
  review keeps, and G6.9 would otherwise seed GUEST and SUPPLIER with the grants the review
  rejects.
- **The design-spec work (G3.17–G3.19) sits in Gate 3, not Gate 5.** It changes markup that
  Gate 5 measures.
