# Findings — Workflow logic

Scope: the ChangeOrder approval chain, the Job commercial lifecycle, CrewRequest,
and the links between them. Every state machine was enumerated exhaustively from
its transition map and cross-referenced against `src/lib/rbac.ts`. Live dev
database rows are cited where they demonstrate a finding.

---

### JOBS — The generic transition action lets a client skip the entire acceptance ceremony
Severity: Critical
Location: src/app/(app)/jobs/actions.ts:310-388 (`transitionJob`), src/lib/jobs/workflow.ts:26,43,137
Found by: workflow-logic

Description:
`CLIENT_ACCEPTED` is a legal target of `QUOTE_SENT` and `EXPIRED`
(src/lib/jobs/workflow.ts:26-27) and carries the permission `JOB_ACCEPT`
(src/lib/jobs/workflow.ts:43). It is kept out of the button list only by the
cosmetic `NOT_OFFERED` array (src/lib/jobs/workflow.ts:137), which is a UI
filter. The server action `transitionJob` performs no check that `to` is one of
the offered transitions — it reads `to` straight from the form
(src/app/(app)/jobs/actions.ts:313) and then only calls
`assertPermission(user, JOB_TRANSITION_PERMISSION[to])` and
`assertTransitionJob(job.status, to)`, both of which pass.

Concrete sequence: a user holding `JOB_ACCEPT` (OWNERS_REP, PROJECT_MANAGER or
CAPTAIN — all three also hold `JOB_CANCEL`) opens a `QUOTE_SENT` job. The page
renders a `transitionJob` form for "Cancel quote" with a hidden
`<input name="to" value="CANCELLED_QUOTE">` (src/app/(app)/jobs/[id]/page.tsx:470).
Editing that hidden value to `CLIENT_ACCEPTED` in devtools and submitting moves
the job to `CLIENT_ACCEPTED`.

Everything the two-step ceremony exists to guarantee is skipped:
- the governance gate on the linked change order
  (src/app/(app)/jobs/[id]/accept/actions.ts:63-75) is never consulted, so a job
  linked to a `DRAFT`, `REJECTED` or `CANCELLED` change order can be accepted;
- no `AcceptanceChallenge` is created, so no emailed code is required;
- the quote fingerprint check (accept/actions.ts:163-169) never runs;
- `clientAcceptedAt` and `clientAcceptedById` are left NULL, because
  `transitionJob`'s `extra` object (src/app/(app)/jobs/actions.ts:322-339)
  handles `ACCEPTED`, `YARD_COMPLETED`, `WORKS_ACCEPTED` and the cancellations
  but has no branch for `CLIENT_ACCEPTED`;
- the audit row is written as `action: "STATUS"` rather than the
  `action: "APPROVE"` signature record with IP, user-agent, challenge id and
  quote hash (accept/actions.ts:214-230).

The yard then countersigns normally and the money is committed.

Impact:
The platform's central control — "accepting is a signature on money" — is
bypassable from the browser with no special tooling. The resulting record is a
`CLIENT_ACCEPTED`/`ACCEPTED` job with a NULL `clientAcceptedById`: the database
cannot say who signed, when, from where, or on which version of the quote. In a
refit dispute this is the one record that matters and it will be empty. It also
defeats the change-order approval gate, which is the stated reason the product
exists.

Suggested fix:
Refuse in `transitionJob` any target that `jobActions(job.status)` does not
offer — i.e. reject `CLIENT_ACCEPTED` (and `EXPIRED`) explicitly, mirroring
`NOT_OFFERED` server-side rather than only in the view. Add a `CLIENT_ACCEPTED`
branch that throws. Separately, make `clientAcceptedById` non-nullable once a
job is at or past `CLIENT_ACCEPTED`, enforced by a check constraint, so no code
path can produce an unsigned acceptance.

---

### CHANGE ORDERS — A rejected change order becomes APPROVED once the remaining stages approve
Severity: Critical
Location: src/app/(app)/change-orders/actions.ts:180-207
Found by: workflow-logic

Description:
`decideChangeOrderApproval` decides whether the chain is complete by counting
only rows still sitting at `PENDING`:

```
const remaining = await prisma.changeOrderApproval.count({
  where: { changeOrderId: approval.changeOrderId, decision: "PENDING", required: true },
});
if (remaining === 0) { ... status: "APPROVED", approvedCost: ... }
```
(src/app/(app)/change-orders/actions.ts:185-192)

A stage that decided `REJECTED` or `MORE_INFO` is no longer `PENDING`, so it
does not count. Nothing anywhere re-opens a rejected stage or blocks the
approval branch when a sibling stage has rejected.

Concrete sequence, reproducible against the current dev data: CO-0008 is
`REJECTED` with `CAPTAIN=REJECTED, TECH_MANAGER=PENDING, YARD=PENDING,
OWNERS_REP=PENDING, FINANCE=PENDING`. The approvals queue filters change orders
to `SUBMITTED|UNDER_REVIEW|MORE_INFO` (src/app/(app)/approvals/page.tsx:37), so
the four pending stages are hidden in the UI — but `decideChangeOrderApproval`
itself checks neither the change order's status nor the sibling decisions. A
`MORE_INFO` decision by any remaining stage flips the change order to
`MORE_INFO`, at which point all four stages reappear in the approvals queue. As
each of them approves, the last one finds `remaining === 0` and the change order
is written to `APPROVED` with `approvedCost` set — despite the captain's
standing rejection, which is still visible on the approval chain.

The same defect makes the "Revise" edge (`REJECTED → DRAFT`,
src/lib/workflow/changeOrder.ts:36) unsafe: resubmitting never resets the
rejected approval row, so the rejecting stage is permanently skipped and the
change order can complete its chain without them ever seeing it again.

