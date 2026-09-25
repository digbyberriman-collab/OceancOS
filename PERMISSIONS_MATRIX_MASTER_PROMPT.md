# OceancOS — Users & Access permission matrix: master build prompt

> **How to use this file.** Hand it to an engineering session as its brief ("Execute
> `PERMISSIONS_MATRIX_MASTER_PROMPT.md`, starting at the first unticked item in §15"). It is
> written as a direct instruction. Everything in §2 has already been decided with the product
> owner. Do not reopen it. Everything else is a specification: follow it, and where the code
> disagrees with it, log a finding (§1) and choose the option that keeps the rules in §1 intact.

---

## 0. Mission

Build a comprehensive, admin-editable permission system for OceancOS and expose it through a
**Users & Access** screen modelled on the reference crew-HR product:

- Tabs, a people search, a vessel selector, a List/Matrix toggle, preset badges, filter chips with
  counts, sensitive columns highlighted, and "click a cell to toggle, nothing saves until you press
  Review & save".
- Extended here to **every OceancOS module**. Columns are grouped by **module and subcategory**.
  Rows are grouped by **department**.
- Adjustable by administrators at two tiers:
  - **Owner / account admin:** edits the templates (Access Sets) and appoints project admins.
  - **Project Manager (project admin):** edits people on their own projects, and can only grant
    what they hold themselves.

The screen is only the visible part. The real work underneath:

1. One **typed permission catalog** as the single source of truth.
2. **Per-project, per-person overrides** on top of role templates.
3. A **resolver** that honours assignment scope. The current code does not (§3.2 D1).
4. A **seed** that stops destroying admin edits.
5. **Enforcement** that covers every route, action, export and money figure, backed by a static
   coverage test so it stays true.

---

## 1. Ground rules (non-negotiable)

1. **ACTION_PLAN discipline applies.** One item per commit. Every item must pass `npm run build`,
   `npm run typecheck` and `npm test` before the next begins; run `npm run test:e2e` on items that
   touch UI or guards. Anything found along the way is logged in `audit/findings-phase5.md` in the
   existing format, not silently folded into the current item. An item that proves wrong is struck
   through with a reason, never deleted.
2. **Never name permission keys in user-facing errors.** The rule and its rationale are in
   `src/lib/rbac.ts:208-215`. Use `forbidden("You do not have permission to do that.")`, or name
   the business action ("You cannot decide the CAPTAIN approval."), never the key.
3. **The server is the authority.** Every client-side check (disabled cells, hidden buttons,
   no-escalation hints) is repeated on the server. Client code gets permission *ids and
   verdicts*, never the catalog itself (§12.13).
4. **Existing call sites keep compiling.** `PERMISSIONS.X`, `hasPermission(user, key)` and
   `assertPermission(user, key)` keep their names and signatures. Tests import only pure modules.
   React `cache` must never reach a file Vitest imports (React 18.3 stable does not export it).
5. **Design tokens.** Dark-first, using the tokens in `tailwind.config.ts`:
   - surfaces: `ink-950…500`
   - borders: `line`, `line-soft`, `line-strong`
   - brand: `accent`, `accent-bright`, `marine`
   - status: `ok`, `warn`, `bad`
   - text: `muted`, `faint` (`faint` must not carry essential information until G5.1 lands).

   No new colour literals.
6. **No new runtime dependencies** without a logged justification. The matrix is built with
   React state, CSS `position: sticky` and native `<dialog>`. There is no virtualisation library
   and no state library.
7. **Every access change is audited** through `recordAudit` (`src/lib/audit.ts`) with a full
   before/after diff, the actor and the reason. There are no silent writes.

---

## 2. Decisions already taken (do not relitigate)

| # | Decision |
|---|---|
| D-1 | **Target is OceancOS.** The matrix covers live modules, list-only scaffold modules, and the planned Bridge modules (`BRIDGE_ALIGNMENT_PLAN.md` §6, Phases 3–12), which get **reserved** keys. |
| D-2 | **Overrides are per project** (user × project). The matrix shows one project at a time via a **Vessel → Project** selector, defaulting to the active project. Bulk actions: **Apply to all projects on this vessel** and **Copy access from another project**. |
| D-3 | **Tiered admin, no escalation.** Account admin / Owner edits Access Sets and appoints project admins. A Project Manager edits people on projects they administer and may only grant or revoke permissions they hold on that project. Granting a sensitive or critical permission requires a written reason. |
| D-4 | **Job prices get their own permission, `job.price.view`.** By default it goes to Owner, Owner's Rep, Project Manager, Finance, Tech Manager, Auditor, Captain and Yard PM. Chief Officer, Chief Engineer, HOD, Crew, Yard Trade Lead and Contractor **stop seeing job prices** by default; admins can grant them per person. |
| D-5 | **The most specific assignment wins.** On a given project, project-scoped assignments replace vessel-scoped ones, which replace unscoped (fleet-wide) ones. Per-person overrides then layer on top. |
| D-6 | **There is no "Approve" access level.** Approval stages, signatures and yard-side/client-side decisions are explicit *authority* permissions that no level ever sets. A single "Approve" rung would hand one person several change-order stages, which breaks separation of duties. |
| D-7 | **Sensitivity in OceancOS means** money, signatures and approvals, confidential documents, audit, and administration. The reference product's medical/employment columns have no equivalent here. |

---

## 3. Verify the current state first

Before writing code, confirm each fact below against the tree; line numbers drift. If one is no
longer true, note it in your first commit message and adapt.

### 3.1 What exists

- **Stack:** Next.js 14.2 App Router, TypeScript, Prisma 5 on PostgreSQL, Tailwind, zod, Vitest
  (`tests/`), Playwright (`e2e/`). Server components plus server actions. Single-tenant, with no
  Organization model. There is no Supabase and no RLS: authorization is app-level only.
- **Permissions:** `src/lib/rbac.ts`.
  - `PERMISSIONS` (56 keys, `resource.action[.qualifier]`) at `:6-77`; `PermissionKey` at `:79`.
  - `ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]>` at `:82-198`. This is the seed matrix.
  - `hasPermission` at `:200`, `hasAnyRole` at `:204` (unused outside tests), `assertPermission`
    at `:216`.
- **Roles and departments:** `src/lib/enums.ts`. `ROLE_KEYS` (19) at `:3-23`, `DEPARTMENTS` (12)
  at `:165-178`, `CO_APPROVAL_STAGES`. There is no separate rank model; roles double as ranks.
- **Schema:** `prisma/schema.prisma:12-78`: `User`, `Session.activeProjectId`, `Role`,
  `Permission`, `RolePermission`, `UserRole { userId, roleId, vesselId?, projectId?,
  departmentId? }`, `Department { name, code }`. `UserRole.departmentId` is never read.
- **Loading the user:** `getCurrentUser()` at `src/lib/auth.ts:47-74`.
- **Project reach:** `src/lib/project.ts`. `listProjectsForUser` (an unscoped assignment means
  every project; otherwise the named projects plus every project on the named vessels),
  `getActiveProject` and `storeActiveProject`.
- **Workflow permission maps:**
  - `CO_STAGE_PERMISSION` at `src/lib/workflow/changeOrder.ts:12-20`; `permissionForTransition`
    at `:54-58` (SUBMITTED needs `submit`, CANCELLED needs `cancel`, anything else needs `edit`).
  - `JOB_TRANSITION_PERMISSION` at `src/lib/jobs/workflow.ts:39-51`.
- **Admin UI:**
  - `src/app/(app)/admin/page.tsx` is read-only, gated at `:13` on `admin.users` OR `audit.view`.
    `admin.users` is granted to no role, so only the `audit.view` half can pass.
  - `src/app/(app)/admin/projects/*` edits a project's code and yard dates (`project.edit`).
- **Navigation:** the `NAV` array in `src/components/layout/Sidebar.tsx:28-48`. It is not filtered
  by permission.
- **Shell:** `src/app/(app)/layout.tsx` sets `max-w-[1400px]` on `<main>`.
  `src/components/layout/TopBar.tsx:53` shows `roleKeys[0]` as the user's role.
- **UI kit:** `src/components/ui/` has `Badge`, `EmptyState`, `FileDrop`, `Form`. **There is no
  Dialog component.**
- **Tests:** `tests/rbac.test.ts` covers matrix integrity plus the separation-of-duties
  assertions: crew get no financials; the owner cannot approve tech stages or drawings; the
  auditor is read-only; confidential documents go only to FINANCE, OWNER and OWNERS_REP.

### 3.2 Defects this work fixes

| ID | Defect | Where |
|---|---|---|
| D1 | **Permissions are unioned across scoped assignments.** A user who is CAPTAIN on project A and CREW on project B has Captain rights on B. | `src/lib/auth.ts:47-74` |
| D2 | **The seed wipes and rebuilds `RolePermission`.** Any admin edit to a template would be lost on the next seed. | `prisma/seed.ts:33-58` (`deleteMany` at the "wipe and reset" loop) |
| D3 | **Five global permission-holder lookups** that ignore the project. They offer and notify people on other refits. | `jobs/actions.ts:74-80` (authoriser validation), `jobs/actions.ts:129-135` (notify yard), `jobs/new/page.tsx:30-41` (authoriser dropdown), `jobs/[id]/accept/actions.ts:~233-242` (countersign notify), `change-orders/actions.ts:116-122` (stage approvers). All under `src/app/(app)/`. |
| D4 | **The permission is checked before the record is loaded**, so it cannot be evaluated on the record's project. | `jobs/actions.ts`: `issueQuote` `:164`→`:167`, `setJobProgress` `:412`→`:415`, `addJobComment` `:444`→`:450`; `jobs/[id]/accept/actions.ts`: `requestAcceptanceCode` `:50`, `confirmAcceptance` `:127`, `rejectQuote` `:261` |
| D5 | **Duplicate approval-stage map typed `Record<string,string>` and used with `as any`.** | `approvals/page.tsx:14-22,28`; `change-orders/actions.ts:151` (`permKey as any`) |
| D6 | **Money gating is too loose.** Job list and detail, CO list and detail, the approvals page and crew-request detail render money to anyone who can open them. | `fmtMoney` in `jobs/page.tsx`, `jobs/[id]/page.tsx`, `jobs/[id]/accept/page.tsx`, `change-orders/page.tsx`, `change-orders/[id]/page.tsx`, `approvals/page.tsx`, `crew-requests/[id]/page.tsx:109`, `print/jobs/[id]/page.tsx` |
| D7 | **Money gating is too strict.** Exports hide prices without `financial.view`, which YARD_PM lacks, so the yard's export of its own quotes has no prices. | `src/app/api/export/jobs/route.ts:35`, `api/export/change-orders/route.ts:36` |
| D8 | **Exports check the view permission, not the export permission.** The `export` key is never checked anywhere. | both export routes |
| D9 | **`/suppliers` has no permission check.** | `src/app/(app)/suppliers/page.tsx:9` |
| D10 | **The dashboard's "Recent activity" shows the global audit log to every user.** | `dashboard/page.tsx:54` (query), `:347` (panel) |
| D11 | **CO and crew-request comments have no permission or project check.** Already logged. | `change-orders/actions.ts:218`, `crew-requests/actions.ts:128`; `audit/findings-data-api.md:864-874` |
| D12 | **14 keys are defined but never checked:** `admin.roles`, `admin.settings`, `export`, `contractor.edit`, `document.upload`, `drawing.upload`, `drawing.approve`, `financial.approve`, `financial.budget.edit`, `inventory.edit`, `logistics.edit`, `meeting.edit`, `risk.edit`, `schedule.edit`. The `admin.*` keys are granted to no role. | `rbac.ts`; `audit/findings-dead-code.md:131-134` |
| D13 | **The sidebar shows every module to every user.** | `Sidebar.tsx:28-48` |
| D14 | **The TopBar shows the first global role,** which is meaningless once roles are per project. | `TopBar.tsx:53` |

D1, D2, D3, D4, D6/D7 (as one money-model finding), D10 and D14 are **not yet logged**. Item P.0
(§15) logs them.

### 3.3 Where this sits in ACTION_PLAN

- G1.1 (error boundary, `ActionError`) has landed.
- These items are still open and are prerequisites or overlaps:
  - **G1.2** (`requireProjectAccess`, `scopedProjectFilter`)
  - **G1.3** (`applyTransition`)
  - **G2.1** (scoping at 14 call sites)
  - **G2.4** (crew-request permission coverage)
  - **G4.3** (request memoisation with React `cache`)
  - **G6.7** (remove the 14 unenforced keys)
  - **G6.9** (grant or delete `admin.*`, and seed the 7 roles that have no account)
- §15 amends these items rather than duplicating them. **Do not start Gate A (the screen) before
  Gate 1 and Gate 2 are done.** A matrix editor over an unenforced, unscoped model would be
  cosmetic.

---

## 4. Architecture at a glance

```
            ┌──────────────────────────── pure, client-safe, unit-tested ─────────────────────────────┐
keys.ts ──► catalog.ts (meta, modules, levels) ──► defaults.ts (system access sets) ──► sod.ts (rules)
                    │                                        │
                    ▼                                        ▼
              policy.ts  ◄──────────────────────────  sync.ts (planSync)  ──► prisma/seed.ts
   (closure, coveringAssignments, computeEffective, levelOf, cellState)
                    │
                    ▼  (server-only)
   resolver.ts: getEffectiveAccess, holdersOf, loadProjectMatrix   (React cache, per request)
                    │
                    ▼
   guards.ts: forProject, canOn, assertPermissionOn  +  rbac.ts façade (hasPermission/assertPermission)
                    │
       ┌────────────┼──────────────────────────────┬─────────────────────────────┐
       ▼            ▼                              ▼                             ▼
  pages/actions   sidebar (module ids only)   exports/print (money.ts)   /admin/access (authority.ts)
```

Everything under `src/lib/permissions/` except `resolver.ts` and `guards.ts` is **pure**: no
Prisma, no `next/*`, no React `cache`. Those two files start with `import "server-only"`.

---

## 5. The permission catalog

### 5.1 Files

| File | Contents |
|---|---|
| `src/lib/permissions/keys.ts` | `PERMISSIONS` (moved verbatim from `rbac.ts`, plus the new keys, minus `EXPORT`), `PermissionKey`, `ALL_KEYS` |
| `src/lib/permissions/catalog.ts` | `PERMISSION_META`, `MODULES`, `LEVELS`, lookups. Its header comment carries the §16 definition of done. |
| `src/lib/permissions/defaults.ts` | `SYSTEM_ACCESS_SETS`, `DEFAULTS_VERSION`, `DEFAULTS_MIGRATIONS` |
| `src/lib/permissions/sod.ts` | `SOD_RULES`, `CATEGORY_CEILINGS` |
| `src/lib/permissions/policy.ts` | `buildGraph`, `closure`, `denyCascade`, `coveringAssignments`, `computeEffective`, `levelOf`, `levelKeys`, `cellState` |
| `src/lib/permissions/authority.ts` | `validateChangeSet` (no-escalation, self, rank, last-admin, reason, SoD, ceilings) |
| `src/lib/permissions/sync.ts` | `planSync` (pure) and `applySync(prisma, plan)` |
| `src/lib/permissions/filters.ts` | filter-chip definitions (§12.4) |
| `src/lib/permissions/money.ts` | `canSeeMoney(perms, moduleId)` |
| `src/lib/permissions/matrixState.ts` | the reducer for staged changes (§12.7) |
| `src/lib/permissions/resolver.ts` | `"server-only"`: `getEffectiveAccess`, `holdersOf`, `loadProjectMatrix` |
| `src/lib/permissions/guards.ts` | `"server-only"`: `forProject`, `canOn`, `assertPermissionOn` |
| `src/lib/rbac.ts` | **Façade.** Re-exports `PERMISSIONS`/`PermissionKey`; keeps `hasPermission` and `assertPermission`; keeps `ROLE_PERMISSIONS` as a `@deprecated` value derived from `SYSTEM_ACCESS_SETS` so `tests/rbac.test.ts` keeps passing. |

### 5.2 Types

```ts
// catalog.ts
export type Sensitivity = "standard" | "sensitive" | "critical"; // header: default | text-warn | text-bad
export type Scope = "project" | "account";
export type Level = "view" | "contribute" | "manage" | "full";   // null ⇒ authority key: explicit toggle only
export type Kind = "read" | "write" | "decide" | "admin" | "self"; // "self" = personal settings, exempt from ceilings
export type ModuleStatus = "live" | "scaffold" | "planned";

export type PermissionMeta = {
  label: string;            // full label, used in tooltips, aria-label and the review dialog
  short: string;            // ≤ 16 chars, the column header
  description: string;      // one sentence: what it lets a person do
  sensitivity: Sensitivity;
  scope: Scope;
  level: Level | null;
  kind: Kind;
  implies?: PermissionKey[]; // explicit only (R3). R1/R2 are automatic.
  enforced: boolean;         // a guard checks it today. The coverage test (§14.2) keeps this honest.
  since: number;             // DEFAULTS_VERSION in which the key appeared (0 = pre-existing)
};

export type ModuleDef = {
  id: ModuleId;
  label: string;
  short: string;                         // collapsed-band label
  status: ModuleStatus;
  viewKey: PermissionKey | null;         // null ⇒ no R2 implication (e.g. contacts & forms)
  nav?: { href: string; section?: string };
  bridgePhase?: number;
  groups: { id: string; label: string; keys: PermissionKey[] }[]; // the subcategory column groups
};

export const PERMISSION_META = { /* … */ } satisfies Record<PermissionKey, PermissionMeta>;
export const MODULES: readonly ModuleDef[] = [ /* … */ ];
```

Declaring `satisfies Record<PermissionKey, PermissionMeta>` makes registration a **type error**
in both directions: a key without metadata fails, and metadata without a key fails. A unit test
asserts that `MODULES[].groups[].keys` **partitions** `ALL_KEYS`: every key appears in exactly
one group of exactly one module.

### 5.3 Implication rules (acyclic; enforced by test)

- **R1.** Every `project`-scope key implies `project.access`, the root.
- **R2.** Every key implies its module's `viewKey` when both have the same scope and the module
  has one.
- **R3.** Explicit implications:

| Key(s) | Implies |
|---|---|
| `job.issue_quote`, `job.countersign`, `job.accept` | `job.price.view` |
| `change_order.create`, `change_order.approve.{captain,owners_rep,yard,finance}` | `change_order.cost.view` (the tech/class/flag stages are technical decisions and do not see cost) |
| `purchase_order.manage`, `purchase_order.approve` | `purchase_order.view` |
| `supplier_invoice.approve` | `supplier_invoice.view` |
| `plan.edit` | `plan.view` |
| `plan.manage` | `plan.edit` |
| `location.ga.manage` | `location.edit` |
| `minutes.publish` | `minutes.record` |
| `contact.manage` | `contact.view` |
| `forms.manage` | `forms.view` |

**Cross-module allowlist.** These are the only permitted edges between modules, and a test
enforces the list:

| Key | Implies |
|---|---|
| `minutes.record` | `job.comment` |
| `minutes.publish` | `meeting.view` |
| `crew_request.promote_to_job` | `job.request` |

**Denying a key cascades.** Denying key K removes every key whose closure contains K. For
example, denying `job.view` also removes `job.request`, `job.accept` and the rest, and denying
`project.access` removes the person from the project. The UI must say so before staging (§12.6).

### 5.4 Module access levels (List view)

Levels are cumulative: **None ⊂ View ⊂ Contribute ⊂ Manage ⊂ Full**. For module M and level L:

```
levelKeys(M, L) = closure({ k ∈ M : meta[k].level ≤ L }) ∩ ladderKeys(M)
ladderKeys(M)   = { k ∈ M : meta[k].level !== null }
levelOf(M, eff) = the highest L with levelKeys(M, L) == eff ∩ ladderKeys(M); "custom" if none; "none" if empty
```

- Authority keys (`level: null`) are never set or cleared by a level change. They show as chips
  beside the level select.
- Changing a level stages exactly the ladder keys that differ.

### 5.5 Full taxonomy: 24 modules, 112 keys

**Legend**

| Column | Values |
|---|---|
| **Lv** | `V`/`C`/`M`/`F` = view / contribute / manage / full · `A` = authority (explicit only) |
| **Tier** | blank = standard · `s` = sensitive (orange header; reason needed to grant) · `c` = critical (red header; reason needed to grant or revoke) |
| **Kind** | `r` read · `w` write · `d` decide · `a` admin · `self` |
| **Scope** | `acct` = account scope; otherwise project scope |
| **E/R** | **E** = a guard checks it once Gate 2 is done · **R** = reserved, no guard yet, may be pre-granted (hatched in UI) |

**NEW** marks keys introduced by this work. Const names follow the existing style.

Set `enforced` in `catalog.ts` to what is true *at each commit*:
- In G1.4, only keys a guard checks *today* are `true`.
- Each Gate 2 item flips the keys it starts guarding.
- G2.16 finalises the flags to the E/R column below.

#### 1. Project — `project` · live · nav `/admin/projects` · viewKey `project.access`

| Group | Const | Key | Column | Lv | Tier | Kind | Scope | E/R |
|---|---|---|---|---|---|---|---|---|
| Membership | `PROJ_ACCESS` NEW | `project.access` | On project | V | | r | | E |
| Settings | `PROJ_EDIT` | `project.edit` | Edit project | M | | w | | E |
| Settings | `PROJ_SECTIONS` NEW | `project.sections.manage` | Job sections | F | | w | | R |
| Portfolio | `PROJ_CREATE` NEW | `project.create` | Create projects | A | s | a | acct | R |
| Portfolio | `PROJ_ARCHIVE` NEW | `project.archive` | Archive projects | A | s | a | acct | R |

#### 2. Home & reports — `home` · planned (Bridge Ph. 4, 12) · viewKey `null`

| Group | Const | Key | Column | Lv | Tier | Kind | Scope | E/R |
|---|---|---|---|---|---|---|---|---|
| Home | `YARD_HOME_VIEW` NEW | `yard_home.view` | Yard home | V | | r | | R |
| Reports | `REPORT_ANALYTICS` NEW | `report.analytics.view` | Analytics | M | s | r | | R |
| Reports | `REPORT_PORTFOLIO` NEW | `report.portfolio.view` | Portfolio | A | s | r | acct | R |

The existing `/dashboard` gets no key of its own. It stays the landing page, and each panel is
gated by its own module's key.

#### 3. Quotes & jobs — `job` · live · nav `/jobs` · viewKey `job.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Access | `JOB_VIEW` | `job.view` | See jobs | V | | r | E |
| Access | `JOB_PRICE_VIEW` NEW | `job.price.view` | See prices | M | s | r | E |
| Access | `JOB_EXPORT` NEW | `job.export` | Export | F | | r | E |
| Requests | `JOB_REQUEST` | `job.request` | Raise request | C | | w | E |
| Requests | `JOB_COMMENT` | `job.comment` | Comment | C | | w | E |
| Yard side | `JOB_ISSUE_QUOTE` | `job.issue_quote` | Issue quote | A | s | d | E |
| Yard side | `JOB_COUNTERSIGN` | `job.countersign` | Countersign | A | s | d | E |
| Yard side | `JOB_PROGRESS` | `job.progress` | Set progress | A | | w | E |
| Yard side | `JOB_COMPLETE` | `job.complete` | Mark complete | A | | d | E |
| Yard side | `JOB_IMPORT` NEW | `job.import` | Import quotes | A | | w | R |
| Client decisions | `JOB_ACCEPT` | `job.accept` | Sign quotes | A | s | d | E |
| Client decisions | `JOB_CANCEL` | `job.cancel` | Cancel / reject | A | | d | E |
| Client decisions | `JOB_WORKS_ACCEPT` | `job.works_accept` | Accept works | A | s | d | E |
| Client decisions | `JOB_DEFICIENCY` | `job.deficiency` | Report defect | A | | d | E |

#### 4. Change orders — `change_order` · live · nav `/change-orders` · viewKey `change_order.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Access | `CO_VIEW` | `change_order.view` | See COs | V | | r | E |
| Access | `CO_COST_VIEW` NEW | `change_order.cost.view` | See cost | M | s | r | E |
| Access | `CO_EXPORT` NEW | `change_order.export` | Export | F | | r | E |
| Authoring | `CO_CREATE` | `change_order.create` | Raise CO | C | | w | E |
| Authoring | `CO_COMMENT` NEW | `change_order.comment` | Comment | C | | w | E |
| Authoring | `CO_EDIT` | `change_order.edit` | Workflow moves | M | | w | E |
| Authoring | `CO_SUBMIT` | `change_order.submit` | Submit | M | | w | E |
| Authoring | `CO_CANCEL` | `change_order.cancel` | Cancel | M | | d | E |
| Approval stages | `CO_APPROVE_CAPTAIN` | `change_order.approve.captain` | Captain stage | A | s | d | E |
| Approval stages | `CO_APPROVE_OWNERS_REP` | `change_order.approve.owners_rep` | Owner rep stage | A | s | d | E |
| Approval stages | `CO_APPROVE_YARD` | `change_order.approve.yard` | Yard stage | A | s | d | E |
| Approval stages | `CO_APPROVE_FINANCE` | `change_order.approve.finance` | Finance stage | A | s | d | E |
| Approval stages | `CO_APPROVE_TECH` | `change_order.approve.tech_manager` | Tech mgr stage | A | s | d | E |
| Approval stages | `CO_APPROVE_CLASS` | `change_order.approve.class` | Class stage | A | s | d | E |
| Approval stages | `CO_APPROVE_FLAG` | `change_order.approve.flag` | Flag stage | A | s | d | E |
| Approval stages | `CO_APPROVAL_DELEGATE` NEW | `change_order.approval.delegate` | Delegate stage | A | s | a | R |

#### 5. Crew requests — `crew_request` · live · nav `/crew-requests` · viewKey `crew_request.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Access | `CR_VIEW` | `crew_request.view` | See requests | V | | r | E |
| Access | `CR_COST_VIEW` NEW | `crew_request.cost.view` | See cost | M | s | r | E |
| Access | `CR_EXPORT` NEW | `crew_request.export` | Export | F | | r | R |
| Requests | `CR_CREATE` | `crew_request.create` | Raise request | C | | w | E |
| Requests | `CR_COMMENT` NEW | `crew_request.comment` | Comment | C | | w | E |
| Handling | `CR_TRIAGE` | `crew_request.triage` | Triage | M | | w | E |
| Handling | `CR_ASSIGN` | `crew_request.assign` | Assign | M | | w | E |
| Handling | `CR_PROGRESS` NEW | `crew_request.progress` | Progress | M | | w | E |
| Handling | `CR_COMPLETE` | `crew_request.complete` | Complete / close | M | | d | E |
| Escalation | `CR_PROMOTE` NEW | `crew_request.promote_to_job` | Promote to job | F | | w | R |

#### 6. Approvals centre — `approvals` · live · nav `/approvals` · viewKey `approvals.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Queue | `APPROVALS_VIEW` NEW | `approvals.view` | Full queue | V | | r | E |

Decisions still use each module's stage keys. The Approvals nav item and page are visible to a
holder of `approvals.view` **or of any CO stage key**. Without `approvals.view`, the page shows
only "Waiting on me". This is deliberately **not** an implication: denying the queue must not
strip anyone's signing authority.

#### 7. Minutes — `minutes` · planned (Bridge Ph. 7; `minutes.record` is live) · viewKey `minutes.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Minutes | `MINUTES_VIEW` NEW | `minutes.view` | See minutes | V | | r | R |
| Minutes | `MINUTES_RECORD` | `minutes.record` | Record minute | C | | w | E |
| Minutes | `MINUTES_PUBLISH` NEW | `minutes.publish` | Publish | M | | w | R |

#### 8. After sales / warranty — `after_sales` · planned (Ph. 5) · viewKey `after_sales.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Warranty | `AS_VIEW` NEW | `after_sales.view` | See claims | V | | r | R |
| Warranty | `AS_CREATE` NEW | `after_sales.create` | Raise claim | C | | w | R |
| Warranty | `AS_MANAGE` NEW | `after_sales.manage` | Handle (yard) | A | | d | R |

#### 9. Yard invoices & payments — `yard_billing` · planned (Ph. 6) · viewKey `yard_invoice.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Invoices | `YINV_VIEW` NEW | `yard_invoice.view` | See invoices | V | s | r | R |
| Invoices | `YINV_EXPORT` NEW | `yard_invoice.export` | Export | F | s | r | R |
| Invoices | `YINV_MANAGE` NEW | `yard_invoice.manage` | Issue invoices | A | s | w | R |
| Payments | `PAYMENT_RECORD` NEW | `payment.record` | Record payment | A | s | d | R |

#### 10. Schedule & planning — `schedule` · scaffold (+ planned Ph. 9) · nav `/schedule` · viewKey `schedule.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Schedule | `SCH_VIEW` | `schedule.view` | See schedule | V | | r | E |
| Schedule | `SCH_EDIT` | `schedule.edit` | Edit schedule | M | | w | R |
| Schedule | `SCH_EXPORT` NEW | `schedule.export` | Export | F | | r | R |
| Planning | `PLAN_VIEW` NEW | `plan.view` | See Gantt | V | | r | R |
| Planning | `PLAN_EDIT` NEW | `plan.edit` | Edit Gantt | M | | w | R |
| Planning | `PLAN_MANAGE` NEW | `plan.manage` | Baselines | F | | w | R |

#### 11. Budget & procurement — `financial` · scaffold · nav `/financials` · viewKey `financial.view`

| Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|
| Budget | `FIN_VIEW` | `financial.view` | See budget | V | s | r | E |
| Budget | `FIN_EDIT_BUDGET` | `financial.budget.edit` | Edit budget | M | s | w | R |
| Budget | `FIN_EXPORT` NEW | `financial.export` | Export | F | s | r | R |
| Budget | `FIN_APPROVE` | `financial.approve` | Approve spend | A | s | d | R |
| Procurement | `PO_VIEW` NEW | `purchase_order.view` | See POs | V | s | r | R |
| Procurement | `PO_MANAGE` NEW | `purchase_order.manage` | Raise POs | M | s | w | R |
| Procurement | `PO_APPROVE` NEW | `purchase_order.approve` | Approve POs | A | s | d | R |
| Procurement | `SINV_VIEW` NEW | `supplier_invoice.view` | See invoices | V | s | r | R |
| Procurement | `SINV_APPROVE` NEW | `supplier_invoice.approve` | Approve invoices | A | s | d | R |

#### 12–19. Scaffold modules (list-only today)

| Module (id · nav) | Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|---|
| Logistics (`logistics` · `/logistics`) | Logistics | `LOG_VIEW` | `logistics.view` | See | V | | r | E |
| | | `LOG_EDIT` | `logistics.edit` | Edit | M | | w | R |
| | | `LOG_EXPORT` NEW | `logistics.export` | Export | F | | r | R |
| Inventory (`inventory` · `/inventory`) | Inventory | `INV_VIEW` | `inventory.view` | See | V | | r | E |
| | | `INV_EDIT` | `inventory.edit` | Edit | M | | w | R |
| | | `INV_EXPORT` NEW | `inventory.export` | Export | F | | r | R |
| Drawings (`drawing` · `/drawings`) | Drawings | `DRW_VIEW` | `drawing.view` | See | V | | r | E |
| | | `DRW_UPLOAD` | `drawing.upload` | Upload | C | | w | R |
| | | `DRW_APPROVE` | `drawing.approve` | Approve | A | s | d | R |
| Documents (`document` · `/documents`) | Documents | `DOC_VIEW` | `document.view` | See | V | | r | E |
| | | `DOC_UPLOAD` | `document.upload` | Upload | C | | w | R |
| | | `DOC_DELETE` NEW | `document.delete` | Delete | F | s | w | R |
| | Confidential | `DOC_VIEW_CONFIDENTIAL` | `document.view.confidential` | Confidential | A | s | r | E |
| Meetings (`meeting` · `/meetings`) | Meetings | `MTG_VIEW` | `meeting.view` | See | V | | r | E |
| | | `MTG_EDIT` | `meeting.edit` | Edit | M | | w | R |
| Risks (`risk` · `/risks`) | Risks | `RSK_VIEW` | `risk.view` | See | V | | r | E |
| | | `RSK_EDIT` | `risk.edit` | Edit | M | | w | R |
| | | `RSK_EXPORT` NEW | `risk.export` | Export | F | | r | R |
| Contractors (`contractor` · `/contractors`) | Directory | `CON_VIEW` | `contractor.view` | See | V | | r | E |
| | | `CON_EDIT` | `contractor.edit` | Edit | M | | w | R |
| Suppliers (`supplier` · `/suppliers`) | Directory | `SUP_VIEW` NEW | `supplier.view` | See | V | | r | E |
| | | `SUP_EDIT` NEW | `supplier.edit` | Edit | M | | w | R |

#### 20–22. Planned modules

| Module (id · phase) | Group | Const | Key | Column | Lv | Tier | Kind | E/R |
|---|---|---|---|---|---|---|---|---|
| GA locations (`location` · Ph. 8) | Locations | `LOC_VIEW` NEW | `location.view` | See | V | | r | R |
| | | `LOC_EDIT` NEW | `location.edit` | Pin items | C | | w | R |
| | | `LOC_GA_MANAGE` NEW | `location.ga.manage` | Manage GA | F | | w | R |
| Contacts & forms (`contacts_forms` · Ph. 11 · viewKey `null`) | Contacts | `CONTACT_VIEW` NEW | `contact.view` | Contacts | V | | r | R |
| | | `CONTACT_MANAGE` NEW | `contact.manage` | Edit contacts | M | | w | R |
| | Forms | `FORMS_VIEW` NEW | `forms.view` | Forms | V | | r | R |
| | | `FORMS_MANAGE` NEW | `forms.manage` | Edit forms | M | | w | R |
| Notifications (`notifications` · Ph. 11) | Preferences | `NOTIF_PREFS` NEW | `notification.prefs` | Own settings | V | | self | R |

#### 23. Access — `access` · live · nav `/admin/access` · viewKey `admin.access.view`

| Group | Const | Key | Column | Lv | Tier | Kind | Scope | E/R |
|---|---|---|---|---|---|---|---|---|
| Project access | `ACCESS_VIEW` NEW | `admin.access.view` | See access | V | | r | | E |
| Project access | `ACCESS_MANAGE` NEW | `admin.access.manage` | Project admin | A | c | a | | E |
| Account | `ACCESS_APPOINT` NEW | `admin.access.appoint` | Appoint admins | A | c | a | acct | E |
| Account | `ADM_USERS` | `admin.users` | Manage users | A | c | a | acct | E |
| Account | `ADM_ROLES` | `admin.roles` | Edit access sets | A | c | a | acct | E |
| Account | `ADM_SETTINGS` | `admin.settings` | Settings | A | c | a | acct | R |

#### 24. Audit — `audit` · live · nav `/admin` (audit panel) · viewKey `audit.view`

| Group | Const | Key | Column | Lv | Tier | Kind | Scope | E/R |
|---|---|---|---|---|---|---|---|---|
| Audit | `AUDIT_VIEW` | `audit.view` | Project audit | V | s | r | | E |
| Audit | `AUDIT_VIEW_ALL` NEW | `audit.view.all` | Fleet audit | A | c | r | acct | E |

**Removed: `export` (`EXPORT`).** Nothing checks it. It is replaced by the per-module `*.export`
keys, and the seed migration converts its four holders (§6.2).

**No key needed (structural):** the dashboard shell, Search (results filtered by each module's
view key), the personal Notifications list, Favourites (requires `job.view`), and the user's own
profile.

### 5.6 Count check (assert in `permissionCatalog.test.ts`)

- **Existing keys:** 56 today; removing `export` leaves **55**, all retained.
- **New keys:** **57**, by module:

  | Module | New |
  |---|---|
  | project | 4 |
  | home | 3 |
  | job | 3 |
  | change_order | 4 |
  | crew_request | 5 |
  | approvals | 1 |
  | minutes | 2 |
  | after_sales | 3 |
  | yard_billing | 4 |
  | schedule | 4 |
  | financial | 6 |
  | logistics | 1 |
  | inventory | 1 |
  | document | 1 |
  | risk | 1 |
  | supplier | 2 |
  | location | 3 |
  | contacts_forms | 4 |
  | notifications | 1 |
  | access | 3 |
  | audit | 1 |

- **Total:** **112** keys across **24** modules.
- **Account-scope keys (8):** `project.create`, `project.archive`, `report.portfolio.view`,
  `admin.access.appoint`, `admin.users`, `admin.roles`, `admin.settings`, `audit.view.all`.

---

## 6. Access sets (templates) and default grants

In the UI, a `Role` row is an **Access set**. It is a *preset* in the matrix's Preset column.
The 19 existing roles become **system** sets, plus one new overlay set, **`ACCOUNT_ADMIN`**, which
is valid only on an unscoped assignment and **holds account-scope keys only**. It never holds a
project-scope key, so it never implies `project.access` and never gives its holder reach into a
project. A test asserts this invariant (§14.1); every "every set" row in §6.2 excludes it.

### 6.1 System sets: category, badge, rank

| Key | Category | Badge | sortOrder (rank) |
|---|---|---|---|
| `ACCOUNT_ADMIN` NEW | ADMIN | Admin | 0 |
| `OWNER` | OWNER_SIDE | Owner | 10 |
| `OWNERS_REP` | OWNER_SIDE | Owner's rep | 20 |
| `PROJECT_MANAGER` | OWNER_SIDE | PM | 30 |
| `TECH_MANAGER` | OWNER_SIDE | Tech mgr | 40 |
| `FINANCE` | OWNER_SIDE | Finance | 50 |
| `CAPTAIN` | VESSEL | Captain | 100 |
| `CHIEF_OFFICER` | VESSEL | Ch/Off | 110 |
| `CHIEF_ENGINEER` | VESSEL | Ch/Eng | 120 |
| `PURSER` | VESSEL | Purser | 130 |
| `HOD` | VESSEL | HOD | 140 |
| `CREW` | VESSEL | Crew | 150 |
| `YARD_PM` | YARD | Yard PM | 200 |
| `YARD_TRADE_LEAD` | YARD | Trade lead | 210 |
| `CLASS_SURVEYOR` | REGULATOR | Class | 300 |
| `FLAG_SURVEYOR` | REGULATOR | Flag | 310 |
| `AUDITOR` | AUDIT | Auditor | 400 |
| `CONTRACTOR` | EXTERNAL | Contractor | 500 |
| `SUPPLIER` | EXTERNAL | Supplier | 510 |
| `GUEST` | EXTERNAL | Guest | 900 |

Add `"ACCOUNT_ADMIN"` to `ROLE_KEYS`, and add `ROLE_CATEGORIES` and `DEPARTMENT_LABELS` to
`src/lib/enums.ts`.

### 6.2 Defaults: `DEFAULTS_VERSION = 1`

**V1 = V0 − `export` + the table below**, where V0 is today's `ROLE_PERMISSIONS`
(`rbac.ts:82-198`). Freeze V0 in `tests/fixtures/matrixV0.ts` and assert the exact diff. No
existing grant is removed except `export`. The **visible** behaviour change comes from D-4: job
prices, CO cost and crew-request cost were previously ungated, and are now gated by the new keys.

| New key | Default holders (explicit) | Also held via implication |
|---|---|---|
| `project.access` | — | every set with any project key (R1) |
| `project.sections.manage` | PROJECT_MANAGER, YARD_PM | |
| `project.create`, `project.archive` | ACCOUNT_ADMIN | |
| `yard_home.view` | YARD_PM, YARD_TRADE_LEAD | |
| `report.analytics.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, FINANCE, AUDITOR | |
| `report.portfolio.view` | OWNER, ACCOUNT_ADMIN | |
| `job.price.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, FINANCE, TECH_MANAGER, AUDITOR | CAPTAIN (`job.accept`), YARD_PM (`job.issue_quote`) — D-4 |
| `job.export` | OWNER, OWNERS_REP, PROJECT_MANAGER, FINANCE, YARD_PM | |
| `job.import` | YARD_PM | |
| `change_order.cost.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, CAPTAIN, FINANCE, TECH_MANAGER, AUDITOR | CHIEF_ENGINEER (`create`), YARD_PM (`approve.yard`) |
| `change_order.export` | OWNER, OWNERS_REP, PROJECT_MANAGER, FINANCE | |
| `change_order.comment` | OWNERS_REP, PROJECT_MANAGER, CAPTAIN, CHIEF_OFFICER, CHIEF_ENGINEER, HOD, YARD_PM, YARD_TRADE_LEAD, FINANCE, TECH_MANAGER, CLASS_SURVEYOR, FLAG_SURVEYOR | |
| `change_order.approval.delegate` | — (explicit grants only) | |
| `crew_request.cost.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, CAPTAIN, PURSER, AUDITOR, CHIEF_OFFICER, CHIEF_ENGINEER, HOD | |
| `crew_request.export` | OWNER, OWNERS_REP, PROJECT_MANAGER | |
| `crew_request.comment` | OWNERS_REP, PROJECT_MANAGER, CAPTAIN, CHIEF_OFFICER, CHIEF_ENGINEER, PURSER, HOD, CREW | |
| `crew_request.progress` | OWNERS_REP, PROJECT_MANAGER, CAPTAIN, CHIEF_OFFICER, CHIEF_ENGINEER, PURSER, HOD (the current triagers) | |
| `crew_request.promote_to_job` | OWNERS_REP, PROJECT_MANAGER, CAPTAIN, CHIEF_OFFICER, CHIEF_ENGINEER | |
| `approvals.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, FINANCE, TECH_MANAGER, CAPTAIN, YARD_PM, CLASS_SURVEYOR, FLAG_SURVEYOR, AUDITOR | |
| `minutes.view` | every set holding `job.view` except CONTRACTOR | |
| `minutes.publish` | OWNERS_REP, PROJECT_MANAGER, YARD_PM | |
| `after_sales.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, TECH_MANAGER, CAPTAIN, CHIEF_OFFICER, CHIEF_ENGINEER, HOD, YARD_PM, YARD_TRADE_LEAD, AUDITOR | |
| `after_sales.create` | OWNERS_REP, PROJECT_MANAGER, CAPTAIN, CHIEF_OFFICER, CHIEF_ENGINEER, HOD | |
| `after_sales.manage` | YARD_PM | |
| `yard_invoice.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, FINANCE, YARD_PM, AUDITOR | |
| `yard_invoice.export` | OWNER, OWNERS_REP, PROJECT_MANAGER, FINANCE | |
| `yard_invoice.manage` | YARD_PM (**not** FINANCE; see note) | |
| `payment.record` | FINANCE | |
| `schedule.export` | OWNER, OWNERS_REP, PROJECT_MANAGER | |
| `plan.view` | every set holding `schedule.view` | |
| `plan.edit`, `plan.manage` | PROJECT_MANAGER, YARD_PM | |
| `financial.export` | OWNER, OWNERS_REP, PROJECT_MANAGER, FINANCE | |
| `purchase_order.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, PURSER, FINANCE, AUDITOR | |
| `purchase_order.manage` | PROJECT_MANAGER, PURSER | |
| `purchase_order.approve` | OWNERS_REP, FINANCE | |
| `supplier_invoice.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, PURSER, FINANCE, AUDITOR | |
| `supplier_invoice.approve` | FINANCE | |
| `logistics.export`, `inventory.export`, `risk.export` | OWNER, OWNERS_REP, PROJECT_MANAGER | |
| `document.delete` | OWNERS_REP, PROJECT_MANAGER | |
| `supplier.view` | OWNER, OWNERS_REP, PROJECT_MANAGER, CAPTAIN, PURSER, FINANCE, AUDITOR | |
| `supplier.edit` | PROJECT_MANAGER, PURSER | |
| `location.view` | every set holding `job.view` | |
| `location.edit` | OWNERS_REP, PROJECT_MANAGER, CAPTAIN, CHIEF_OFFICER, CHIEF_ENGINEER, HOD, YARD_PM | |
| `location.ga.manage` | PROJECT_MANAGER, YARD_PM | |
| `contact.view` | every set except GUEST and ACCOUNT_ADMIN | |
| `contact.manage` | OWNERS_REP, PROJECT_MANAGER, YARD_PM | |
| `forms.view` | every OWNER_SIDE, VESSEL and YARD set | |
| `forms.manage` | OWNERS_REP, PROJECT_MANAGER | |
| `notification.prefs` | every set except ACCOUNT_ADMIN | |
| `admin.access.view` | OWNERS_REP, PROJECT_MANAGER, AUDITOR | |
| `admin.access.manage` | OWNERS_REP, PROJECT_MANAGER | |
| `admin.access.appoint`, `admin.users`, `admin.roles`, `admin.settings`, `audit.view.all` | ACCOUNT_ADMIN | |

Notes:
- **Removing `export`.** Its holders were OWNER, OWNERS_REP, PROJECT_MANAGER and FINANCE. Each
  gets the `*.export` key of every module whose view key they already hold; FINANCE therefore gets
  only the job, change-order and financial exports.
- **Deviation from `BRIDGE_ALIGNMENT_PLAN.md:579,585-586`.** That plan gives FINANCE both yard-invoice
  management and payment recording. That breaks the `billing.invoice_vs_payment` block rule
  (§11.3). Finance records payments; the yard issues invoices. Record this in the Bridge plan's
  progress log when Phase 6 lands.
- **OWNER keeps its read-only posture** in operational modules: no comment keys and no workflow
  keys. OWNER's administrative power comes from ACCOUNT_ADMIN, which the seed gives `owner@`.

### 6.3 Defaults must pass the rules

A test asserts that every `SYSTEM_ACCESS_SETS` entry, after closure:
- passes every **block** SoD rule (§11.3) and its category ceiling (§11.4);
- keeps the existing `tests/rbac.test.ts` assertions true (crew get no financials; the owner
  cannot approve tech stages or drawings; the auditor is read-only; confidential documents go only
  to FINANCE, OWNER and OWNERS_REP).

**Known and accepted:** FINANCE triggers the `fin.budget_vs_approve` **warn** rule. Splitting it is
a later product decision; log it and leave it.

---

## 7. Data model (one migration: `access_matrix`)

```prisma
model User {
  // …existing fields…
  jobTitle      String?                        // "Chief Stewardess" — the rank line under the name
  departmentId  String?                        // home department; an assignment may override
  department    Department? @relation(fields: [departmentId], references: [id])
  projectAccessOverrides ProjectAccessOverride[]
  accountAccessOverrides AccountAccessOverride[]
}

model Role {                                   // UI: "Access set". Table name unchanged.
  // …id, key, name, description, permissions, users…
  kind            String    @default("SYSTEM") // SYSTEM | CUSTOM (custom keys: "CUSTOM_<slug>")
  category        String    @default("VESSEL") // OWNER_SIDE|VESSEL|YARD|REGULATOR|AUDIT|EXTERNAL|ADMIN
  badge           String?                      // ≤ 10 chars
  sortOrder       Int       @default(1000)     // "Sort: Rank"
  version         Int       @default(0)        // optimistic concurrency for template edits
  defaultsVersion Int?                         // SYSTEM: DEFAULTS_VERSION last applied
  customisedAt    DateTime?                    // set on first admin edit → seed stops re-applying defaults
  archivedAt      DateTime?
  createdById     String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Permission {
  // …id, key, label, roles…
  projectOverrides ProjectAccessOverride[]
  accountOverrides AccountAccessOverride[]
}

model UserRole {                               // UI: "Assignment"
  // …existing fields…
  jobTitle    String?                          // per-project override (relief captain)
  createdById String?
  createdAt   DateTime @default(now())
  @@index([userId])
  @@index([projectId])
  @@index([vesselId])
}

model ProjectAccessOverride {
  id            String    @id @default(cuid())
  userId        String
  projectId     String
  permissionKey String
  effect        String                          // GRANT | DENY
  reason        String?
  expiresAt     DateTime?                       // temporary cover ("covering Ch/Off until 30 Oct")
  createdById   String
  createdAt     DateTime  @default(now())
  updatedById   String?
  updatedAt     DateTime  @updatedAt
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  project    Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionKey], references: [key], onDelete: Cascade, onUpdate: Cascade)
  @@unique([userId, projectId, permissionKey])
  @@index([projectId, permissionKey])           // holdersOf
}

