# Findings — Workflow functional audit

Scope: whether the Job/Quote, Change Order, Crew Request and Approvals workflows actually work
end-to-end for the person doing the work, as distinct from the code-level defects already logged in
`AUDIT_REPORT.md` and `audit/findings-workflow-logic.md`. Every entry here is either a gap the existing
audit did not record, or a live consequence of the state machine that only shows up when the workflow
is actually driven through the UI as a human would. Already-logged defects are cited by id (`C2`,
`G3.9`, …) and not re-described.

Method: read `src/lib/jobs/workflow.ts`, `src/lib/workflow/changeOrder.ts`, `jobs/actions.ts`,
`jobs/[id]/accept/actions.ts`, `change-orders/actions.ts`, `crew-requests/actions.ts` and every page
that renders their transitions, then drove the running dev server (`http://127.0.0.1:3001`) with
Playwright as `pm@`, `captain@`, `yard@` and `crew@oceancos.dev` to exercise the acceptance ceremony,
a change-order rejection, a minor-deficiency report and a crew-request assignment. Screenshots are in
`/tmp/audit-scripts/screenshots/` (filenames cited per finding); throwaway driver scripts are in
`/tmp/audit-scripts/*.ts` and touch nothing in `e2e/` or the repo.

## Count by severity
- **High: 5**
- **Medium: 2**
- **Low: 2**
- **Total: 9**

## Furthest from working as intended
The **Jobs After Sales step** (`MINOR_DEFICIENCY`). Setting aside the already-logged fact that it has
no route back to the yard (`G3.9`), the button that raises it captures *zero* information about what
is actually wrong — live-verified below. Close behind is the **acceptance ceremony's identity check**:
the one piece of the platform with genuine legal weight enforces the ceremony correctly but never
checks that the person running it is the person the quote was addressed to, which is not the C2 bypass
but a distinct hole inside the legitimate path that C2's fix (`G2.3`) will not close.

---

## [JOBS]

### JOBS — The designated authoriser is decorative; anyone holding JOB_ACCEPT can sign a quote addressed to someone else
Severity: High
Location: `src/app/(app)/jobs/[id]/accept/page.tsx:29-37`; `src/app/(app)/jobs/[id]/accept/actions.ts:48-53,125-133`; `src/app/(app)/jobs/[id]/page.tsx:493-504`; contrast `src/app/(app)/jobs/actions.ts:72-83` and `src/app/(app)/jobs/new/page.tsx:118-124`
Found by: workflow-functional-audit — **live-verified**

Description:
The request form makes a point of restricting "Designated authoriser" to people who hold `JOB_ACCEPT`
and labels it *"Who may accept the quote."* (`jobs/new/page.tsx:118-124`), and `createJobRequest`'s own
comment states the intent explicitly: *"Only people who can actually sign appear in the list, so a
quote is never addressed to someone without the authority to accept it"* (`jobs/actions.ts:72-74`).
Nothing downstream enforces the other half of that sentence — that the quote is addressed to *that
specific* person. The accept page's only gate is `hasPermission(user, JOB_ACCEPT)`
(`accept/page.tsx:30`), and both server actions in the ceremony (`requestAcceptanceCode`,
`confirmAcceptance`) call `assertPermission(user, PERMISSIONS.JOB_ACCEPT)` with no comparison to
`job.designatedAuthoriserId` anywhere. The job detail page's "Authorise" panel is shown to any
`JOB_ACCEPT` holder on the same reasoning (`jobs/[id]/page.tsx:493-495`). `JOB_ACCEPT` is held by three
roles at once — OWNERS_REP, PROJECT_MANAGER, CAPTAIN — so this is not a one-in-a-million edge case, it
is the normal shape of the role matrix.

Live reproduction: job `E.2500.10` names `Cara Captain` as authoriser (visible on
`/jobs/{id}`). Logged in as `pm@oceancos.dev` (Pat Manager, PROJECT_MANAGER — not the named
authoriser), the "Authorise" panel and `/jobs/{id}/accept` were both reachable with no gate
(screenshot `1a_job_detail_pm_view.png`, `1b_accept_page_pm.png`); clicking "Accept quote" sent the
real confirmation code to `pm@oceancos.dev`, not to Cara Captain (`1c_code_sent_to_pm.png`, mail
outbox `.mail/1790371585494-flkbrr.json`: *"Hello Pat Manager, Your confirmation code is 505250"*).
Entering that code completed the full ceremony — quote fingerprint check, `APPROVE` audit row, IP/UA
capture, all correct — and the job now reads **Authoriser: Cara Captain** next to **Acceptance —
Quote accepted, Name: Pat Manager** on the same page (screenshot `1e_after_confirm.png`). Nobody is
notified that the accept happened under a different name than the one the quote was addressed to:
`confirmAcceptance` only notifies yard users holding `JOB_COUNTERSIGN` (`accept/actions.ts:233-251`);
neither `job.createdById` nor the original `designatedAuthoriserId` hears about it. The same gate
(`hasPermission(user, JOB_CANCEL)`) is the only check on `rejectQuote`, so the same substitution is
possible for a rejection.

