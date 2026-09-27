# OceancOS — Notification map

Every notification in the application is created through one helper, `notify()` in
`src/lib/notifications.ts:17-48`. There is no other call site: a repo-wide grep for
`prisma.notification.create`, `.createMany` and `notification.create` finds exactly one
production writer (`src/lib/notifications.ts:27`, inside `notify()`) plus the read-side
`markRead`/`unreadCount` helpers in the same file. Ten call sites invoke `notify()`, all in
server actions.

`notify()` itself:
1. Writes one `Notification` row per `userId` passed in (`prisma.notification.createMany`,
   `src/lib/notifications.ts:27-37`) — this is the in-app channel and is unconditional.
2. If `SMTP_HOST` is set, dynamically imports `src/lib/email.ts` and calls `sendEmailBatch`
   (`src/lib/notifications.ts:39-46`), which re-queries the same `userIds` for `email`/`name`
   and sends one plain-text email per recipient. Failures are swallowed
   (`// fail silent — in-app notifications are the source of truth`).

## Table

| Trigger | Event source (file:line) | Recipients (who, and how resolved) | Channel | Project-scoped? | Notes |
|---|---|---|---|---|---|
| Change order moves to a new status (any transition except the creator's own action) | `transitionChangeOrder`, `src/app/(app)/change-orders/actions.ts:99-107` | The change order's `createdById` (single user, read directly off the record) — skipped if the actor is the creator | In-app always; + email if `SMTP_HOST` set | Y (implicit — the one specific creator, not a lookup) | — |
| Change order enters `UNDER_REVIEW`/`SUBMITTED` — first approval stage becomes pending | `transitionChangeOrder`, `src/app/(app)/change-orders/actions.ts:109-133` | **Global.** `prisma.user.findMany({ active: true, roles: { some: { role: { permissions: { some: { permission: { key: <stage permission> } } } } } } })` at `:117-123` — every active user anywhere in the platform holding that approval-stage permission | In-app + email | **N** | Matches `AUDIT_REPORT.md` T2/workflow-logic `[NOTIFICATIONS] — Recipient lookups are global`: every holder of e.g. `CO_APPROVE_CAPTAIN` is notified of every change order on every vessel, and the link 404s for anyone who can't reach that project |
| Change-order approval chain fully clears (`decideChangeOrderApproval`, all required stages non-`PENDING` and none rejected/more-info) | `decideChangeOrderApproval`, `src/app/(app)/change-orders/actions.ts:198-205` | The change order's `createdById` (single user, from the loaded `approval.changeOrder` relation) | In-app + email | Y (implicit) | Rejection and "more info" branches (`:185-189`) send **no** notification at all — cited in `audit/findings-workflow-logic.md` "CHANGE ORDERS — The approval chain notifies nobody after the first stage, and rejections notify nobody at all" |
| New job/quote request raised by the vessel | `createJobRequest`, `src/app/(app)/jobs/actions.ts:128-143` | **Global.** `prisma.user.findMany({ active: true, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.JOB_ISSUE_QUOTE } } } } } } })` at `:129-135` — every active user platform-wide holding `job.issue_quote` | In-app + email | **N** | Same global-lookup pattern; every yard PM on the platform gets every vessel's new request, title included in the notification |
| Yard issues a priced quote | `issueQuote`, `src/app/(app)/jobs/actions.ts:295-304` | `job.designatedAuthoriserId` (single user, chosen at request time and validated to hold `JOB_ACCEPT`) | In-app + email | Y (implicit) | — |
| Job/quote status transition (`transitionJob` — countersign, complete, cancel, deficiency, etc.) | `transitionJob`, `src/app/(app)/jobs/actions.ts:374-385` | `job.createdById` and `job.designatedAuthoriserId`, de-duplicated, minus the acting user | In-app + email | Y (implicit) | Per `audit/findings-workflow-logic.md`, the yard side is never in this watcher list — `YARD_COMPLETED`/deficiency events never reach anyone at the yard |
| Client completes the acceptance-code ceremony (`confirmAcceptance`) | `confirmAcceptance`, `src/app/(app)/jobs/[id]/accept/actions.ts:233-251` | **Global.** `prisma.user.findMany({ active: true, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.JOB_COUNTERSIGN } } } } } } })` at `:233-243` — every active user platform-wide holding `job.countersign` | In-app + email | **N** | Same global-lookup pattern as the two above |
| Crew request created with an assignee pre-selected | `createCrewRequest`, `src/app/(app)/crew-requests/actions.ts:37-46` | `data.assignedToId` (single user, from the create form) | In-app + email | Y (implicit) | `assignedToId` is client-supplied and not validated against the project (see `audit/findings-auth-security.md` uploads/tenancy findings for the same form-trust pattern elsewhere) |
| Crew request status transition | `transitionCrewRequest`, `src/app/(app)/crew-requests/actions.ts:87-95` | `cr.requestedById` (single user) — skipped if actor is the requester | In-app + email | Y (implicit) | — |
| Crew request (re)assigned | `assignCrewRequest`, `src/app/(app)/crew-requests/actions.ts:116-124` | `assignedToId` from the form (single user) | In-app + email | Y (implicit) | — |

## Channel — confirmed in-app-first, no SMS, no push, no per-user preference

- The only unconditional channel is in-app (`Notification` row). Email is a secondary fan-out
  gated purely on the `SMTP_HOST` env var being set (`src/lib/notifications.ts:39`,
  `src/lib/email.ts:29-31`) — it is not a per-notification or per-user choice, there is no
  opt-in/opt-out, and a failure is swallowed silently. In the seeded dev environment
  `SMTP_HOST` is unset, so every one of the ten call sites above resolves to in-app only, with
  outbound mail (when it does fire) landing in the `.mail/` JSON outbox rather than a real
  SMTP server — consistent with `SITE_MAP.md`'s "the email path is exercised only through a
  file outbox, never a real SMTP server."
- There is **no SMS and no push notification** anywhere in the codebase. No SMS/push
  provider, credential, or dependency exists (`package.json` has no Twilio/push SDK), and no
  code path references either. The channel model is strictly "in-app, plus best-effort email
  when configured."
- This is the same email transport used for password reset (`src/lib/passwordReset.ts` →
  `sendEmail`) and the acceptance-code ceremony (`src/app/(app)/jobs/[id]/accept/actions.ts:100-111`)
  — those two flows call `sendEmail` directly for a single, purpose-built message and are a
  distinct path from `notify()`'s batch fan-out, though both ultimately go through
  `src/lib/email.ts:sendEmail`.
- Comments never notify anyone (no `notify()` call in `addChangeOrderComment`,
  `addCrewRequestComment`, or `addJobComment`), even though `NotifyKind` declares an unused
  `"COMMENT"` kind (`src/lib/notifications.ts:7`) — cited in
  `audit/findings-workflow-logic.md` "NOTIFICATIONS — Comments on jobs, change orders and
  crew requests notify nobody."

## `/notifications` page (`src/app/(app)/notifications/page.tsx`)

- **State model.** No client state at all — it is a server component. On every render it
  loads up to 200 notifications for the current user (`take: 200`, `:28-32`, no pagination
  beyond that cap), computes `unreadIds` from the fetched rows, and **immediately marks them
  all read in the same render** (`:33-34`, `if (unreadIds.length) await markRead(...)`) before
  the page is even returned to the browser. The "unread" badge and dot rendered afterwards
  (`:68-70`, `:87-90`) are stale-by-construction: they reflect the read state *as it was one
  Prisma read ago*, not the read state the row now has in the database.
- **Sort order.** `orderBy: { createdAt: "desc" }` (`:30`) — newest first, no secondary sort,
  no grouping by priority or by resource.
- **"Mark all read" control.** The button (`:45-50`) posts to the `markAllRead` server action
  (`:13-19`), which re-queries for `readAt: null` rows and marks them read. Because the page's
  own render logic (`:33-34`) has already marked every currently-displayed notification as
  read before the button is ever shown, `markAllRead` always finds zero unread rows to update
  — it is a permanent no-op. This is the same dead control already flagged in
  `ACTION_PLAN.md` **G3.7** ("'Mark all read' (a permanent no-op that destroys unread state on
  render)"); this pass confirms the exact mechanism (`:33-34` vs `:13-19`) rather than
  re-deriving the finding.

## Per-user notification preferences / settings — gap, not a defect

`BRIDGE_ALIGNMENT_PLAN.md` describes, for the reference product, a "Profile → Notification
settings" screen (§1.1 row 32, detailed in §1.7): channel choice (Email/SMS), event-type
filters (new comments, quotation status changes), a schedule (start/end time, days of week,
timezone), a frequency control (near-real-time / hourly / daily digest), and a per-project
on/off toggle. `BRIDGE_ALIGNMENT_PLAN.md` §2 itself already scores this as **Missing** in
OceancOS ("Notification settings | None; `notify()` writes in-app only, SMTP stubbed |
Missing").

This pass confirms that scoring by exhaustive search, not just citation:

- No `NotificationSetting`/`NotificationPreference`/similar model exists in
  `prisma/schema.prisma` (46 models total, all enumerated in `SITE_MAP.md`; none is
  notification-preference-shaped).
- No route, page, or component under `src/app/` or `src/components/` mentions
  "notification setting(s)" or "preference(s)" — `/notifications` (above) is a read/mark-read
  inbox only, and there is no `/profile` or `/settings` route in the sidebar or route table at
  all (`SITE_MAP.md`'s route table lists no such page).
- `notify()` (`src/lib/notifications.ts:17`) takes no per-user configuration input — every
  recipient in every call site above gets every notification `notify()` sends them, at
  whatever priority the caller hard-codes, with no way to mute a kind, a project, or a time
  window.

This is logged here as a **missing capability**, not a defect in existing code — OceancOS
never built this feature, it did not regress or break it. It is filed as a finding in
`audit/findings-notifications-permissions.md` for completeness of this pass's scope, at Low
severity, since `ACTION_PLAN.md`/`BRIDGE_ALIGNMENT_PLAN.md` already track it as an explicit,
acknowledged gap for a later phase (Phase 3+ of `BRIDGE_ALIGNMENT_PLAN.md`, out of scope per
`SITE_MAP.md`'s "Out of scope this pass").