model AccountAccessOverride {                   // separate table: Prisma cannot upsert on a nullable unique
  id            String    @id @default(cuid())
  userId        String
  permissionKey String
  effect        String
  reason        String?
  expiresAt     DateTime?
  createdById   String
  createdAt     DateTime  @default(now())
  updatedById   String?
  updatedAt     DateTime  @updatedAt
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionKey], references: [key], onDelete: Cascade, onUpdate: Cascade)
  @@unique([userId, permissionKey])
}

model Project    { /* + */ accessVersion Int @default(0)  accessOverrides ProjectAccessOverride[] }
model Department { /* + */ sortOrder Int @default(100)   users User[] }
model AuditLog   { /* + */ projectId String?  @@index([projectId, createdAt])  @@index([resource, resourceId]) }
```

- **Project admin needs no table.** Being a project admin means effectively holding
  `admin.access.manage` on that project. The PM and Owner's Rep sets include it; an account admin
  appoints anyone else with a GRANT override and removes it with a DENY. That route goes through
  the same audit, reason and SoD machinery as every other change.
- **"Apply to vessel" needs no table.** It is a bulk write of per-project overrides (D-2).
- **Department order:** OWNER_OFFICE, FINANCE, BRIDGE, DECK, ENGINEERING, INTERIOR, GALLEY, IT_AV,
  MEDICAL, PROCUREMENT, YARD, CLASS_FLAG. "External parties" (EXTERNAL-category rows) and
  "Unassigned" always come last.
- A row's department is `UserRole.departmentId` (the assignment covering this project) ??
  `User.departmentId` ?? Unassigned.

---

## 8. Effective-permission resolution

### 8.1 Algorithm (`policy.computeEffective`, pure)

For user U on project P (P has `id` and `vesselId`):

1. **Inactive.** If U is inactive or archived, the result is the empty set.
2. **Covering assignments, most specific wins (D-5).** An assignment *covers* P if:
   - it is project-scoped to P (any row with `projectId` set counts as project-scoped, whatever its
     `vesselId`), or
   - it is vessel-scoped to `P.vesselId` with no project, or
   - it is unscoped.

   If any project-scoped assignment covers P, **only** those apply. Otherwise the vessel-scoped
   ones apply. Otherwise the unscoped ones. Assignments at the same level are unioned.
3. **Template.** T = ∪ `RolePermission` of the winning assignments, excluding archived sets,
   filtered to project-scope keys.
4. **Overrides.** Active (non-expired) `ProjectAccessOverride` rows for (U, P) give the grant set G
   and the deny set D.
5. **Closure.** C = closure(T ∪ G) under R1–R3.
6. **Deny wins and cascades.** Remove every k ∈ C where k ∈ D or closure({k}) ∩ D ≠ ∅.
7. **Account keys.** A = closure(templates of **unscoped** assignments ∪ account GRANTs) minus
   account DENYs, restricted to account-scope keys. Scoped assignments never contribute account
   keys.
8. **Reserved keys** pass through. They are harmless, and the UI hatches them.

`computeEffective` returns:
- `keys`, `account`, `template` (the closure of T), `winningRoleIds`
- `provenance: Map<key, Provenance[]>`, where each entry is one of:
  `{type:"template", roleId}` | `{type:"implied", by}` |
  `{type:"override", id, by, at, reason, expiresAt}` | `{type:"denied", id}`

**Project reach.** `listProjectsForUser` becomes: the projects on which the user's effective set
contains `project.access`. A covering assignment alone is not enough: an assignment whose winning
template holds no project-scope key (ACCOUNT_ADMIN on its own) reaches nothing, and a DENY of
`project.access` removes the project. **Keep the existing zero-scope guard** (`project.ts`: "A
scoped user with no project or vessel named would otherwise match everything").

**Matrix rows.** The People matrix for project P lists users whose winning template on P holds at
least one project-scope key, plus users whose `project.access` is denied on P. The latter are shown
as *Removed from project* so an admin can restore them.

### 8.2 Normalisation and the Custom badge

- **On save, overrides are normalised.** A GRANT of a key already in closure(T) is dropped; a
  DENY of a key not in closure(T) is dropped. A cell set back to its template value **deletes**
  the override (INHERIT).
- **A row is Custom** when it has at least one active, non-redundant override on the project.
- An override made redundant by a later template edit is shown as "redundant" in the provenance
  popover and removed the next time that person is saved.
- **The Preset column shows the base set plus the marker**, e.g. `Captain · Custom 3`, or
  `Multiple · Custom 1` when several sets win. This deliberately differs from the reference
  product, which replaces the preset with "Custom": admins need to see the base.

### 8.3 Worked examples (turn each into a resolver test)

1. **Regression for D1.** Sam holds CAPTAIN scoped to p1 and CREW scoped to p2. On p1, Sam has
   `change_order.approve.captain`. On p2, Sam does not.
2. **Specificity.** Chris holds CHIEF_ENGINEER unscoped and HOD scoped to p1. On p1, Chris has
   exactly HOD's set. On p2 (same vessel), Chris has CHIEF_ENGINEER's.
3. **Grant with expiry.** A GRANT of `job.accept` to Chris on p1, expiring yesterday, has no
   effect today.
4. **Deny cascade.** A DENY of `job.view` on p1 removes every job key the person holds (for
   CREW, `job.request`), plus the keys outside the job module whose closure reaches `job.view`:
   `minutes.record` (via `job.comment`) and `crew_request.promote_to_job` (via `job.request`).
   `minutes.view` and `location.view` **stay**. Their defaults follow `job.view` in the seed
   (§6.2), but neither implies it, so a deny does not touch them.
5. **Removal from a project.** A DENY of `project.access` removes p1 from `listProjectsForUser`
   and empties the effective set on p1.
6. **Account keys.** ACCOUNT_ADMIN scoped to a vessel contributes **no** account keys.
7. **Archived set.** A person whose only covering assignment is an archived custom set has
   nothing on P.
8. **Account admin alone.** A user whose only assignment is ACCOUNT_ADMIN (unscoped) has the
   account keys, an empty set on every project, and an empty `listProjectsForUser`. They do not
   appear as a row on any People matrix.

---

## 9. Seeding without clobbering admin edits

Replace `prisma/seed.ts:33-58` with `await applySync(prisma, planSync(await readDbState(prisma),
catalog, defaults))`.

**`planSync`** is pure and returns a list of operations:

1. **Permission rows.** Upsert every catalog key, taking the label from `PERMISSION_META`. Delete
   rows for keys no longer in the catalog; the cascade removes stale `RolePermission` rows and
   overrides. Log the count.
2. **Each system set:**
   - **Missing:** create it with its defaults, category, badge, sortOrder and
     `defaultsVersion = DEFAULTS_VERSION`.
   - **Present, `customisedAt = null` and `defaultsVersion < DEFAULTS_VERSION`:** re-apply its
     defaults. This is safe because nobody edited it.
   - **Customised:** apply only `DEFAULTS_MIGRATIONS` entries newer than its `defaultsVersion`.
     These are **additive only**, e.g.
     `{ v: 2, note: "Supplier directory", grant: { OWNERS_REP: ["supplier.view"] } }`. Never
     re-add a key an admin removed. Never rename or reorder a customised set.
3. **Custom sets** are never touched.

**Idempotency:** running `planSync` twice gives zero operations on the second run.

**"Reset to default"** (Access sets tab) restores `SYSTEM_ACCESS_SETS[key]`, clears
`customisedAt`, bumps `version`, and is audited.

**Seed fixtures:**
- `owner@` gets OWNER plus ACCOUNT_ADMIN, both unscoped.
- Departments with `sortOrder`, and job titles on every seeded user.
- **The D1 regression user:** CAPTAIN scoped to `p1`, CREW scoped to `p2`.
- One account for each of the seven roles that have none today. This is G6.9's second half; see
  README §seeded logins and G0.1's credential rule.
- `SEED_BULK_PEOPLE=100` (opt-in) creates 100 people spread across departments and sets on `p1`,
  for the performance check in A15.

`scripts/qa.ts` gains a check that a customised set survives a second seed.

---

## 10. Resolver, guards and `getCurrentUser`

```ts
// resolver.ts — import "server-only"
export const loadProjectAccessData = cache(async (projectId: string) => ProjectAccessData);
  // 3 queries: covering assignments (projectId = P | vesselId = P.vesselId & projectId null | both null)
  // with role keys; active overrides for P; active users referenced.