Impact:
The one field the product uses to answer "who is accountable for signing this" can be silently
overridden by any of two other people, using their own name, their own inbox, their own IP address —
and the record this produces (a complete, correctly-formed `APPROVE` audit row) looks exactly like a
legitimate signature to anyone auditing it later, including the resulting job page which visibly
contradicts itself (declared authoriser vs. actual signer). This is distinct from `C2`: it runs through
the *correct* ceremony route with every internal check passing, so fixing `G2.3` (closing the
`transitionJob` side door) does nothing for it.

Suggested fix:
Add `job.designatedAuthoriserId === user.id` to the gates in `accept/page.tsx`, `requestAcceptanceCode`
and `confirmAcceptance` (with an explicit override path for OWNERS_REP if delegation is meant to be
possible), and notify the named authoriser whenever someone else transacts on their behalf.

---

### JOBS — The yard's countersignature carries none of the ceremony or evidentiary weight the client's acceptance does
Severity: Medium
Location: `src/app/(app)/jobs/actions.ts:311-328`; `src/app/(app)/jobs/[id]/page.tsx:466-491`; contrast `src/app/(app)/jobs/[id]/accept/actions.ts:174-231`
Found by: workflow-functional-audit — **live-verified**

Description:
`BRIDGE_ALIGNMENT_PLAN.md` §1.2 lists two "digital acceptance records" of equal standing: *"Quote
Accepted" (client, date, name)* and *"MB92 Accepted" (yard countersign, date, name)*. The client half is
built to that standard: an emailed one-time code, a quote fingerprint bound to the exact figures shown,
IP and user-agent capture, a five-attempt lockout, and an `action: "APPROVE"` audit row
(`accept/actions.ts:174-231`). The yard half — `transitionJob` with `to: "ACCEPTED"` — is the same
generic one-click button as "Cancel quote" or "Mark completed": no confirmation step, no note field, no
second factor, and the audit/history rows are the ordinary `action: "STATUS"` / event `"accepted"`
(`jobs/actions.ts:325-328,366-372`).

Live reproduction: as `yard@oceancos.dev`, the Actions panel for a `CLIENT_ACCEPTED` job shows
"Countersign" as a bare `<button>` with only hidden `jobId`/`to` fields (screenshot
`1f_yard_view_before_countersign.png`); one click moved `E.2500.10` to `ACCEPTED` and the resulting
History entry reads only *"25 Sept 2026, 21:30 · Yara Yard — accepted"* (screenshot
`1g_after_countersign.png`) — no name-typed confirmation, no comment, nothing beyond what any other
status change records.

Impact:
Not a bypass (this is the only route to `ACCEPTED` in the app) but a mismatch between what the product
calls the countersignature and what it actually captures. In a dispute, the client's signature is
well-evidenced and the yard's — the one that commits the yard to the price and starts the works — is a
timestamp with a name, indistinguishable from a routine status change.

Suggested fix:
Give the countersign transition its own action (not the generic `transitionJob`) with a required note
field and an `action: "APPROVE"`-class audit entry, mirroring the client ceremony's evidentiary intent
even without requiring a second factor.

---

### JOBS — "Report minor deficiency" captures zero information about what the deficiency actually is
Severity: High
Location: `src/lib/jobs/workflow.ts:116-127` (`ACTIONS.MINOR_DEFICIENCY` tone `"default"`); `src/app/(app)/jobs/[id]/page.tsx:466-491` (reason input gated on `tone === "danger"`); `src/app/(app)/jobs/actions.ts:322-341` (no `MINOR_DEFICIENCY` branch in `extra`); `prisma/schema.prisma` `Job` model (no deficiency-description column)
Found by: workflow-functional-audit — **live-verified**