Impact:
A governance record can carry a formal rejection by the captain, the class
surveyor or finance and still read `APPROVED`, with `approvedCost` committed and
a "fully approved" notification sent to the creator. Downstream, the job
acceptance gate (src/app/(app)/jobs/[id]/accept/actions.ts:68) treats
`APPROVED` as clearance, so work rejected by a required approver becomes
signable. This is the audit trail lying about an approval decision — the single
worst failure mode for this product.

Suggested fix:
Treat the chain as satisfied only when every required row is `APPROVED`
(`count({ where: { changeOrderId, required: true, decision: { not: "APPROVED" } } }) === 0`),
and refuse an `APPROVED` decision outright while any sibling row is `REJECTED`.
On `REJECTED → DRAFT`, reset all approval rows to `PENDING` inside the same
transaction so a resubmission is genuinely re-reviewed.

---

### CHANGE ORDERS — Approval decisions write status outside the legal-transition map
Severity: Critical
Location: src/app/(app)/change-orders/actions.ts:139-211; contrast src/lib/workflow/changeOrder.ts:27-38
Found by: workflow-logic

Description:
`transitionChangeOrder` routes every status change through
`assertTransitionChangeOrder` (src/app/(app)/change-orders/actions.ts:70), but
`decideChangeOrderApproval` calls `prisma.changeOrder.update({ data: { status } })`
directly at lines 181, 183, 189-192 and 202-205. It never reads the change
order's current status, never calls `assertTransitionChangeOrder`, and never
checks that the change order is in a state where approving means anything. The
only gate is the stage permission (line 150).