export const getEffectiveAccess = cache(async (userId: string, projectId: string | null) => EffectiveAccess);
export async function holdersOf(key: PermissionKey, projectId: string): Promise<string[]>; // active user ids
export async function loadProjectMatrix(projectId: string, editorId: string): Promise<MatrixData>;

// guards.ts — import "server-only"
export async function forProject(user: CurrentUserT, projectId: string): Promise<CurrentUserT>;
  // clone of user with that project's effective set; throws notFound() if the project is unreachable
export async function canOn(user: CurrentUserT, key: PermissionKey, projectId: string): Promise<boolean>;
export async function assertPermissionOn(user: CurrentUserT, key: PermissionKey, projectId: string): Promise<void>;
  // throws forbidden("You do not have permission to do that.")
```

**Changes to `getCurrentUser` (`src/lib/auth.ts:47-74`):**
- Move session lookup into a cached `getSession()` in a new `src/lib/session.ts`, shared with
  `project.ts` to avoid a circular import.
- Resolve the validated active project, then return:

  ```ts
  { id, email, name, jobTitle, activeProjectId,
    permissions: ReadonlySet<PermissionKey>,      // effective on the active project ∪ account keys
    accountPermissions: ReadonlySet<PermissionKey>,
    presets: { name: string; badge: string | null }[],
    roleKeys /* @deprecated: winning sets on the active project */ }
  ```

- `hasPermission` and `assertPermission` keep their signatures and bodies. The ~60 existing
  list-page checks therefore become active-project-aware with no edits.
- Record-level code uses `forProject` / `canOn` / `assertPermissionOn` with `record.projectId`.
  A detail page for a record on another project is evaluated against **that** project and shows a
  "Belongs to R-00806 — switch project" banner.
- `TopBar` shows `presets` for the active project, not `roleKeys[0]` (D14).

**Replacing the direct holder queries (D3):**

| Site | Replacement |
|---|---|
| Authoriser validation | `canOn(authoriser, JOB_ACCEPT, project.id)` |
| Authoriser dropdown | `holdersOf(JOB_ACCEPT, project.id)` |
| Notify yard | `holdersOf(JOB_ISSUE_QUOTE, job.projectId)` |
| Countersign notify | `holdersOf(JOB_COUNTERSIGN, job.projectId)` |
| Stage approvers | `holdersOf(CO_STAGE_PERMISSION[stage], co.projectId)` |

**Caching:** React `cache` gives one resolution per request. This folds in G4.3, and permissions
are still derived fresh on every request, so changes take effect immediately. Unit tests exercise
`policy.ts` only.

**Interim API (keeps Gate 2 unblocked).** G1.2 ships `forProject`, `canOn` and
`assertPermissionOn` early, implemented as "require project access, then check the existing global
set". G1.3 and G2.1 adopt them at every call site. G1.9 then swaps in the real resolver behind the
same signatures, with **no call-site changes**.

---

## 11. Admin authority rules (`authority.ts`, pure, re-run on the server)

### 11.1 Who may edit what

| Action | Required |
|---|---|
| View `/admin/access` for project P | `admin.access.view` on P, or `admin.roles` |
| Edit people's overrides and project-scoped assignments on P | `admin.access.manage` on P, or `admin.roles` |
| Edit, create, archive, reorder or reset Access sets | `admin.roles` (account) |
| Appoint or remove project admins on any project; manage ACCOUNT_ADMIN assignments | `admin.access.appoint` (account) |
| Create or deactivate users | `admin.users` (account) |

### 11.2 Checks

Each check returns `Problem { userId?, key?, ruleId, severity: "block"|"warn", message }`.

1. **No escalation (D-3).** A project admin who is not an account admin may only change cells, by
   granting or revoking, for keys they **effectively hold on P**. They may only assign sets whose
   closure ⊆ their own set on P, never an ADMIN-category set, and never one containing account
   keys. Account admins (holders of `admin.roles`) are exempt for project keys, since they can
   already do the same through templates. **Nobody may grant an account-scope critical key they
   do not hold.** The project-scope admin keys `admin.access.manage` and `admin.access.view` are
   governed by `admin.access.appoint` instead (§11.1): its holders may grant or remove them on
   any project without holding them, which is how an account admin appoints a project admin.
2. **No self-edit.** No one edits their own row, overrides or assignments. An account admin
   editing a set they themselves hold gets a warning, must give a reason, and may not add critical
   keys to it.
3. **Rank protection.** A project admin cannot edit rows of people who hold `admin.access.manage`
   on P or any account admin key. Only account admins can.
4. **Last admin.** Reject any change that would leave no active user holding both `admin.roles`
   and `admin.access.appoint`. Compute this by simulating the change set through
   `computeEffective`. A project left with no `admin.access.manage` holder is a **warning** only;
   account admins can always step in.
5. **Reason.** Any change that grants a sensitive or critical key, whether by override, set edit
   or assignment, requires `reason.trim().length >= 10`. Revoking a critical key also requires a
   reason.
6. **Concurrency.** Saves carry `Project.accessVersion` or `Role.version`. A mismatch returns
   `conflict()` with "Someone else changed access on this project — reload to see their changes".

### 11.3 Separation-of-duties rules (`sod.ts`)

Each rule is evaluated on every affected person's **resulting** effective set, and on edited sets.

| id | Condition | Severity |
|---|---|---|
| `job.two_party` | any of {`job.issue_quote`, `job.countersign`, `job.progress`, `job.complete`} **and** any of {`job.accept`, `job.works_accept`, `job.deficiency`} | **block** |
| `co.yard_vs_owner` | `change_order.approve.yard` **and** any of {captain, owners_rep, finance, tech_manager} stages | **block** |
| `co.chain_majority` | ≥ 3 of {captain, owners_rep, yard, finance, tech_manager} stages | **block** |
| `co.two_stages` | ≥ 2 of the 7 stages (the runtime rule in G2.2 stops one user deciding two stages of the same CO) | warn |
| `fin.budget_vs_approve` | `financial.budget.edit` **and** `financial.approve` | warn |
| `po.raise_vs_approve` | `purchase_order.manage` **and** `purchase_order.approve` | **block** |
| `billing.invoice_vs_payment` | `yard_invoice.manage` **and** `payment.record` | **block** |
| `drawing.upload_vs_approve` | `drawing.upload` **and** `drawing.approve` (runtime: nobody approves their own upload) | warn |

### 11.4 Category ceilings

The ceilings of every category among a person's winning sets apply.

| Category | Blocked | Warned |
|---|---|---|
| AUDIT | any key of kind write, decide or admin | — |
| EXTERNAL | admin-kind keys, critical keys | sensitive keys |
| REGULATOR | admin-kind keys, `job.accept`, `job.countersign` | money keys (`*.price.view`, `*.cost.view`, financial, billing) |
| YARD | owner-side CO stages (captain, owners_rep, finance, tech_manager), `financial.approve`, `document.view.confidential` | — |

Blocks prevent the save. Warnings require an acknowledgement checkbox plus the reason.

---

## 12. UI: Users & Access (`/admin/access`)

### 12.1 Route, gate and URL state

- **Route:** `src/app/(app)/admin/access/page.tsx` (server component), gated per §11.1.
- **URL state:** `?tab=people|admins|sets&vessel=&project=&view=matrix|list&sort=rank|name&group=dept|set|none&filter=&dept=&open=job,change_order&planned=1&focus=<userId>`.
  Every control round-trips through the URL, so views are linkable and survive reload.
- **Sidebar:** add "Users & access" under System. `/admin` keeps the user directory (gated by
  `admin.users`) and the audit log (gated by `audit.view` / `audit.view.all`).
- **Page width:** the page opts out of `max-w-[1400px]`. The matrix scrolls inside its own
  container; the page never scrolls sideways.

### 12.2 Tabs

The reference's "Vessel Crew | Account Admins | Access Sets" becomes **People | Admins |
Access sets**, because rows here include crew, owner's team, yard, regulators and external
parties.

### 12.3 Toolbar

- Title **Users & Access**, subtitle *Manage access sets, project access and permissions*.
- **Find person:** searches everyone on the projects the editor administers, via server action
  `searchPeople(q)`. It never returns people outside the editor's scope. Picking a result scrolls
  to their row and highlights it, switching project if needed.
- **Vessel → Project** selects list only projects the editor can administer. The default is the
  active project.
- **List | Matrix** toggle; **Sort:** Rank (the winning set's `sortOrder`, then job title, then
  name) or Name; **Group by:** Department (default), Access set, or None.
- **Show planned modules** toggle (off by default).

### 12.4 Filter chips (live counts, including pending changes)

Defined once in `src/lib/permissions/filters.ts`:

| Chip | Rule |
|---|---|
| All (n) | — |
| Custom only | row has an active, non-redundant override |
| Sees financials | `financial.view` |
| Sees prices | `job.price.view` or `change_order.cost.view` or `crew_request.cost.view` |
| Can approve COs | any `change_order.approve.*` |
| Signs quotes | `job.accept` |
| Confidential docs | `document.view.confidential` |
| Admin access | `admin.access.manage` or any account key |
| External parties | a winning set in the EXTERNAL category |
| Pending changes | row has staged changes |
| SoD issues | row has a block or warn SoD problem |

Add a **Department** dropdown with per-department counts. It replaces a dozen department chips.

Caption: *"{n} people on {project code} · {vessel}. Click a cell to toggle. Nothing saves until you
press Review & save. Module access levels are shown in List view."*

### 12.5 Matrix view

```
┌ People ───────────────┬ Preset ─────────────┬─ Quotes & jobs ───────────────────────┬─ Change orders ▸ ─┬─ Crew requests ▸ ─┐
│                       │                     │ Access          │ Requests │ Yard…  │   (collapsed)     │   (collapsed)     │
│                       │                     │ See  Prices Exp │ Req  Cmt │ …      │                   │                   │
├───────────────────────┼─────────────────────┼─────────────────┼──────────┼────────┼───────────────────┼───────────────────┤
│ ▾ BRIDGE (3)          │                     │ [◩]  [◩]   [ ]  │ [■] [■]  │        │                   │                   │
│ Ali Benarabi          │ Captain             │ [✓]  [✓]•  [ ]  │ [✓] [✓]  │        │  M · 9/16         │  M · 7/10         │
│ Captain               │                     │                 │          │        │                   │                   │
│ Simon Jordan          │ Captain · Custom 2  │ [✓]  [✓]   [+]  │ [✓] [✓]  │        │  C · 6/16         │  M                │
├───────────────────────┼─────────────────────┼─────────────────┼──────────┼────────┼───────────────────┼───────────────────┤
│ ▾ ENGINEERING (5)     │ …                                                                                               │
```

- **Structure.** `role="grid"` inside its own scroll container.
- **Sticky left columns:**
  - **Person:** name, job title, a department dot, and an External badge.
  - **Preset:** set badge plus a Custom count, and a select to change this person's access set on
    this project (staged).
- **Two-tier sticky header:**
  - A **module band**, with subcategory group labels beneath it.
  - **Short capability labels**; the full label is in a tooltip and the `aria-label`.
- **Modules are collapsed by default.** A collapsed module shows one summary cell per row: the
  level letter (or **C** for custom) and a count such as `9/16`. Clicking the band expands it,
  and expanded modules persist in `?open=`. This is required, not optional: 112 columns do not fit
  on screen, whereas the reference had 17.
- **Planned modules** are hidden unless `planned=1`. When shown, their columns are hatched and
  labelled *Not yet built*, and pre-granting is allowed.
- **Sensitivity colours:** sensitive headers use `text-warn` with a `border-warn/40` underline;
  critical headers use `text-bad`. A legend sits under the caption.
- **Row groups** are ordered as in §7. Each group header row has a collapse control and a
  **tri-state checkbox per visible column**, which toggles that key for the group's *editable*
  members only.
- **Bulk menus:**
  - Column header: *Grant to all visible* / *Revoke from all visible*.
  - Row: *Set module level…*, *Copy from person…*, *Copy access from project…*, *Reset to access
    set*, *Apply to all projects on this vessel…*, *History*.

### 12.6 Cell states

One pure `cellState()` drives both the visuals and the ARIA.

| # | State | Visual | Click / Space |
|---|---|---|---|
| 1 | Granted by access set | `bg-accent/80` + check | stage DENY |
| 2 | Granted by override | `bg-marine` + check + corner dot | stage INHERIT (back to the set's value) |
| 3 | Denied by override | `border-bad/60 bg-bad/15` + × | stage INHERIT |
| 4 | Implied (locked on by a dependency) | `bg-accent/30` + check, lock on hover | popover: "Deny *See jobs*? This also removes 4 dependent permissions: …" |
| 5 | Off because a prerequisite is denied | dim + tooltip naming the prerequisite | none |
| 6 | Not editable by you (escalation / self / rank) | `opacity-40 cursor-not-allowed`, tooltip with the reason, never naming keys the editor lacks | none |
| 7 | Planned module | hatched background, still toggleable | as 1–3 |
| 8 | Pending | `ring-1 ring-warn` | toggles back (removes the pending entry) |
| 9 | SoD conflict | `ring-1 ring-bad` on the conflicting cells, plus an icon on the row | as underlying |

**Enter** on a cell opens the **provenance popover**, e.g. "From *Captain*", "Implied by *Sign
quotes*", or "Granted by Pat Manager, 25 Sep — *Covering Ch/Off*". It includes an optional
**Grant until…** date for expiring overrides.

### 12.7 Staging and Review & save

- **Staging.** Pending changes live in a `useReducer` defined in
  `src/lib/permissions/matrixState.ts` (pure, tested). A change is `{ userId, key, value: boolean,
  expiresAt? }`; toggling back removes the entry.
- **Guards on leaving.** A `beforeunload` prompt fires while changes are pending, and changing
  project asks for confirmation.
- **Review & save dialog.** Built on a new `src/components/ui/Dialog.tsx`: native `<dialog>`,
  focus trap, Esc to close, focus returned to the trigger. It shows:
  - changes **grouped by person** (+ / −), including implied side effects ("also grants *See
    change orders*");
  - a **Sensitive** or **Critical** badge on each change that needs one;
  - SoD and ceiling **blocks**, which disable Save, and **warnings**, each with an acknowledgement
    checkbox;
  - a **Reason** field, required when §11.2(5) applies;
  - **Also apply to other projects on {vessel} ({n})**, with a per-project preview count.
- **Save result.** The server returns a typed `SaveResult` (§12.14). A rejection is shown inline
  and pending state is kept, so nothing is lost.

### 12.8 List view

- Rows are people and columns are modules.
- Each cell is a level `<select>` (None / View / Contribute / Manage / Full, plus a read-only
  **Custom**), with chips for authority keys held ("Captain stage", "Signs quotes").
- Changing a level stages that module's ladder keys (§5.4) and leaves authority keys alone.
- It uses the same staging, filters and Review & save as the matrix.

### 12.9 Access sets tab

- The same grid, **transposed**: rows are access sets grouped by category, with badges
  *System*, *System · customised* or *Custom*.
- **Actions:** New (clone from…), rename / badge / description / category, reorder rank, archive
  (only with zero assignments), and **Reset to default** (system sets only).
- **Mandatory impact preview before save:** "Affects 14 people on 3 projects", plus any new SoD
  violations for people currently assigned. Saving goes through the same Review dialog.

### 12.10 Admins tab

- **Account admins** (visible to `admin.access.appoint` holders only): assign or remove the
  ACCOUNT_ADMIN set. Last-admin protection applies.
- **Project admins per vessel → project:** `holdersOf(admin.access.manage)`, showing *From access
  set* or *Appointed by X on date*. Actions: **Appoint** (pick someone on the project) and
  **Remove**, both with a reason.

### 12.11 Accessibility

- **Keyboard:** roving tabindex; arrow keys, Home/End and Ctrl+Home/End move; **Space** toggles;
  **Enter** opens the popover; **Esc** closes it.
- **Cells:** each is `<button role="checkbox" aria-checked aria-disabled aria-labelledby="{rowHeaderId}
  {colHeaderId}" aria-describedby="{stateDescId}">`, using **9 shared hidden description nodes**
  (one per state) rather than thousands of label strings.