Description:
The Bridge's After Sales tab exists to track "Minor deficiencies" as tickets (§1.1); OceancOS's
`MINOR_DEFICIENCY` status is meant to be that ticket. The button that raises it, however, is rendered
exactly like every other non-cancelling transition: the job detail page only shows a free-text `reason`
input when `action.tone === "danger"` (`jobs/[id]/page.tsx:473-479`), and `MINOR_DEFICIENCY`'s tone is
`"default"` (`workflow.ts:126`) — so no field is offered. `transitionJob`'s `extra` object has explicit
branches for `ACCEPTED`, `YARD_COMPLETED`, `WORKS_ACCEPTED` and the two cancellations, but none for
`MINOR_DEFICIENCY` (`jobs/actions.ts:322-341`), so even a client who typed a description into some other
field would have nowhere for it to land — the `Job` model itself has no column for one (`cancelReason`
exists; nothing equivalent for a deficiency does).

Live reproduction: as `captain@oceancos.dev` on `E.2010.10` (`YARD_COMPLETED`), the "Report minor
deficiency" form contains only hidden `jobId`/`to` inputs and the button — no visible field of any kind
(HTML dump captured in `/tmp/audit-scripts/test2_deficiency.ts` output). Clicking it moved the job to
`MINOR_DEFICIENCY`; the only trace anywhere on the record is the fixed system comment *"Client reported
a minor deficiency."* (screenshot `2c_current_state.png`) — the same string every time, for every job,
regardless of what is actually wrong.

Impact:
The yard has no route back into this status anyway (`G3.9`), but even fixing that leaves them with
nothing to act on: the ticket that is supposed to describe a defect describes nothing. A user who wants
to report *what* is wrong has to fall back to the general comment thread, which nothing links to the
deficiency event and which the yard is never notified about (comments notify nobody — already logged,
workflow-logic `[NOTIFICATIONS]`).

Suggested fix:
Add a required description field to the `MINOR_DEFICIENCY` transition (a client component, since the
current button is a bare server-action form) and a `deficiencyNotes`/`details` column to persist it,
surfaced on the job page and in the yard notification this transition should also send (`G3.9`).

---

### JOBS — Cancellation reasons are optional and unenforced, unlike the deficiency gap above they at least have a field
Severity: Low
Location: `src/app/(app)/jobs/[id]/page.tsx:473-479`
Found by: workflow-functional-audit

Description:
The `reason` input shown for `CANCELLED_QUOTE`/`CANCELLED_WORKS` (the only two transitions that get a
text field at all) has no `required` attribute, so a job can be cancelled with the field left blank;
`transitionJob` stores `cancelReason: null` in that case (`jobs/actions.ts:337-340`). A smaller instance
of the same class of gap as the deficiency finding above — the field exists here, it just is not
enforced.

Impact:
A cancelled job's record can carry no explanation at all, which is avoidable friction rather than a
missing capability.

Suggested fix:
Make `reason` `required` for both cancellation transitions.

---

## [CHANGE ORDERS]

### CHANGE ORDERS — Deciding an approval from the Approvals Centre captures no reason, although the identical decision from the change-order page does
Severity: High
Location: `src/app/(app)/approvals/page.tsx:144-156`; contrast `src/app/(app)/change-orders/[id]/page.tsx:248-268`
Found by: workflow-functional-audit — **live-verified**

Description:
Both pages post to the same `decideChangeOrderApproval` action, which accepts an optional `comment`
(`change-orders/actions.ts:140-144,157-165`). The change-order detail page's decision form includes a
`<textarea name="comment">` alongside Approve/Request Info/Reject (`[id]/page.tsx:251-255`). The
Approvals Centre — the page whose whole premise is "every item waiting on a decision, in one queue"
(`approvals/page.tsx:70`) and the primary surface an approver is meant to work from — renders the same
three buttons with **no comment field at all** (`approvals/page.tsx:144-156`): just a hidden
`approvalId` and the three submit buttons.

Live reproduction: as `captain@oceancos.dev`, rejecting `CO-0009`'s `CAPTAIN` stage from
`/approvals` (screenshot `3a_approvals_centre.png`) landed on the change-order page showing
**REJECTED** with no comment anywhere in the approval chain and a history entry reading only
*"APPROVAL — CAPTAIN: REJECTED"* (screenshot `3b_co0009_after_reject_no_comment.png`) — there was
never an opportunity to say why.