Illegal edges this produces, all reachable by posting to the action (the form is
rendered on /approvals and on the change-order page, so the `approvalId` values
are in the user's own HTML):

- `DRAFT → UNDER_REVIEW` / `DRAFT → APPROVED` / `DRAFT → REJECTED` /
  `DRAFT → MORE_INFO`. Approval rows are created at creation time
  (src/app/(app)/change-orders/actions.ts:43-45), so a never-submitted draft has
  a full set of `PENDING` stages. `CO_LEGAL_TRANSITIONS.DRAFT` permits only
  `["SUBMITTED","CANCELLED"]`. CO-0010 in the dev database is exactly this shape.
- `CANCELLED → UNDER_REVIEW` / `CANCELLED → APPROVED`. `CANCELLED` is declared
  terminal (src/lib/workflow/changeOrder.ts:41) and has an empty transition list,
  yet CO-0011 is `CANCELLED` with all five stages still `PENDING`; a single
  approval resurrects it.
- `APPROVED → MORE_INFO`, `IN_PROGRESS → MORE_INFO`, `COMPLETED → MORE_INFO`
  where any stage is re-decidable. The action never checks that the approval is
  still `PENDING`, so a stage-holder can revisit a decision after the chain
  closed and drag a change order that is already in progress back into review —
  while the jobs it authorised stay accepted.

`approvedCost` is likewise written from a stale in-memory snapshot
(`approval.changeOrder.estimatedCost`, line 191) read before any of the four
sequential writes.

Impact:
The legal-transition map is documented as the single source of truth
("nothing may move a change order along an edge that is not listed here",
src/lib/workflow/changeOrder.ts:23-26) and the approval path — the most
consequential path in the system — does not obey it. Terminal states are not
terminal, drafts can be approved without ever being submitted, and the status
history (`ChangeOrderHistory` rows written at line 162-169 with no
`fromStatus`/`toStatus`) does not even record the jump, so the illegal move is
invisible in the audit trail.

Suggested fix:
Have `decideChangeOrderApproval` load the change order, compute the target
status, and go through `assertTransitionChangeOrder` (adding the
`UNDER_REVIEW → UNDER_REVIEW` self-edge or short-circuiting when unchanged).
Refuse any decision unless the change order is `SUBMITTED`, `UNDER_REVIEW` or
`MORE_INFO` and the approval row is still `PENDING` — the same conditions the UI
already applies at src/app/(app)/change-orders/[id]/page.tsx:186-189 and
src/app/(app)/approvals/page.tsx:37. Write `fromStatus`/`toStatus` on the
history row.

---

### CHANGE ORDERS — The approval decision value is never validated
Severity: High
Location: src/app/(app)/change-orders/actions.ts:142, 152-160, 180-207; src/lib/validators.ts:52-57
Found by: workflow-logic

Description:
The decision is taken as `String(formData.get("decision") ?? "") as "APPROVED" | "REJECTED" | "MORE_INFO"`
— a TypeScript cast over unvalidated input. `ApprovalDecisionSchema`
(src/lib/validators.ts:52-57) exists for exactly this and is never imported by
this file. The raw string is written straight into
`ChangeOrderApproval.decision` (line 154).

Because the branch at line 180 is `if REJECTED / else if MORE_INFO / else`, any
other value falls into the approval branch. Posting `decision=DELEGATED` (or
`decision=x`) writes that value to the row, and since the row is then no longer
`PENDING` it stops counting toward `remaining` — so it silently satisfies the
chain without anybody having approved. Posting `decision=APPROVED` twice is also
accepted, as is a stage-holder overwriting their own earlier `REJECTED`.

Impact:
A change order can reach `APPROVED` with stage rows that say neither approved
nor rejected, and the approval chain rendered on the detail page
(src/app/(app)/change-orders/[id]/page.tsx:225-233) will show an unrecognised
badge tone `muted` for them — indistinguishable at a glance from `PENDING`.
The record of who approved what is unreliable.

Suggested fix:
Parse the whole form with `ApprovalDecisionSchema` and reject anything outside
the enum. Restrict the decision to `APPROVED | REJECTED | MORE_INFO` here (the
schema's `DELEGATED` has no handling at all) and refuse a decision on a row that
is not `PENDING`.

---

### CROSS-WORKFLOW — Accepting and countersigning a job touches neither the budget nor the linked change order
Severity: High
Location: src/app/(app)/jobs/[id]/accept/actions.ts:180-211; src/app/(app)/jobs/actions.ts:324-339; src/app/(app)/change-orders/actions.ts (no budget writes anywhere)
Found by: workflow-logic

Description:
Traced end to end, `confirmAcceptance` writes: the challenge's `consumedAt`, the
job's `status`/`clientAcceptedAt`/`clientAcceptedById`, a `JobHistory` row, a
system `Comment`, an audit row and a notification to the yard
(accept/actions.ts:180-250). `transitionJob` to `ACCEPTED` — the countersign,
which is the moment the money is actually committed — writes `yardAcceptedAt`
and `yardAcceptedById` and nothing else (jobs/actions.ts:324-327).

Nothing in either path writes to `Budget`. Grepping the whole of `src/` for
`prisma.budget.` returns only two `findMany` reads
(src/app/(app)/financials/page.tsx:22, src/app/(app)/dashboard/page.tsx:58);
the only write in the repository is `prisma.budget.create` in prisma/seed.ts:156.
`Budget.committed`, `Budget.actual`, `Budget.pendingChanges` and
`Budget.forecastFinal` are therefore frozen at their seeded values forever.

Nothing writes back to the linked change order either. `linkedChangeOrderId` is
read exactly once, as the acceptance gate (accept/actions.ts:63-75). Accepting
the job does not move the change order `APPROVED → IN_PROGRESS`; works
acceptance does not move it `IN_PROGRESS → COMPLETED`; and the accepted job
total is never reconciled against `ChangeOrder.approvedCost`, which is set to
the *estimate* at approval time (change-orders/actions.ts:191).

Impact:
A change order approved at a €50k estimate can be delivered by a job quoted and
countersigned at €80k, and every financial surface in the product will still say
€50k: /financials reads only the static `Budget` rows, and /dashboard computes
"committed" from `ChangeOrder.approvedCost`
(src/app/(app)/dashboard/page.tsx:103-107), which is disjoint from job totals.
The platform's core promise — budget control over refit variations — is not
implemented; the numbers on screen are seed data with a real workflow running
beside them. The change-order chain also has to be advanced by hand, so it
routinely sits at `APPROVED` while its works are finished.

Suggested fix:
On countersign (`ACCEPTED`), write the accepted total to the project's budget as
`committed` against the change order's category, inside the same transaction as
the status change; reverse it on `CANCELLED_WORKS`. On `WORKS_ACCEPTED`, move it
to `actual`. Drive the linked change order's `IN_PROGRESS`/`COMPLETED`
transitions from the job's lifecycle through `transitionChangeOrder`, and
surface any variance between `ChangeOrder.approvedCost` and the accepted job
total on the change-order page rather than silently ignoring it.

---

### CHANGE ORDERS — The approval chain notifies nobody after the first stage, and rejections notify nobody at all
Severity: High
Location: src/app/(app)/change-orders/actions.ts:108-132 vs 180-207
Found by: workflow-logic

Description:
`transitionChangeOrder` looks up the first `PENDING` approval and notifies
everyone holding that stage's permission — but only when the target is
`SUBMITTED` or `UNDER_REVIEW` (lines 109-132). `decideChangeOrderApproval`, which
is what actually advances the chain stage by stage, writes
`status: "UNDER_REVIEW"` directly (lines 202-205) and never runs that block. So
stage 2 (`TECH_MANAGER`), stage 3 (`YARD`), stage 4 (`OWNERS_REP`) and stage 5
(`FINANCE`) are never told that it is their turn.

The rejection and more-info branches (lines 180-183) send no notification
whatsoever: they update the status and return. The creator — notified on every
ordinary transition at lines 98-106 — hears nothing when their change order is
rejected or sent back for more information. The only notification in the whole
action is the "fully approved" one at line 193.

Impact:
A five-stage approval chain silently stalls after the first decision. Nobody is
paged; the change order just sits in `UNDER_REVIEW` until an approver happens to
open /approvals. A rejected change order is worse: the creator is never told,
and because the approvals queue filters on status the rejected record also drops
out of every approver's list, so it disappears in both directions. Given the
severity of what a rejection means on a refit, silence is the wrong outcome.

Suggested fix:
Move the "notify the next pending stage" block into a shared helper and call it
from `decideChangeOrderApproval` whenever the chain advances. Notify
`changeOrder.createdById` on `REJECTED` and `MORE_INFO` with `priority: "HIGH"`,
carrying the decider's comment in the notification body.

---

### JOBS — MINOR_DEFICIENCY has no route back to the yard, and the yard is never told it exists
Severity: High
Location: src/lib/jobs/workflow.ts:30-31; src/app/(app)/jobs/actions.ts:373-384; src/app/(app)/jobs/[id]/page.tsx:104-105
Found by: workflow-logic

Description:
`MINOR_DEFICIENCY` is reached from `YARD_COMPLETED` by a client-side role
(`JOB_DEFICIENCY`: OWNERS_REP, PROJECT_MANAGER, CAPTAIN). Its only exits are
`WORKS_ACCEPTED` and `CANCELLED_WORKS` (src/lib/jobs/workflow.ts:31). There is no
edge back to `ACCEPTED` or `YARD_COMPLETED`, so once a deficiency is raised the
yard has no state in which to record that it fixed it. The vessel's choices are
to accept the works with the defect outstanding, or cancel works that are
already done.

The yard also cannot record progress in that state: `canProgress` is
`hasPermission(JOB_PROGRESS) && job.status === "ACCEPTED"`
(src/app/(app)/jobs/[id]/page.tsx:105), so the progress control disappears at
`YARD_COMPLETED` and never comes back.

And the yard is never notified. `transitionJob`'s notification targets
`job.createdById` and `job.designatedAuthoriserId`
(src/app/(app)/jobs/actions.ts:373-375) — both vessel-side. So when the client
reports a deficiency, nobody at the yard receives a notification; the same gap
applies to `WORKS_ACCEPTED` (the point at which the yard's warranty clock starts,
src/app/(app)/jobs/actions.ts:332-335) and to `CANCELLED_WORKS`.

Impact:
The rework loop that a refit runs on constantly — yard finishes, client snags it,
yard fixes it, client accepts — cannot be represented. In practice a job sits in
`MINOR_DEFICIENCY` indefinitely with the yard unaware anything was raised,
because no notification reached them and the status change is only visible to
someone who opens the job. `P.1000.10` in the dev database is in this state at
100% progress.

Suggested fix:
Add `MINOR_DEFICIENCY → YARD_COMPLETED` (permission `JOB_COMPLETE`, labelled
"Deficiency rectified") so the yard can hand the work back, and allow progress
reporting in `MINOR_DEFICIENCY`. Derive the notification audience from the
transition's `side` (already declared on every action in
src/lib/jobs/workflow.ts:116-128) rather than from the two vessel-side fields, so
yard-facing events reach the yard.

---

### JOBS — EXPIRED is never set by anything, and the acceptance audit records a false "wasExpired"
Severity: High
Location: src/lib/jobs/workflow.ts:19-23, 42, 119, 130-137; src/app/(app)/jobs/[id]/accept/actions.ts:228
Found by: workflow-logic

Description:
Nothing in the running application ever writes `status = "EXPIRED"`. The comment
at src/lib/jobs/workflow.ts:133-135 states that "EXPIRED … is reached by the
clock, not by anyone pressing a button", and it is duly excluded from
`jobActions` via `NOT_OFFERED`. But there is no clock: there is no cron entry, no
scheduled route, no `setInterval`, no queue worker and no CI job anywhere in the
repository (searched across `src/`, `scripts/`, `.github/`, `package.json`). The
only occurrence of the literal outside type definitions and read-side filters is
prisma/seedJobs.ts:137, which seeds one row directly.

`isExpired()` (src/lib/jobs/workflow.ts:83-90) computes lapse on read for the
badge, which masks the gap in the UI, but the stored status never changes.
Current dev data confirms it: `E.2500.10`, `I.2200.20` and `P.2200.10` are all
`QUOTE_SENT` with `expiresAt` in May 2026 — months past — and none is `EXPIRED`.

The consequence in the audit record is direct. `confirmAcceptance` writes
`wasExpired: job.status === "EXPIRED"` (accept/actions.ts:228). Since the status
is never set, that field is recorded as `false` on every acceptance, including
acceptances of quotes that had in fact lapsed five months earlier.

Impact:
The audit trail makes a false factual statement about the one circumstance the
field exists to capture: whether a signature was applied to a live quote or a
dead one. Reporting is affected too — the `EXPIRED` filters in
`JOB_PENDING_STATUSES` and the "Pending"/"New purchases" views
(src/lib/jobs/views.ts:44,51) can never match a real row, so a yard cannot list
its lapsed quotes, and `JOB_TRANSITION_PERMISSION.EXPIRED` /
`ACTIONS.EXPIRED` are dead configuration that reads as if the feature ships.

Suggested fix:
Either derive `wasExpired` from `isExpired(job)` rather than from the stored
status — the cheap correct fix for the audit record — or add the missing sweep
(a scheduled route that moves `QUOTE_SENT` rows past `expiresAt` to `EXPIRED`
with a `JobHistory` row and a notification to the authoriser). Do not leave the
comment claiming a clock exists when it does not.

---

### JOBS — Progress can be set on any job in any status, including after works acceptance
Severity: High
Location: src/app/(app)/jobs/actions.ts:409-438
Found by: workflow-logic

Description:
`setJobProgress` checks the `JOB_PROGRESS` permission and project access, then
writes `progressPct` unconditionally. It never looks at `job.status`. The UI
hides the control outside `ACCEPTED`
(src/app/(app)/jobs/[id]/page.tsx:104-105), but the form posts to a server
action that does not re-apply that rule.

Answering the specific question "can a job be 0% complete but marked
works-accepted": yes, by two routes.
1. `transitionJob` to `YARD_COMPLETED` forces `progressPct = 100`
   (src/app/(app)/jobs/actions.ts:330), and `WORKS_ACCEPTED` does not re-check
   it — so a yard user posts `setJobProgress` with `progressPct=0` *after*
   completion, and the job reads `WORKS_ACCEPTED` at 0%.
2. `MINOR_DEFICIENCY → WORKS_ACCEPTED` carries no progress assertion at all, so
   whatever the number happens to be is what stands.

Conversely, progress can be written on `NEW_REQUEST`, `QUOTE_SENT`,
`CANCELLED_QUOTE` and `CANCELLED_WORKS` jobs, where it is meaningless. `JOB_PROGRESS`
is held by YARD_PM and YARD_TRADE_LEAD; the latter holds no other job-workflow
permission, so a trade lead can alter the completion figure on a cancelled or
unpriced job.

Impact:
`progressPct` is the input to the project's headline work-progress figure —
`Σ(progress × accepted value) ÷ Σ(accepted value)`
(src/lib/metrics/project.ts:77-82) and the per-group figure in
`groupJobs` (src/lib/jobs/views.ts:148-154). An unconstrained write on any
status lets that number be moved arbitrarily, in either direction, by the party
being measured, with only a `JobHistory` row as evidence. No notification is
sent on a progress change either, so nobody on the vessel side is told.

Suggested fix:
Reject `setJobProgress` unless the job is in `ACCEPTED` or `MINOR_DEFICIENCY`,
mirroring the UI rule server-side. Require `progressPct === 100` before allowing
`YARD_COMPLETED` or `WORKS_ACCEPTED` rather than silently forcing it, and notify
the vessel-side watchers on a material progress change.

---

### CONCURRENCY — No status write anywhere is conditional on the status that was read
Severity: High
Location: src/app/(app)/jobs/actions.ts:341-342; src/app/(app)/jobs/[id]/accept/actions.ts:136-190; src/app/(app)/change-orders/actions.ts:72-76, 152-207; src/app/(app)/crew-requests/actions.ts:75-78
Found by: workflow-logic

Description:
Every workflow action follows read-then-write with no optimistic lock: the
record is fetched, the legality of the transition is asserted against the value
just read, and then `prisma.<model>.update({ where: { id } , data: { status } })`
is issued with no condition on the previous status and no version column. There
is no `updatedAt` precondition, no `updateMany({ where: { id, status: previous } })`,
and no row lock.

Specific races:

- Double countersign / double transition. Two YARD_PM users both act on a
  `CLIENT_ACCEPTED` job. Both read `CLIENT_ACCEPTED`, both pass
  `assertTransitionJob`, both write. The job ends at `ACCEPTED` with two
  `JobHistory` rows, two system comments and two notifications.
- Divergent transitions. From `YARD_COMPLETED`, user A submits `WORKS_ACCEPTED`
  and user B submits `MINOR_DEFICIENCY` concurrently. Both are legal from the
  status each read. The status is whichever wrote last, but the *side effects*
  from both are applied: `worksAcceptedAt` and `warrantyMonths` are set
  (src/app/(app)/jobs/actions.ts:332-335) on a job whose final status is
  `MINOR_DEFICIENCY`. The same shape from `ACCEPTED` leaves a `YARD_COMPLETED`
  job carrying `cancelledAt` and `cancelReason`.
- Double acceptance. `confirmAcceptance` checks `challenge.consumedAt` at
  src/app/(app)/jobs/[id]/accept/actions.ts:141 *outside* the transaction and
  then consumes it at line 181 with an unconditional `update`. Two submissions
  of the same valid code race past the check, producing two `CLIENT_ACCEPTED`
  history rows and two `APPROVE` audit records — two signatures on one quote.
- Double approval. `decideChangeOrderApproval` uses no transaction at all: four
  sequential awaits (lines 152, 162, 171, 181/189/202). Two approvers finishing
  the chain together can both observe `remaining === 0` and both write
  `APPROVED` plus a "fully approved" notification. A reject racing a final
  approve resolves to whichever wrote last.

Impact:
The state machines are enforced against a snapshot that may already be stale by
the time the write lands. The failure mode is not a visible error but a record
whose status and timestamp fields disagree — a job that is cancelled *and*
completed, or accepted twice — which is precisely the kind of quiet corruption
that only surfaces in a dispute.

Suggested fix:
Make every status write conditional: `updateMany({ where: { id, status: previousStatus }, data: {...} })`
and treat `count === 0` as "someone else moved this; reload and retry". Pull
`decideChangeOrderApproval` into a single `prisma.$transaction` and consume the
acceptance challenge with `updateMany({ where: { id, consumedAt: null } })`,
aborting when it matches nothing.

---

### CREW REQUESTS — Four of the nine transitions require no permission at all
Severity: High
Location: src/app/(app)/crew-requests/actions.ts:50-97; src/app/(app)/crew-requests/[id]/page.tsx:136-149
Found by: workflow-logic

Description:
`transitionCrewRequest` gates only some targets:

```
if (target === "TRIAGED" || target === "ASSIGNED") assertPermission(user, PERMISSIONS.CR_TRIAGE);
else if (target === "COMPLETED" || target === "CLOSED") assertPermission(user, PERMISSIONS.CR_COMPLETE);
```
(src/app/(app)/crew-requests/actions.ts:57-58)

`IN_PROGRESS`, `BLOCKED`, `AWAITING_APPROVAL` and `REJECTED` fall through the
`else if` with no check whatsoever — not even `CR_VIEW`. Any authenticated user,
including SUPPLIER and GUEST (who hold no `crew_request.*` permission at all,
src/lib/rbac.ts:175,196), can reject, block, or unblock any crew request in the
system. There is also no project-access check anywhere in the action, unlike the
jobs actions which call `loadJob`/`listProjectsForUser`.

The detail page compounds this: the workflow buttons at
src/app/(app)/crew-requests/[id]/page.tsx:136-149 are rendered from a static
`transitions` map with no `hasPermission` filter at all — unlike the job page
(src/app/(app)/jobs/[id]/page.tsx:98-100) and the change-order page
(src/app/(app)/change-orders/[id]/page.tsx:62-64), both of which filter. So every
viewer is shown a live "Reject" button.

Impact:
Rejecting a crew request is a real decision with a cost and schedule impact
attached (`costImpact`, `scheduleImpactDays` on the model). Anyone who can reach
the page can make it, on any project, and the requester is notified that their
request was rejected by someone with no authority over it. The "Reopen"
(`REJECTED → NEW`) edge is equally open, so the status can be cycled at will.

Suggested fix:
Require `CR_TRIAGE` (or a new `CR_UPDATE`) for `IN_PROGRESS`, `BLOCKED` and
`AWAITING_APPROVAL`, and `CR_TRIAGE` for `REJECTED`. Add a project-access check
to the action mirroring `loadJob`. Filter the buttons on the detail page by
permission so the UI and the server agree.

---

### CREW REQUESTS — Assigning bypasses the transition map and reopens closed requests
Severity: High
Location: src/app/(app)/crew-requests/actions.ts:99-125
Found by: workflow-logic

Description:
`assignCrewRequest` writes the status directly:

```
data: { assignedToId, status: assignedToId ? "ASSIGNED" : "TRIAGED", updatedById: user.id }
```
(src/app/(app)/crew-requests/actions.ts:106)

It never reads the current status and never consults the `legal` map defined
twenty lines above in the same file (lines 60-70). The assignment form is
rendered for anyone with `CR_ASSIGN` regardless of the request's state
(src/app/(app)/crew-requests/[id]/page.tsx:154-156), and `CLOSED` is declared
terminal in the map (`CLOSED: []`).

Concrete sequence: a `CLOSED` or `COMPLETED` crew request is assigned to someone
— the status jumps straight back to `ASSIGNED`. Clearing the assignee on any
request, in any status, forces it to `TRIAGED`, including from `COMPLETED`,
`CLOSED` and `REJECTED`. None of these edges exists in the map, and no
`recordAudit` entry marks the status change (the audit row at lines 108-114
records only `{ assignedToId }`).

Impact:
Terminal states are not terminal, and the status history has a hole in it: the
record moves without any trace of the move. A completed and closed crew request
silently returns to the open queue and starts counting toward the dashboard's
open-request figure (src/app/(app)/dashboard/page.tsx:39) again.

Suggested fix:
Route the status side of assignment through the same legality check as
`transitionCrewRequest` — or better, separate the two: let assignment change only
`assignedToId`, and require an explicit transition for the status. Record the
status change in the audit details either way.

---

### CHANGE ORDERS — "Request more information" and "Revise" lead nowhere: no edit action exists
Severity: Medium
Location: src/lib/workflow/changeOrder.ts:29-36; src/app/(app)/change-orders/actions.ts (whole file)
Found by: workflow-logic

Description:
The transition map provides `SUBMITTED → MORE_INFO`, `UNDER_REVIEW → MORE_INFO`,
`MORE_INFO → UNDER_REVIEW` and `REJECTED → DRAFT` ("Revise",
src/lib/workflow/changeOrder.ts:80). All four exist so that a change order can be
amended and re-reviewed. But the only exported server actions in
src/app/(app)/change-orders/actions.ts are `createChangeOrder`,
`transitionChangeOrder`, `decideChangeOrderApproval` and `addChangeOrderComment`.
There is no update action anywhere in the codebase — `CO_EDIT` is granted to
OWNERS_REP and PROJECT_MANAGER (src/lib/rbac.ts:95,113) and used only as the
default return value of `permissionForTransition` (src/lib/workflow/changeOrder.ts:20).
The detail page renders no edit form.

`MORE_INFO → DRAFT` is not legal either, so a change order sent back for more
information cannot even be returned to draft.

Impact:
An approver asks for more information and the requester has no way to supply it
beyond a free-text comment; the title, description, estimated cost, schedule
impact and class/flag flags are all frozen from creation. "Revise" on a rejected
change order returns it to `DRAFT` where nothing can be revised. Two of the
chain's three feedback loops are decorative.

Suggested fix:
Add an `updateChangeOrder` action gated on `CO_EDIT` and restricted to `DRAFT`
and `MORE_INFO`, with the changed fields written to `ChangeOrderHistory`. Allow
`MORE_INFO → DRAFT`. If editing is genuinely out of scope, remove the
`MORE_INFO` and `REJECTED → DRAFT` edges rather than offering buttons that lead
to a dead end.

---

### CHANGE ORDERS — The approval chain's order is stored but never enforced
Severity: Medium
Location: src/app/(app)/change-orders/actions.ts:44, 110-113, 139-160; src/app/(app)/approvals/page.tsx:32-42
Found by: workflow-logic

Description:
Approvals are created with an explicit sequence —
`stages.map((stage, idx) => ({ stage, order: idx, required: true }))`
(src/app/(app)/change-orders/actions.ts:44), defaulting to
CAPTAIN → TECH_MANAGER → YARD → OWNERS_REP → FINANCE (line 19). That `order`
field is read in exactly one place: picking which stage to notify first
(line 112, `orderBy: { order: "asc" }`).

`decideChangeOrderApproval` looks up the approval by id and checks only the
stage permission (lines 144-150). The approvals queue lists every `PENDING` row
for the user's stages regardless of position (src/app/(app)/approvals/page.tsx:32-42),
and the detail page renders a decision form on every pending row
(src/app/(app)/change-orders/[id]/page.tsx:186-189). Nothing requires the
preceding stages to have decided.

Impact:
The "multi-stage approval chain" is a set, not a chain. Finance can approve the
cost before the captain has looked at the technical impact, and class can sign
off before the yard has confirmed it can do the work — which is the opposite of
the order the stage list encodes. Combined with the `remaining === 0` bug above,
the last stage to act determines the outcome regardless of position.

Suggested fix:
Refuse a decision when any `required` approval with a lower `order` is still
`PENDING`, and grey the row out in the UI with "waiting on <stage>". If parallel
approval is intended, delete the `order` field rather than leaving it implying a
sequence that does not exist.

---

### JOBS — A quote can never be revised or re-issued
Severity: Medium
Location: src/lib/jobs/workflow.ts:25-27; src/app/(app)/jobs/actions.ts:234; src/app/(app)/jobs/[id]/page.tsx:101-103
Found by: workflow-logic

Description:
`issueQuote` asserts `NEW_REQUEST → QUOTE_SENT` (src/app/(app)/jobs/actions.ts:234)
and the quote button is shown only for `NEW_REQUEST`
(src/app/(app)/jobs/[id]/page.tsx:101-103). `QUOTE_SENT → QUOTE_SENT` and
`EXPIRED → QUOTE_SENT` are both absent from `JOB_LEGAL_TRANSITIONS`
(src/lib/jobs/workflow.ts:26-27), and `NEW_REQUEST` is not a target of any
transition at all.

So once a quote is sent it is frozen. If the yard mispriced a line, the only
route is `CANCELLED_QUOTE` — a terminal state with no way back — and the vessel
must raise an entirely new request, which then takes a new placeholder code in
the `R.0000` group and loses the thread, the attachments and the history of the
original. An `EXPIRED` quote likewise cannot be re-issued at current prices: the
vessel's only options are to accept the stale figure or cancel.

Impact:
Quote revision is routine in a refit — prices change, scope is clarified, a line
is wrong. The state machine has no representation for it, so the workaround is
cancel-and-recreate, which fragments the record of a single piece of work across
two job codes and breaks any link to the change order that authorised it.

Suggested fix:
Add `QUOTE_SENT → QUOTE_SENT` and `EXPIRED → QUOTE_SENT` (permission
`JOB_ISSUE_QUOTE`), labelled "Revise quote". Since `issueQuote` already deletes
and recreates all lines and notes (src/app/(app)/jobs/actions.ts:237-238), snapshot
the superseded version into `JobHistory.details` first so the old figures are
recoverable, and re-notify the designated authoriser.

---

### NOTIFICATIONS — Comments on jobs, change orders and crew requests notify nobody
Severity: Medium
Location: src/app/(app)/jobs/actions.ts:441-476; src/app/(app)/change-orders/actions.ts:213-229; src/app/(app)/crew-requests/actions.ts:127-143
Found by: workflow-logic

Description:
All three comment actions create the `Comment` row, record an audit entry and
revalidate the path. None of them calls `notify`. The `NotifyKind` union declares
a `"COMMENT"` kind (src/lib/notifications.ts:7) that no caller in the codebase
ever uses.

The job thread is the only channel between the vessel and the yard on a given
piece of work — `addJobComment` even supports formal minutes
(`kind: "MINUTE"`, gated on `MINUTES_RECORD`, src/app/(app)/jobs/actions.ts:452).
A minute recorded against a job reaches nobody.

Impact:
The correspondence that surrounds a commercial decision is invisible until
somebody happens to open the record. A question from the yard on a quote, or a
minute recorded at a progress meeting, sits unseen; in practice this pushes the
conversation off-platform into email, where it is no longer part of the audit
trail the product exists to keep.

Suggested fix:
Notify the record's participants — for a job, `createdById`,
`designatedAuthoriserId` and whoever has commented before, minus the author — with
`kind: "COMMENT"`. Raise the priority for `MINUTE`.

---

### NOTIFICATIONS — Recipient lookups are global, not scoped to the project
Severity: Medium
Location: src/app/(app)/jobs/actions.ts:128-142; src/app/(app)/jobs/[id]/accept/actions.ts:232-250; src/app/(app)/change-orders/actions.ts:116-130
Found by: workflow-logic

Description:
Every "notify the people who can do X" query selects on permission alone, with
no project filter:

```
const yardUsers = await prisma.user.findMany({
  where: { active: true, roles: { some: { role: { permissions: { some: { permission: { key: PERMISSIONS.JOB_ISSUE_QUOTE } } } } } } },
```
(src/app/(app)/jobs/actions.ts:128-134; identically for `JOB_COUNTERSIGN` at
accept/actions.ts:232-242 and for the approval stage permission at
change-orders/actions.ts:116-122).

`UserRole` carries a `projectId` and the app has a working scoping helper
(`listProjectsForUser`, used by `loadJob` at src/app/(app)/jobs/actions.ts:29-32),
but none of it is applied here.

Impact:
Every yard PM on the platform is notified of every new quote request on every
vessel, and the notification title carries the job code and title
(`New quote request ${code}: ${data.title}`) — commercially sensitive detail about
a project the recipient has no access to. The notification links to a record they
will get `notFound()` on. As the platform takes on more than one yard, this is a
disclosure between competitors as well as noise.

Suggested fix:
Constrain each lookup to users holding the permission *on the job's or change
order's project*, via the `UserRole.projectId` relation, the same way
`listProjectsForUser` does.

---

### CHANGE ORDERS — Roles that can raise a change order cannot submit, edit or cancel it, and drafts notify nobody
Severity: Medium
Location: src/lib/rbac.ts:126-149; src/lib/workflow/changeOrder.ts:17-21; src/app/(app)/change-orders/actions.ts:25-60
Found by: workflow-logic

Description:
Cross-referencing the transition permissions against the role matrix:
`DRAFT → SUBMITTED` requires `CO_SUBMIT`, held only by OWNERS_REP
(src/lib/rbac.ts:95) and PROJECT_MANAGER (line 113). `DRAFT → CANCELLED` requires
`CO_CANCEL`, held only by OWNERS_REP (line 96). Everything else requires
`CO_EDIT`, held by OWNERS_REP and PROJECT_MANAGER.

CAPTAIN (line 130) and CHIEF_ENGINEER (line 145) both hold `CO_CREATE` and none
of `CO_SUBMIT`, `CO_EDIT` or `CO_CANCEL`. So a captain or chief engineer can
raise a change order and then cannot move it, amend it or withdraw it. The
record is not permanently stuck — an OWNERS_REP or PROJECT_MANAGER can submit it —
but `createChangeOrder` sends no notification at all (lines 25-60), so nobody is
told a draft is waiting for them. CO-0010 sits in `DRAFT` in the dev database.

Impact:
The person closest to the technical problem raises the change order and then has
no way to progress it, and no signal goes to anyone who can. Drafts accumulate
unseen. It also means the captain cannot withdraw their own mistaken draft.

Suggested fix:
Either grant `CO_SUBMIT` to the roles that hold `CO_CREATE`, or notify the
project's OWNERS_REP/PROJECT_MANAGER on creation that a draft needs submitting.
Allow a creator to cancel their own draft regardless of `CO_CANCEL`.

---

### CREW REQUESTS — The workflow is an island: it can be linked to a change order but never becomes one
Severity: Medium
Location: src/app/(app)/crew-requests/actions.ts (whole file); prisma/schema.prisma:216-244
Found by: workflow-logic

Description:
`CrewRequest` carries `linkedChangeOrderId` (prisma/schema.prisma:233), accepted at
creation (src/lib/validators.ts:41, src/app/(app)/crew-requests/new/page.tsx:129)
and rendered as a link on the detail page
(src/app/(app)/crew-requests/[id]/page.tsx:123-129). That is the entire extent of
the connection, and it only points *outward* to a change order that must already
exist.

There is no action anywhere that creates a `ChangeOrder` or a `Job` from a crew
request: `createChangeOrder` takes only its own form fields and has no
`fromCrewRequestId`; `createJobRequest` has a `linkedChangeOrderId` field
(src/app/(app)/jobs/actions.ts:42) but no crew-request equivalent, and `Job` has
no crew-request foreign key at all (prisma/schema.prisma:630-697). The
`ChangeOrder` model's `crewRequests` back-relation
(prisma/schema.prisma:184) is never queried — the change-order detail page does
not include it.

`CrewRequest` also carries `costImpact` and `scheduleImpactDays`
(prisma/schema.prisma:230-231) which nothing reads, and its `AWAITING_APPROVAL`
status has no corresponding `Approval` record: `CR_COMPLETE` alone moves it on,
so "awaiting approval" is a label with no approval behind it.

Impact:
The natural path on a refit — crew reports a defect, it is triaged, it turns out
to be chargeable work, it becomes a change order and then a quote — has to be
re-keyed by hand into a separate record with no link back. The crew request's own
cost and schedule impact figures never reach any financial or schedule view, so
the chargeable consequence of a reported defect is invisible until someone
notices it. The two workflows that ought to feed the governance chain do not.

Suggested fix:
Add a "Raise change order from this request" action that creates the
`ChangeOrder` pre-filled from the crew request's title, description, category,
`costImpact` and `scheduleImpactDays` and sets `linkedChangeOrderId` on both
sides; surface the back-relation on the change-order page. Either wire
`AWAITING_APPROVAL` to an `Approval` row or rename it.

---

### CONCURRENCY — Reference numbers and job codes are allocated by counting rows
Severity: Medium
Location: src/lib/utils.ts:24-27; src/app/(app)/jobs/actions.ts:91-95; src/lib/jobs/codes.ts:101-117
Found by: workflow-logic

Description:
`nextSequence` computes `CO-0001`/`REQ-0001` as `(await fetchCount()) + 1`
(src/lib/utils.ts:24-27), called from `createChangeOrder`
(src/app/(app)/change-orders/actions.ts:34) and `createCrewRequest`
(src/app/(app)/crew-requests/actions.ts:18). `createJobRequest` does the same
shape for job codes: read the siblings, then pick the next free slot with
`nextCodeInGroup` (src/app/(app)/jobs/actions.ts:91-95). `issueQuote` re-checks
its chosen code with a separate `findUnique` before writing
(src/app/(app)/jobs/actions.ts:176-179) — also a read-then-write.

Two concurrent creations read the same count and generate the same number. Both
`ChangeOrder.number` and `CrewRequest.number` are `@unique`, and `Job` has
`@@unique([projectId, code])`, so the second write fails — but it fails as an
unhandled Prisma exception surfacing as a 500, after the user has filled in the
form.

Because `nextSequence` counts rather than reading a high-water mark, a single
hard-deleted row also makes the sequence permanently re-issue a used number,
blocking creation until someone notices.

Impact:
Two people raising a change order at the same moment: one loses their work to an
unexplained error. Low frequency, but the failure is opaque and the data loss is
real. The high-water-mark issue is latent rather than triggered, since nothing
hard-deletes today.

Suggested fix:
Use a database sequence or a `Setting`-backed counter incremented atomically,
and retry once on a unique-constraint violation. For job codes, wrap the
allocation and the insert in a transaction and retry on conflict.

---

### JOBS — Closing a job requires the permission to issue quotes
Severity: Low
Location: src/lib/jobs/workflow.ts:50, 127
Found by: workflow-logic

Description:
`JOB_TRANSITION_PERMISSION.CLOSED` is `PERMISSIONS.JOB_ISSUE_QUOTE`
(src/lib/jobs/workflow.ts:50) and the action is labelled `side: "yard"`
(line 127). `JOB_ISSUE_QUOTE` is held only by YARD_PM (src/lib/rbac.ts:166).
Every other transition has a purpose-named permission; this one reuses the
quoting permission because no `JOB_CLOSE` exists.

The practical effect: the vessel-side roles that just accepted the works
(`JOB_WORKS_ACCEPT` — OWNERS_REP, PROJECT_MANAGER, CAPTAIN) cannot then close
the job, and the only role that can close it is the one that priced it. The
workflow is not stuck — YARD_PM can always close — so this is a naming and
authority mismatch rather than a blockage.

Impact:
Anyone reasoning about who may do what from the permission matrix will get the
wrong answer: `job.issue_quote` reads as "may price work", and granting it to a
commercial assistant silently also grants the authority to close completed jobs
and end the record.

Suggested fix:
Add a `JOB_CLOSE` permission and grant it to the roles that should hold it —
most likely the same set as `JOB_WORKS_ACCEPT`, since closing follows acceptance.

---

### JOBS — A dead "Reopen request" action and an unreachable NEW_REQUEST
Severity: Low
Location: src/lib/jobs/workflow.ts:40, 117; src/lib/jobs/workflow.ts:24-36
Found by: workflow-logic

Description:
Enumerating the transition map, `NEW_REQUEST` appears as a key but never as a
value — no status lists it as a target (src/lib/jobs/workflow.ts:24-36). It is
therefore reachable only at creation. Nonetheless the module carries
`JOB_TRANSITION_PERMISSION.NEW_REQUEST` (line 40) and a full action definition
labelled "Reopen request" (line 117), neither of which any code path can use:
`jobActions` derives its list from the transition map, so the entry is never
emitted.

The substantive consequence is that `CANCELLED_QUOTE` is terminal for a request
that was cancelled before ever being quoted — the vessel must raise a fresh
request rather than reopening the one it withdrew.

Impact:
Dead configuration that reads as a shipped feature; a reviewer scanning
`ACTIONS` would reasonably conclude that requests can be reopened. Minor
operational friction from the irreversible cancellation.

Suggested fix:
Either add `CANCELLED_QUOTE → NEW_REQUEST` (permission `JOB_REQUEST`) so the
label means something, or delete the `NEW_REQUEST` entries from
`JOB_TRANSITION_PERMISSION` and `ACTIONS`.