- **Group rows** expose `aria-expanded`; the tri-state checkboxes use `aria-checked="mixed"`.
- **Colour is never the only signal:** each state also has an icon or pattern. Don't rely on
  `faint` text (G5.1).

### 12.12 Performance (target: 100 people × 112 keys)

- **Compact payload.** The server sends per row the template key indices, the overrides with
  their metadata, and an **editable bitstring**, about 12 KB in total. The client recomputes
  effective state with the **same** `computeEffective` the server uses.
- **Rendering.** `MatrixRow` is wrapped in `React.memo` and keyed on the row's pending version, so
  a toggle re-renders one row. One delegated tooltip/popover serves the whole grid, and
  collapsed-by-default modules keep a typical render to 25–40 columns.
- **Budget:** under 100 ms per toggle on the 100-person bulk seed (A15). No virtualisation.

### 12.13 Security of the client bundle

- Client components **never import `catalog.ts` data**. The server passes a `CatalogView` prop
  (labels, groups, ids) only to authorised admins; client code imports only pure functions.
- The sidebar receives visible **module ids**, never keys.
- A static test enforces both (§14.2 f).

### 12.14 Component and action inventory

**Server components:** `admin/access/page.tsx`, `AdminsPanel.tsx`.

**Client components** (in `src/components/access/`):
`AccessToolbar`, `FilterChips`, `PermissionMatrix` (`mode="people" | "sets"`), `MatrixHeader`,
`MatrixRow`, `CellPopover`, `ReviewDialog`, `LevelListView`, `AccessSetsEditor`, `PeopleSearch`.