Impact:
Reject and Request Info are exactly the two decisions that need an explanation for the requester to act
on (workflow-logic already notes neither decision notifies anyone — `[CHANGE ORDERS] — The approval
chain notifies nobody after the first stage`); from the Approvals Centre there is not even a record of
why, so a requester whose change order comes back rejected has no notification (existing finding) *and*
no reason on the record they eventually find it in. This makes the Approvals Centre measurably worse at
its own stated job than the page it duplicates.

Suggested fix:
Add the same `<textarea name="comment">` to the Approvals Centre's inline form. Since the same server
action already handles it, this is presentation-only.

---

## [CREW REQUESTS]

### CREW REQUESTS — No transition anywhere in the UI has a way to record why, although the server action supports it
Severity: High
Location: `src/app/(app)/crew-requests/[id]/page.tsx:34-44,137-149`; `src/app/(app)/crew-requests/actions.ts:51-98`
Found by: workflow-functional-audit — **live-verified**

Description:
`transitionCrewRequest(id, toStatus, comment?)` accepts an optional `comment` that is written into the
audit details (`crew-requests/actions.ts:80-86`). No caller in the codebase ever supplies one: the
detail page's transition buttons are each their own inline server action closure —
`action={async () => { "use server"; await transitionCrewRequest(cr.id, t.to); }}`
(`[id]/page.tsx:141`) — with no form fields, so `comment` is always `undefined`. This is true for every
transition including `REJECTED` and `BLOCKED`, the two whose entire point is that someone needs to know
why.

Live reproduction: as `pm@oceancos.dev` on `REQ-0001`, the "Workflow Actions" panel's rendered HTML for
every button (Start Work, Mark Blocked, Await Approval, Complete, Reject, …) contains nothing but
server-action reference fields — no visible input of any kind (captured via
`/tmp/audit-scripts/test4_crew.ts`; screenshot `4a_crew_request_detail.png`).

Impact:
Rejecting or blocking a crew request is, per the existing audit, "a real decision with a cost and
schedule impact attached" (workflow-logic `[CREW REQUESTS]`); the requester is notified of the bare
status change (`crew-requests/actions.ts:87-95`) with nothing explaining it, and there is no comment
thread entry created either — a user has to separately think to post a comment, which nothing prompts
or requires.

Suggested fix:
Add an optional (required for `REJECTED`/`BLOCKED`) reason field to each transition form and thread it
through to `transitionCrewRequest`'s existing `comment` parameter.

---

### CREW REQUESTS — The assignee picker offers every active user on the platform, with no filter for role or relevance
Severity: Medium
Location: `src/app/(app)/crew-requests/[id]/page.tsx:31,152-166`; `src/app/(app)/crew-requests/new/page.tsx:17,97-102`; `src/app/(app)/crew-requests/actions.ts:100-126`
Found by: workflow-functional-audit — **live-verified**

Description:
Both the creation form and the detail page's "Assignment" panel populate the `assignedToId` `<select>`
from `prisma.user.findMany({ where: { active: true } })` — every active account, unfiltered by role,
permission or project. `assignCrewRequest` performs no validation on the chosen id either
(`crew-requests/actions.ts:100-108`).

Live reproduction: the dropdown on `REQ-0001` ("Generator 2 oil leak") lists — verbatim —
*"— Unassigned, Alex Owner, Cara Captain, Carl Class, Charlie Crew, Connor Contractor, Ed Engineer, Fin
Finance, Flo Flag, Pat Manager, Robin Rep, Tess Tech, Yara Yard"*. Several of those (`Carl Class` /
CLASS_SURVEYOR, `Flo Flag` / FLAG_SURVEYOR, `Connor Contractor` / CONTRACTOR, `Fin Finance` / FINANCE,
`Alex Owner` / OWNER) hold no crew-request permission at all and have no plausible business fixing a
generator oil leak.

Impact:
Distinct from the already-logged permission and scoping gaps (`C4`, workflow-logic
`[CREW REQUESTS] — Four of nine transitions require no permission`): even a fully scoped, fully
permission-checked version of this picker would still be useless, because it carries no signal about
who is actually able to do the work. On a real project this list would run into dozens of accounts and
the person triaging would have to know everyone's job by name.

Suggested fix:
Filter the option list to users holding a crew-relevant permission (or an explicit "crew" role group) on
the request's project.

---

### CREW REQUESTS — The creation form's own caption is wrong whenever "Assign To" is filled in on the same form
Severity: Low
Location: `src/app/(app)/crew-requests/new/page.tsx:97-102,135-138`; `src/app/(app)/crew-requests/actions.ts:13-29`
Found by: workflow-functional-audit

