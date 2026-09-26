# Findings — notifications & permission-matrix cross-reference

Scope: this file records what a full read of `src/lib/rbac.ts` plus a whole-tree grep for every
`hasPermission`/`assertPermission` call site and every hand-rolled DB `RolePermission`
traversal turned up, beyond what `audit/findings-dead-code.md`'s RBAC finding and
`audit/findings-auth-security.md`'s `admin.users` finding already cover. `admin.users`,
`admin.roles` and `admin.settings` are **not** re-logged here — both files already carry them
in full. Companion documents: `NOTIFICATION_MAP.md` and `PERMISSION_MATRIX.md` (repo root)
carry the full call-site table and the full 19×56 grant matrix respectively.

Counts — Medium: 2 · Low: 1 (3 total)

---

### [RBAC] — Twelve non-admin permission keys are granted to real roles but never checked anywhere in application code
Severity: Medium
Location: grants in `src/lib/rbac.ts` — `FIN_EDIT_BUDGET` (:28, granted :116, :180),
`FIN_APPROVE` (:29, granted :99, :180), `SCH_EDIT` (:32, granted :100, :117, :171), `LOG_EDIT`
(:35, granted :101, :118, :153, :171), `INV_EDIT` (:38, granted :119, :134, :142, :148, :160),
`DRW_UPLOAD` (:41, granted :120), `DRW_APPROVE` (:42, granted :102, :186), `DOC_UPLOAD` (:45,
granted :103, :121, :154), `CON_EDIT` (:49, granted :104, :122, :172), `MTG_EDIT` (:52, granted
:105, :123, :136, :160), `RSK_EDIT` (:55, granted :106, :124, :136, :187), `EXPORT` (:76,
granted :89, :107, :125, :181). No enforcement point anywhere: repo-wide grep for
`PERMISSIONS.<key>` outside `rbac.ts` returns zero hits for all twelve.
Found by: this pass (cross-referencing `audit/findings-dead-code.md`'s "fourteen permission
keys are never enforced" against `src/lib/rbac.ts`'s grants)

Description:
`audit/findings-dead-code.md` already names all fourteen unenforced keys as a set; this pass
re-derives the same list independently by grep (confirming the count still holds at 14, not
recounting from a different method) and separates it into two distinct shapes. These twelve are
the "textbook" dead grant the task defines: each is assigned to at least one role in
`ROLE_PERMISSIONS`, so a maintainer reading the matrix reasonably concludes the corresponding
action is gated, but no `hasPermission`/`assertPermission` call, and no hand-rolled DB
permission traversal, ever tests any of them. (`ADM_ROLES` and `ADM_SETTINGS`, the other two of
the fourteen, are granted to **zero** roles as well as unchecked — a stricter case, logged
separately below since it is not "granted but unenforced" but "declared, ungranted and
unenforced".)

Ten of the twelve line up exactly with the ten list-only scaffold modules `SITE_MAP.md` and
`audit/findings-dead-code.md`'s `[ROUTES]` finding already identify as having "zero write paths
anywhere in `src/`": `SCH_EDIT`/schedule, `LOG_EDIT`/logistics, `INV_EDIT`/inventory,
`DRW_UPLOAD`+`DRW_APPROVE`/drawings, `DOC_UPLOAD`/documents, `CON_EDIT`/contractors,
`MTG_EDIT`/meetings, `RSK_EDIT`/risks — each key is the edit/upload/approve half of a module
whose view half (`SCH_VIEW`, `LOG_VIEW`, etc.) *is* enforced, because the list page exists even
though no create/edit form does. `FIN_EDIT_BUDGET`/`FIN_APPROVE` are the same pattern for
financials. `EXPORT` is different in kind: the export routes exist and work, they simply gate
on `CO_VIEW`/`JOB_VIEW` instead of the permission apparently created for them
(`src/app/api/export/change-orders/route.ts:29`, `src/app/api/export/jobs/route.ts:21`).

Impact:
`INV_EDIT` is the widest-held example — five roles (PROJECT_MANAGER, CAPTAIN, CHIEF_ENGINEER,
CHIEF_OFFICER, HOD) are told by the matrix they can edit inventory; none of them can, because no
inventory write path exists at all. A maintainer building the first edit form for any of these
ten scaffold modules will reasonably assume the permission is already wired in (it has a key, a
role assignment, and a plausible name) and skip adding the guard — the same failure mode
`audit/findings-dead-code.md` already calls out for this list as a whole. This pass adds the
precise role/line evidence so that fix work can grant-check module by module rather than
re-deriving it.

Suggested fix:
No change needed until each scaffold module gets its first write path — at that point, wire the
already-declared key in with `assertPermission` rather than inventing a new one. For `EXPORT`
specifically, either switch the two export routes to check it (and decide whether `CO_VIEW`/
`JOB_VIEW` holders without `EXPORT` should lose export access, which would be a behaviour
change for GUEST/CONTRACTOR/etc.), or delete the key and document exports as gated on the
resource's own view permission.

---

### [RBAC] — `admin.roles` and `admin.settings` are granted to no role and checked nowhere — stricter than a dead grant
Severity: Low
Location: `src/lib/rbac.ts:73` (`ADM_ROLES: "admin.roles"`), `:74` (`ADM_SETTINGS:
"admin.settings"`); zero appearances of either identifier anywhere in `src/` outside their own
declaration (confirmed by grep); zero rows in any `ROLE_PERMISSIONS` array (confirmed by
reading all 19 roles in `src/lib/rbac.ts:82-198`)
Found by: this pass

Description:
Distinct from the twelve keys above (which are at least assigned to a role) and distinct from
`ADM_USERS` (which is at least checked, just unreachable — `audit/findings-auth-security.md`).
`ADM_ROLES` and `ADM_SETTINGS` fail on both axes simultaneously: no role in the 19-role matrix
holds either, and no `hasPermission`/`assertPermission` call or DB traversal anywhere in `src/`
ever tests either. They are pure declarations with no live effect of any kind, positive or
negative. This corroborates `SITE_MAP.md`'s "`admin.users`, `admin.roles` and `admin.settings`
permissions exist but are granted to no role" for two of the three by name, and adds the
enforcement-side half: unlike `admin.users`, these two aren't even wired into a broken guard —
there is no admin-roles or admin-settings screen for them to gate. (`Setting`, the underlying
Prisma model, is separately dead — `audit/findings-dead-code.md` "Four Prisma models are never
read or written anywhere in the application" — so the permission and the feature it would guard
are both entirely unbuilt, not merely unwired.)

Impact:
Cosmetic on its own — nothing currently depends on either key — but it means role/permission
management and application settings have **no** access-control surface at all, not even a
broken one, in a platform whose `AUDIT_REPORT.md` already flags user administration as
impossible through the application (no create-user or assign-role action exists anywhere).
When that functionality is eventually built, these two keys are the ones to wire in rather than
inventing new ones, and whichever role becomes the platform administrator needs one of them
added to `ROLE_PERMISSIONS` for the first time.

Suggested fix:
Leave the keys declared for the eventual admin UI (`ACTION_PLAN.md` **G6.9** already tracks
granting `admin.users`/`admin.roles`/`admin.settings` to a role, or deleting them); do not build
a guard around either without first deciding which role is "platform administrator" and adding
it to `ROLE_PERMISSIONS`.

---

### [GAP] — No per-user notification preferences exist; The Bridge's reference feature is entirely unbuilt
Severity: Low
Location: absent throughout — no matching Prisma model in `prisma/schema.prisma` (46 models,
none preference-shaped), no route under `src/app/` for a profile/settings page, `notify()`
(`src/lib/notifications.ts:17-48`) takes no per-user configuration and every recipient gets
every notification a call site sends them
Found by: this pass, per `BRIDGE_ALIGNMENT_PLAN.md` §1.1 (row 32) and §1.7 ("Notification
settings (profile)": channel choice Email/SMS, event-type filters, a schedule window, a
frequency control, per-project on/off)

Description:
This is a **missing capability, not a defect** — logged for completeness of this pass's scope,
not as something that regressed. `BRIDGE_ALIGNMENT_PLAN.md` §2 already scores it "Missing" in
its own gap table ("Notification settings | None; `notify()` writes in-app only, SMTP stubbed |
Missing"), and `SITE_MAP.md` places Phases 3+ of that plan out of scope for this audit pass.
This entry exists so the gap has a citable finding alongside the rest of the notifications
review in `NOTIFICATION_MAP.md`, verified by exhaustive search rather than taken on faith:
- No `NotificationSetting`/`NotificationPreference`/similarly-shaped model in the schema.
- No `/profile` or `/settings` route anywhere in `SITE_MAP.md`'s route table or the sidebar
  (`src/components/layout/Sidebar.tsx`).
- `notify()`'s signature (`userIds`, `kind`, `priority?`, `title`, `body?`, `resource?`,
  `resourceId?`) has no field for a recipient's channel choice, quiet hours, digest frequency,
  or per-project mute — every one of the ten call sites catalogued in `NOTIFICATION_MAP.md`
  sends to every resolved recipient unconditionally.

Impact:
None beyond the feature gap itself — there is no broken code to fix. Its practical effect
compounds with the notification-recipient global-scoping finding already on record
(`audit/findings-workflow-logic.md` "Recipient lookups are global, not scoped to the project"):
because there is also no mute/preference layer, a user with no way to reach a project has no
way to stop receiving — or muting — notifications about it either.

Suggested fix:
None for this pass. When Phase 3+ of `BRIDGE_ALIGNMENT_PLAN.md` is scheduled, build the
preference model and thread it through `notify()` before or alongside fixing the global-lookup
scoping finding, since the same per-project dimension solves both.