**Server actions** in `src/app/(app)/admin/access/actions.ts`, with schemas in `schemas.ts`:

```ts
const Key = z.enum(ALL_KEYS as [PermissionKey, ...PermissionKey[]]);
export const SaveProjectAccess = z.object({
  projectId: z.string().min(1),
  baseVersion: z.number().int().min(0),
  cells: z.array(z.object({
    userId: z.string().min(1), key: Key, value: z.boolean(),
    expiresAt: z.coerce.date().optional(),
  })).max(5000),
  presets: z.array(z.object({ userId: z.string(), roleId: z.string() })).max(500).default([]),
  reason: z.string().trim().max(500).optional(),
  acknowledged: z.array(z.string()).default([]),          // "<ruleId>:<userId>"
  applyToVesselProjects: z.boolean().default(false),
});

type SaveResult =
  | { ok: true; applied: number; version: number; skipped: Problem[] }
  | { ok: false; code: "conflict" | "forbidden" | "sod" | "reason" | "invalid"; problems: Problem[] };

saveProjectAccess(input): Promise<SaveResult>    // server normalises value → GRANT | DENY | INHERIT against the current template
copyAccessFromProject({ userIds, fromProjectId })   // returns cells to stage; needs admin.access.view on the source
applyAccessToVessel({ userIds, sourceProjectId, reason })
addPersonToProject({ userId, projectId, roleId, departmentId, jobTitle })
removePersonFromProject({ userId, projectId, reason })
setPersonDepartment({ userId, projectId?, departmentId })
saveAccessSets({ changes: { roleId, key, value }[], baseVersions: Record<string, number>, reason, acknowledged })
createAccessSet({ name, badge, category, description, cloneFromRoleId })
archiveAccessSet / resetAccessSetToDefault / reorderAccessSets
appointProjectAdmin / removeProjectAdmin / setAccountAdmin
searchPeople(q)
```