Description:
The footer text next to "Create Request" reads: *"The request will be created in **New** status and
routed for triage."* (`new/page.tsx:136-138`). `createCrewRequest` sets
`status: data.assignedToId ? "ASSIGNED" : "NEW"` (`actions.ts:27`) — if the same form's "Assign To"
field (directly above, `new/page.tsx:97-102`) is filled in, the request is created straight into
`ASSIGNED`, silently skipping triage, contradicting the caption the user just read.

Impact:
Small, but it means the one piece of explanatory copy on the form describes the wrong behaviour for
anyone who uses the assignment field it sits next to — arguably the more common path, since the
requester often already knows who should take it.

Suggested fix:
Make the caption conditional on whether an assignee is selected, or move triage-skipping into an
explicit, separate confirmation rather than an implicit side effect of a dropdown choice.

---

## [APPROVALS]

### APPROVALS — The Approvals Centre has no view permission check at all, unlike every sibling list page
Severity: High
Location: `src/app/(app)/approvals/page.tsx:24-61`; contrast `src/app/(app)/change-orders/page.tsx:20-29` and `src/app/(app)/crew-requests/page.tsx:19-27`
Found by: workflow-functional-audit — **live-verified**

Description:
`/change-orders` and `/crew-requests` both open with `if (!hasPermission(user, CO_VIEW/CR_VIEW))
return <EmptyState .../>`. `/approvals/page.tsx` has no equivalent: after `requireUser()` it goes
straight into three unguarded queries (lines 32-61). The "Pending with Other Approvers" section in
particular is built from `changeOrderApproval.findMany` filtered only by `stage: { notIn: myStages }`
— `myStages` being whichever `CO_APPROVE_*` permissions the viewer happens to hold, which can be zero —
with no `CO_VIEW` check anywhere in the function. This is a different shape from the already-logged `C4`
project-scoping gap (which assumes the viewer legitimately holds `CO_VIEW` but for the wrong project):
here the viewer holds no change-order permission whatsoever.

Live reproduction: `crew@oceancos.dev` (role CREW, which holds no `CO_VIEW` and is correctly shown
"Access restricted" at `/change-orders`) opened `/approvals` and saw the full "Pending with Other
Approvers" table anyway: nine live change orders by number, title, status and exact estimated cost
(`CO-0001` €38,000, `CO-0006` €12,400, `CO-0007` €132,000, …) — screenshot
`5a_approvals_as_contractor.png` (filename predates switching the test account to `crew@`; content is
Charlie Crew / CREW).

Impact:
A page whose entire purpose is routing decisions to the people authorised to make them exposes the
underlying financial data to anyone logged in, regardless of whether they hold any change-order
permission anywhere else in the product. Related to, but distinct from, auth-security's Low finding that
the sidebar lists Approvals for every role with no filter (`[RBAC] — The sidebar offers every
destination to every user`) — that finding is about the *link* being shown; this is about the *content*
being served once they click it.

Suggested fix:
Gate the page on `hasPermission(user, PERMISSIONS.CO_VIEW)` (or an equivalent that also covers
`CR_VIEW` for a future crew-request queue) before running any query, matching the pattern already used
by every sibling list page.

---

## Notes for the orchestrator

- Live test artefacts from this pass, kept out of the repo per instructions:
  `/tmp/audit-scripts/*.ts` (drivers) and `/tmp/audit-scripts/screenshots/1a…5a_*.png` (this pass's
  screenshots; the many role-sweep screenshots already present in that directory predate this session
  and are not evidence for any finding here).
- Two dev-database records were changed by live testing, as the brief allows: job `E.2500.10` is now
  `ACCEPTED` (accepted by Pat Manager, countersigned by Yara Yard), job `E.2010.10` is now
  `MINOR_DEFICIENCY`, and change order `CO-0009`'s `CAPTAIN` approval stage is now `REJECTED` (which,
  per `C7`, means `CO-0009` can still reach `APPROVED` once the other four stages approve — left as-is
  since it is a live demonstration of an already-logged Critical, not a new mutation to revert).
- Confirmed **not** a defect: the client acceptance ceremony's own internal mechanics (code hashing,
  fingerprint, lockout) worked exactly as `AUDIT_REPORT.md` §7 already records — the gap found here is
  entirely about *who* is allowed to start it, not how it runs once started.