**Every write:**
- Re-runs `validateChangeSet` on the server against fresh data.
- Is one `prisma.$transaction`.
- Bumps `Project.accessVersion` or `Role.version`, and stamps `customisedAt` on a system set's
  first edit.
- Records `recordAudit({ action: "ACCESS_CHANGE", resource: "ProjectAccess" | "AccessSet",
  resourceId, details: { batchId, projectId, reason, userIds: [...], changes: [{ userId, key,
  from, to }], sodWarnings } })`. The top-level `userIds` makes per-person history queryable with
  a JSON `array_contains` filter; the row menu's *History* uses it.

---

## 13. Enforcement across every module

1. **Sidebar (D13).** `NAV` entries gain a `moduleId`. The layout computes visible module ids on
   the server and passes **ids only** to `Sidebar.tsx`. Scaffold entries stay, per G3.11, but only
   for users holding their view key. Approvals is visible per §5.5 (6).
2. **List pages.** Check the module's `viewKey` on the active project.
3. **Detail pages.** Load the record, then `forProject(user, record.projectId)`, then
   `notFound()` if the user lacks view.
4. **Actions.** Load the record, then `assertPermissionOn(user, key, record.projectId)`. This
   reorders the D4 sites. Creates use the **active** project and never a submitted `projectId`.
   `applyTransition` (G1.3) takes `permission` and calls `assertPermissionOn`.
5. **Comments (D11).** Gate on `change_order.comment` / `crew_request.comment`, after checking
   that the parent record exists and is on a reachable project.
6. **Exports and print (D7, D8).** Require `job.export` / `change_order.export` plus view. Show
   money columns when the user holds `job.price.view` / `change_order.cost.view`, **not**
   `financial.view`. Result: the yard's own export has prices; an HOD's does not.
7. **Money redaction (D6).** `money.ts` provides `canSeeMoney(perms, moduleId)`. Apply it to:
   - **Jobs:** list group and grand totals, detail lines and total, VC price adjustment, accept
     page copy, quote page, print.
   - **Change orders:** list cost column, detail estimated and approved cost, print.
   - **Approvals:** the cost column.
   - **Crew requests:** detail cost impact (`crew-requests/[id]/page.tsx:109`).
   - **Dashboard:** budget panels and charts.
   - **Scaffold modules:** logistics cost, inventory replacement cost, contractor value and risk
     cost impact are gated by `financial.view`.

   Redacted values render as "—" with sr-only "hidden".
8. **Suppliers (D9):** `supplier.view` on the page and in the search branch.
9. **Admin and audit (D10).**
   - `/admin` splits into the user directory (`admin.users`) and the audit log (`audit.view`
     scoped to the active project; `audit.view.all` for fleet-wide).
   - `recordAudit` gains `projectId`.
   - The dashboard's Recent activity is filtered to the active project **and** by a
     resource → module view-key map.
10. **Approvals page (D5).** Import `CO_STAGE_PERMISSION`, delete the local `STAGE_PERM`, remove
    both `as any`, scope to the active project, and show the full queue only with
    `approvals.view`.
11. **Crew requests (with G2.4).** Use an exhaustive `Record<CrewRequestStatus, PermissionKey>`
    that the type checker verifies. Transitions into IN_PROGRESS, BLOCKED, AWAITING_APPROVAL,
    SUBSTITUTION and VARIATION use `crew_request.progress`. The assignee may progress their own
    request.

---

## 14. Tests

### 14.1 Unit (Vitest, pure modules only)

| File | Asserts |
|---|---|
| `tests/permissionCatalog.test.ts` | groups partition `ALL_KEYS`; counts from §5.6; implications acyclic; cross-module edges ⊆ allowlist; `short` ≤ 16 chars; money keys ≥ sensitive; every `access`-module key except `admin.access.view` is critical, plus `audit.view.all`; account keys ⊆ the §5.6 list; every module with a nav entry has a `viewKey` |
| `tests/permissionDefaults.test.ts` | the existing `tests/rbac.test.ts` SoD assertions, migrated; every system set passes block rules and ceilings; ACCOUNT_ADMIN's closure contains no project-scope key; the V1 − V0 diff equals the §6.2 table exactly (against `tests/fixtures/matrixV0.ts`); D-4 holders of `job.price.view` after closure |
| `tests/permissionResolver.test.ts` | all eight §8.3 examples, plus inactive user, reserved-key pass-through and provenance |
| `tests/accessAuthority.test.ts` | no escalation (grant **and** revoke), critical-key rule, self-edit, rank, last admin (via simulation), reason length, block vs warn with acknowledgement, concurrency code |
| `tests/permissionSync.test.ts` | idempotency; customised sets survive; additive migrations; key retirement cascades; reset to default |
| `tests/matrixState.test.ts` | toggle and untoggle; implied-cell deny cascade; normalisation to INHERIT; level set/clear leaves authority keys; diff grouping for the review dialog |
| `tests/rbac.test.ts` | unchanged; must keep passing through the deprecated `ROLE_PERMISSIONS` |

### 14.2 Static coverage test (`tests/permissionCoverage.test.ts`)

This test scans `src/` as text. Keep the scan simple: regex over file contents.

- **(a)** Every `enforced: true` key is referenced outside `src/lib/permissions/` and `rbac.ts`.
- **(b)** Every `enforced: false` key is **not** referenced outside them, so shipping a guard
  forces flipping the flag.
- **(c)** No `as any` and no string literal as the key argument of `hasPermission`,
  `assertPermission`, `assertPermissionOn` or `canOn`.
- **(d)** Every `page.tsx` under `src/app/(app)/` contains a guard call. Allowlist: `dashboard`,
  `notifications`, `search`. Every exported async function in a `"use server"` file contains a
  guard. Allowlist: `logout`, `setActiveProjectAction`.
- **(e)** No `permissions: { some: { permission:` under `src/app/`. This locks in D3.
- **(f)** No `"use client"` file imports from `permissions/catalog` or `permissions/defaults`.

### 14.3 End-to-end (Playwright, `e2e/access.spec.ts`)

1. **PM grant flow.** A PM grants a crew member `supplier.view` on p1, reviews and saves. The crew
   member now sees Suppliers in the sidebar on p1 and not on p2.
2. **No escalation.** A PM sees a disabled cell for a key they lack; posting the action directly
   is refused.
3. **Reason required.** A sensitive grant without a reason is refused and the pending state is
   kept.
4. **SoD block.** Granting `job.accept` to a Yard PM shows a block and Save is disabled.
5. **Forbidden page.** Crew get Forbidden on `/admin/access`.
6. **Template edit and reset.** The owner edits an access set, sees the impact preview and saves;
   then resets to default. Both appear in the audit log.
7. **D1 regression.** The CAPTAIN-on-p1 / CREW-on-p2 user sees approval controls on p1 and not on
   p2.
8. **Money.** An HOD sees "—" for job totals; the Yard PM's export contains prices.

Each test restores what it changed in `afterEach`, using a Prisma helper in `e2e/helpers/db.ts`.
This avoids the re-run failures logged in `audit/findings-phase5.md`.

---

## 15. Phased delivery inside ACTION_PLAN

Tick items here as they land. Each item is one commit and must pass build, typecheck and the unit
suite, plus e2e where it touches UI or guards.

### P.0 — Docs only

- [ ] Log D1, D2, D3, D4, D6/D7 (as one money-model finding), D10 and D14 in
  `audit/findings-phase5.md`.
- [ ] Amend `ACTION_PLAN.md`:
  - insert G1.4–G1.10, G2.9–G2.16 and **Gate A** as below;
  - amend G1.2, G1.3, G2.1 and G2.4 as below;
  - strike **G6.9** (subsumed by G1.5 / G1.7), with the reason;
  - reframe the **G6.7** permission clause: the 14 unenforced keys become `enforced: false`
    reserved keys, not deletions;
  - note that G4.3 is folded into G1.9.

### Gate 1 extension (foundations)

G1.4–G1.8 are pure or schema-only and may run in parallel with Gate 2 once G1.3 has landed.

| Item | Scope | Done when |
|---|---|---|
| **G1.2** (amended) | Also ship interim `forProject` / `canOn` / `assertPermissionOn` (§10) | tests: zero-project, vessel-scoped, unscoped; unreachable project is refused even when the key is held |
| **G1.3** (amended) | `applyTransition` calls `assertPermissionOn(actor, perm, entity.projectId)` | as planned, plus that call |
| **G1.4** | `keys.ts`, `catalog.ts`, `rbac.ts` façade; +57 keys, −`export`; `enforced` reflects today | typecheck passes with **zero** call-site edits; catalog tests green |
| **G1.5** | `defaults.ts` (20 sets incl. ACCOUNT_ADMIN), `sod.ts`, `ROLE_PERMISSIONS` derived; `ROLE_KEYS` + `ROLE_CATEGORIES` + `DEPARTMENT_LABELS` | defaults tests green; V0 diff test green; existing `rbac.test.ts` green |
| **G1.6** | Migration `access_matrix` (§7) | `prisma migrate deploy` is clean on a fresh **and** a seeded database |
| **G1.7** | `sync.ts`; the seed uses it; fixtures (§9) | seeding twice gives 0 `RolePermission` writes on the second run; sync tests green; `npm run qa` checks that a customised set survives the seed |
| **G1.8** | `policy.ts` | resolver tests green, including the D1 regression |
| **G1.9** | `resolver.ts`, `guards.ts` (real implementation), `session.ts`; `getCurrentUser` project-aware; `listProjectsForUser` honours `project.access`; TopBar shows presets | D1 e2e green; every existing e2e green |
| **G1.10** | `holdersOf`, replacing the five D3 queries | coverage rule (e) passes; jobs e2e green |

### Gate 2 extension (enforcement)

G2.1 is **amended** to adopt `forProject` / `assertPermissionOn` at each of its 14 sites and to
fix the D4 ordering. G2.4 is **amended** per §13 (11).

| Item | Scope | Done when |
|---|---|---|
| **G2.9** | Sidebar filtering (§13.1) | a supplier sees only Documents plus the structural entries |
| **G2.10** | `supplier.view` on the page and search (D9) | guest and supplier get Forbidden |
| **G2.11** | CO and crew-request comment permissions, with parent and project checks (D11) | a comment on another project's record is refused |
| **G2.12** | Per-module export keys; money in exports by price keys (D7, D8) | the Yard PM's export includes prices; an HOD's does not |
| **G2.13** | Money redaction on every page listed in §13.7 (D6) | an HOD sees "—" on job totals |
| **G2.14** | `recordAudit` gains `projectId`; `/admin` split; dashboard activity filtered (D10) | a crew dashboard shows no rows they cannot view |
| **G2.15** | Approvals page fix (D5) | no `as any`; scoped to the active project |
| **G2.16** | Static coverage test (§14.2); `enforced` flags final | deleting any guard makes it fail |

### Gate A — the Users & Access feature

Gate A comes after Gate 2. It may run alongside Gate 3 if migrations are serialised.

| Item | Scope | Done when |
|---|---|---|
| **A1** | `authority.ts` | authority tests green |
| **A2** | `loadProjectMatrix`, `CatalogView` serialiser | payload is ≤ 15 KB for the bulk seed |
| **A3** | Project-access actions, schemas, audit and concurrency | action-level tests via the pure validator; a conflict path is exercised |
| **A4** | Access-set actions, including reset and the impact preview | audit rows are written; the customised flag is set |
| **A5** | Admins actions (appoint, remove, account admin) | last-admin protection holds |
| **A6** | Page shell, tabs, toolbar, URL state, `Dialog` component | the page renders for PM, owner and auditor; crew are Forbidden |
| **A7** | `matrixState` reducer | reducer tests green |
| **A8** | Read-only grid: headers, sticky columns, collapse, groups, states, provenance | keyboard navigation works end to end |
| **A9** | Editing, bulk menus, group tri-state, `beforeunload` | edits are staged, not saved |
| **A10** | Review & save dialog | e2e 1, 3, 4 |
| **A11** | Filter chips and the department filter | counts match the server |
| **A12** | List view | a level change stages the ladder keys only |
| **A13** | Access sets tab | e2e 6 |
| **A14** | Admins tab | appoint/remove is audited |
| **A15** | Full e2e suite (§14.3) plus a performance check on `SEED_BULK_PEOPLE=100` | < 100 ms per toggle; e2e green twice in a row on the same database |
| **A16** | Docs: README section, §16 in the `catalog.ts` header, CLAUDE.md entry (with G6.5) | reviewed |

---

## 16. Definition of done for any future module

No module ships (including each Bridge phase) until:

1. Its keys are in `keys.ts` and `catalog.ts`, with accurate `module`, group, level, tier, kind,
   scope and `enforced`.
2. Its `ModuleDef` has the right `status` and `nav`; reserved keys flip to enforced as their
   guards land.
3. The defaults are updated with a `DEFAULTS_VERSION` bump and an **additive**
   `DEFAULTS_MIGRATIONS` entry, with a note that pre-granted reserved keys now take effect.
4. The SoD rules and category ceilings have been reviewed for the new authority keys.
5. The static coverage test passes; every page and action is guarded, and money goes through
   `money.ts`.

Put this checklist verbatim in the header comment of `catalog.ts`.

---

## 17. Known limitations and risks

- **Global directories.** Contractor and Supplier have no `projectId`, so their keys are
  evaluated on the active project. Document this until those models gain a project link.
- **Drift across projects.** Per-project overrides will diverge on the same vessel. A
  "differs from other projects on this vessel" row indicator is a follow-up after A11.
- **Template edits are fleet-wide,** hence the mandatory impact preview (§12.9).
- **Pre-granted reserved keys switch on silently** when their module ships. Call them out in the
  `DEFAULTS_MIGRATIONS` note and the release notes.
- **Specificity shadowing (D-5)** surprises people who expect a union. The provenance popover and
  the Preset column must make the winning assignment obvious.
- **Notifications leak titles after access is revoked.** Existing notification rows keep record
  titles; filtering needs `projectId` on `Notification`, which belongs with Bridge Phase 3.
- **React `cache` versus Vitest, and Gate 8 (Next 16).** Keep impure code out of anything tests
  import; the async request APIs in Next 16 will touch `session.ts` and `resolver.ts`.
- **Behaviour change from D-4:** some senior crew lose sight of job prices. Communicate it before
  release; admins can grant it back per person in one click.

---

## 18. Final acceptance checklist

- [ ] Every one of the 112 keys is in the catalog, in exactly one module group, with complete metadata.
- [ ] The seed never clobbers an admin edit; a second seed makes zero writes.
- [ ] Effective permissions honour assignment scope; the D1 regression is covered by unit and e2e tests.
- [ ] No permission-holder lookup bypasses `holdersOf`.
- [ ] Every page, action, export and money figure is guarded; the static coverage test enforces it.
- [ ] A PM can adjust access for people on their project, and cannot escalate or edit themselves.
- [ ] An account admin can edit, clone, archive and reset access sets, and appoint project admins.
- [ ] Sensitive and critical grants require a reason; every change is audited with a diff.
- [ ] SoD blocks cannot be saved; warnings need an acknowledgement.
- [ ] The matrix meets the keyboard, ARIA and performance targets in §12.11–12.12.
- [ ] `npm run build`, `npm run typecheck`, `npm test` and `npm run test:e2e` pass twice in a row
  on the same database.
