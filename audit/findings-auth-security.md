# Findings — auth & security

Scope: login, session handling, RBAC, route guards, token expiry, secrets, password reset, upload
authorisation, multi-tenancy/project scoping, the acceptance-code flow, and privilege-escalation paths.

Counts — Critical: 6 · High: 5 · Medium: 7 · Low: 2 (20 total)

> The sub-agent that produced these could not write this file (the harness blocks sub-agent writes to
> report paths), so the orchestrator saved it. The six Critical findings and the two Medium RBAC
> findings marked **[verified]** were independently re-checked against the source by the orchestrator
> before being recorded.

---

### [AUTH] — Working owner credentials are printed on the public login page **[verified]**
Severity: Critical
Location: src/components/auth/DemoHint.tsx:7-28, rendered unconditionally at src/app/login/page.tsx:122; seed at prisma/seed.ts:115-131
Found by: auth-security

Description:
The login page renders a "Demo access" panel telling any anonymous visitor to sign in as
`owner@oceancos.dev` with the password `password`. There is no environment guard — no `NODE_ENV`
check, no feature flag, no opt-in. It ships to production exactly as it ships to development. The
component's own docstring asserts it is "not a security concern", which is incorrect. The seed hashes
the single literal `"password"` once and assigns that hash to all twelve seeded accounts (owner, rep,
pm, captain, eng, crew, yard, finance, tech, class, flag, contractor), so the disclosed password is
valid for every role, not only the one named.

Impact:
Total authentication bypass for anyone who loads the login page. An anonymous visitor gets an OWNER
session, and by substituting any of the other eleven addresses gets FINANCE (budgets, confidential
documents), YARD_PM (countersigning), OWNERS_REP (approvals, project editing) and every other role.
With no login rate limiting and no role holding `admin.users`, there is no compensating control and no
way for an operator to notice from inside the app.

Suggested fix:
Delete the `<DemoHint />` render and the component. If a demo aid is wanted, gate it on an explicit
opt-in env var unset by default (`if (process.env.OCEANCOS_DEMO_MODE !== "1") return null`), never on
`NODE_ENV` alone. Separately, make the seed generate a random password per user, print it to the
console, and force a change on first sign-in.

---

### [ACCEPTANCE] — `transitionJob` accepts `CLIENT_ACCEPTED`, bypassing the confirmation-code ceremony **[verified]**
Severity: Critical
Location: src/app/(app)/jobs/actions.ts:310-388; enabled by src/lib/jobs/workflow.ts:24-51 and :137
Found by: auth-security

Description:
Acceptance is built as a three-step signature: review, request an emailed code, confirm. That path
enforces four things `transitionJob` does not — the linked change order must have cleared its approval
chain, the code must verify, the quote fingerprint must match, and `clientAcceptedAt` /
`clientAcceptedById` get written. `transitionJob` performs only `assertPermission(user,
JOB_TRANSITION_PERMISSION[to])` and `assertTransitionJob(job.status, to)`. `CLIENT_ACCEPTED` maps to
`JOB_ACCEPT` and is a legal target of both `QUOTE_SENT` and `EXPIRED`, so both checks pass. The only
thing keeping it out of reach is `NOT_OFFERED` (workflow.ts:137), a UI-layer filter with no
server-side counterpart. The detail page already renders a `<form action={transitionJob}>`, so the
action id is in the client bundle and can be re-posted with `to=CLIENT_ACCEPTED`.

Impact:
Any holder of `job.accept` can commit the vessel to a quote's full value without the emailed code,
without the change order being approved, and without the fingerprint check that exists to prove the
price was not altered. The resulting record is unsigned: `transitionJob` never sets
`clientAcceptedAt`/`clientAcceptedById`, so the job sits in `CLIENT_ACCEPTED` with no acceptor, no IP
and no `quoteHash` in the audit log, and the quote PDF prints "Name: —" and "Date: —" for a job the
yard is about to countersign and invoice. This defeats the purpose of the whole flow.

Suggested fix:
Move `NOT_OFFERED` into the server rule module as an exported `JOB_TRANSITIONS_REQUIRING_CEREMONY` and
have `transitionJob` reject any status in it, so the screen and the server cannot disagree — which is
what workflow.ts's own header comment claims the module already guarantees.

---

### [UPLOADS] — Any signed-in user can download any stored file by object key
Severity: Critical
Location: src/app/api/uploads/local/route.ts:53-76; src/lib/storage/index.ts:188-190
Found by: auth-security

Description:
The GET handler checks only that a session exists and that the key is syntactically safe. It never
looks up the owning `Attachment` or `Document`, never checks project access, never checks a
permission. Keys are structured and predictable — `projects/<projectId>/<resource>/<resourceId>/<16
hex>-<filename>` — and `projectId`/`resourceId` appear in ordinary URLs, so only the random segment is
unguessable, and that segment is handed to the client on upload and stored in `Attachment.storageKey`
which attachment lists read back. The S3 path is worse: with `S3_PUBLIC_BASE_URL` set, `downloadUrl`
returns the bucket URL with no signature and no expiry, readable without any session.

Impact:
A CONTRACTOR, SUPPLIER or GUEST can fetch drawings, contracts, invoices, photographs and minutes
belonging to projects they have no access to. The `document.view.confidential` permission, the project
scoping on `/api/uploads/sign` and the confidential filter on the documents page are all bypassed,
because none of them sit on the download path.

Suggested fix:
Resolve the key to its owning record before serving bytes: look up the attachment by `storageKey`,
derive the owning project, and require both project access and the relevant view permission; 404
otherwise. Apply the same check before minting an S3 signed URL, and stop using `S3_PUBLIC_BASE_URL`
for anything not deliberately public.

---

### [RBAC] — Change-order transitions and approvals have no record-level or project-level check **[verified]**
Severity: Critical
Location: src/app/(app)/change-orders/actions.ts:62-137, :139-211
Found by: auth-security

Description:
`transitionChangeOrder` loads by id, checks the permission for the *target status* and that the move is
legal. It never calls `listProjectsForUser`, never compares `co.projectId`, never checks `CO_VIEW`.
`decideChangeOrderApproval` is the same shape: loads the approval by client-supplied id, checks only
the stage permission, writes the decision. Two further defects sit inside it: `decision` is read as a
raw string and cast rather than parsed (`ApprovalDecisionSchema` exists in validators.ts and is
unused), so any string is written to the database; and there is no guard that the approval is still
`PENDING`, so a settled approval can be re-decided any number of times.

Impact:
Cross-project privilege escalation on the governance record. Any CAPTAIN can approve the captain stage
on a vessel they have nothing to do with; any FINANCE user can approve the finance stage anywhere; any
`CO_CANCEL` holder can cancel any change order. The re-decision hole lets one approver reverse a
rejection and drive a change order to APPROVED with an approved cost — and an approved change order is
exactly what unblocks quote acceptance, so this is a route to authorising spending the chain rejected.

Suggested fix:
Add a `loadChangeOrder(userId, id)` helper mirroring `loadJob` and call it from
`transitionChangeOrder`, `decideChangeOrderApproval` and `addChangeOrderComment`. Parse the form with
`ApprovalDecisionSchema`, reject when `approval.decision !== "PENDING"`, and reject when an
earlier-ordered required approval is still pending so stages cannot be decided out of sequence.

---

### [TENANCY] — Project scoping is absent everywhere outside the jobs subtree **[verified]**
Severity: Critical
Location: change-orders/page.tsx:31; change-orders/[id]/page.tsx:40-41; crew-requests/*; documents/page.tsx:16; financials/page.tsx:22; drawings, inventory, logistics, meetings, risks, schedule, contractors, suppliers; search/page.tsx:46-71
Found by: auth-security

Description:
`src/lib/project.ts` implements a complete scoping model and only the jobs subtree uses it. Everything
else queries globally: `change-orders/page.tsx` builds `const where: any = { archivedAt: null }` with
no project term; `documents/page.tsx` is `findMany({ where: { archivedAt: null }, take: 500 })`;
`financials/page.tsx` loads all budgets. Detail pages load straight by id with no ownership test.
Search queries seven resources with only a text filter. The seeded data hides this: every seeded
`UserRole` has `projectId` and `vesselId` NULL, so every user currently resolves to "all projects"
through the unscoped branch. The first genuinely scoped role assignment silently does not apply
anywhere except jobs.

Impact:
A user assigned to one vessel's refit reads every other vessel's change orders, budgets, documents,
risks, inventory, schedule, minutes and crew requests, from the ordinary list pages, with no URL
tampering. For a platform whose premise is several owners, yards and contractors sharing one system,
this is a cross-tenant data breach by default.

Suggested fix:
Introduce one scoping helper and apply it to every list query
(`projectId: { in: (await listProjectsForUser(user.id)).map(p => p.id) }`), and follow the jobs detail
pattern on every detail page. Records with a nullable `projectId` need an explicit policy rather than
matching everything. Consider `scopedFindMany` wrappers so a new page cannot forget.

---

### [RBAC] — Crew-request transitions accept several statuses with no permission check **[verified]**
Severity: Critical
Location: src/app/(app)/crew-requests/actions.ts:50-97, :99-125, :127-143
Found by: auth-security

Description:
`transitionCrewRequest` checks permissions for only four of the nine target statuses — `CR_TRIAGE` for
TRIAGED and ASSIGNED, `CR_COMPLETE` for COMPLETED and CLOSED. There is no `else`. IN_PROGRESS,
BLOCKED, AWAITING_APPROVAL, REJECTED and NEW fall through with no check at all, reaching the legality
table and then the update. There is no `CR_VIEW` check to enter the function and no project scoping.
`assignCrewRequest` and `addCrewRequestComment` share the scoping gap; the latter has no permission
check whatsoever and no check that the id exists.

Impact:
Any authenticated user — including SUPPLIER, whose entire permission set is `["document.view"]`, and
GUEST — can reject, block or progress any crew request on any project by posting to the action.
Requests awaiting triage can be silently killed with REJECTED, and REJECTED → NEW can resurrect them.

Suggested fix:
Make the permission table exhaustive and fail closed with a
`Record<CrewRequestStatus, PermissionKey>` mirroring `JOB_TRANSITION_PERMISSION`, which does cover
every status. Add `CR_VIEW` and a project-scope check to all four crew-request actions.

---

### [RATE-LIMIT] — No rate limiting or lockout exists anywhere in the application
Severity: High
Location: src/app/login/page.tsx:13-27; src/app/forgot/page.tsx:22-66; src/app/(app)/jobs/[id]/accept/actions.ts:47-121; all of src/app/api/
Found by: auth-security

Description:
Nothing throttles anything outside the per-challenge `attempts` column on `AcceptanceChallenge`. Login
does a lookup, a bcrypt compare and a redirect, with no per-account or per-IP counter, no delay, no
lockout; `User` has no `failedLoginCount` or `lockedUntil`. Password reset creates a token and sends an
email on every submission with no cap. The acceptance-code request supersedes the previous challenge
and sends a fresh email on every submission with no cap. No API handler limits anything, and the PDF
routes launch a headless Chromium per request with `maxDuration = 60`.

Impact:
Online password guessing is unbounded. Password-reset flooding lets anyone mailbomb a known address.
Acceptance-code flooding denies an authoriser the ability to accept at all, because each request
invalidates the previous code — a genuine code can be killed by a racing request before it is typed.
The uncapped PDF routes are a cheap denial of service: each spawns a browser and holds it up to 60
seconds.

Suggested fix:
Add a shared limiter (a `RateLimit` table keyed on bucket + identifier + window) at four points: login
keyed on email and IP with exponential lockout; password reset keyed on email and IP; acceptance-code
request keyed on user + job; and a per-session cap on the PDF routes. Return the same generic message
on a limited login as on a wrong password so the limiter is not itself an enumeration oracle.

---

### [TENANCY] — Change-order spreadsheet export returns every project's data when there is no active project
Severity: High
Location: src/app/api/export/change-orders/route.ts:13-19, :34-35
Found by: auth-security

Description:
`loadRows(projectId?)` builds `where: projectId ? { projectId } : undefined` — with no project the
`findMany` has no filter and returns every change order in the database. The caller passes
`project?.id` from `getActiveProject`, which returns `null` when the user can reach no project. The one
case that should yield nothing yields everything. The jobs export gets this right and returns 404, so
the two endpoints disagree.

Impact:
A user whose role assignments name a project they have lost access to, or a scoped user misconfigured
with neither project nor vessel, downloads a spreadsheet of every change order across every vessel:
numbers, titles, vessel names, statuses, departments and — with `financial.view` — costs. One GET, no
parameters.

Suggested fix:
Return 404 when there is no active project, and better, scope to the user's full reachable set. Make
`loadRows` take a required array so the "no filter" state is unrepresentable.

---

### [TENANCY] — Change-order print view and PDF export are not project-scoped, and GUEST holds `change_order.view`
Severity: High
Location: src/app/print/change-orders/[id]/page.tsx:16-27; src/app/api/export/change-orders/[id]/route.ts:21-32
Found by: auth-security

Description:
The print page requires a session and `CO_VIEW`, then loads by id with no check that the caller can
reach `co.projectId`. The PDF route is the same. The sibling job print page does call
`listProjectsForUser` and 404 on a mismatch, so the omission is specific to change orders. `CO_VIEW` is
a weak gate: granted to GUEST, CONTRACTOR, YARD_TRADE_LEAD, CLASS_SURVEYOR and FLAG_SURVEYOR.

Impact:
A GUEST or CONTRACTOR can render or download the full change-order document for any project: title,
description, reason, risk and technical impact, the complete approval chain with names and dates, and
with `financial.view`, costs. One id in the URL is the whole attack.

Suggested fix:
Add the two lines the jobs print page already uses, to both files, and return 404 rather than 403 so
the endpoint does not confirm an id exists.

---

### [TENANCY] — `projectId` is taken from the client form when creating change orders and crew requests
Severity: High
Location: src/app/(app)/change-orders/actions.ts:25-60; crew-requests/actions.ts:12-48; validators.ts:9-10, 28-29
Found by: auth-security

Description:
Both create schemas declare `projectId: z.string().min(1)` and both actions spread the parsed result
straight into `prisma.create`. Zod validates the string is non-empty; nothing validates the caller may
reach that project, and the value arrives in a hidden form field. `createJobRequest` does not have this
problem — it derives the project from `getActiveProject` and ignores any client value.

Impact:
Any user with `change_order.create` or `crew_request.create` can plant records into another owner's
project, each spawning a full approval chain and firing `APPROVAL_REQUIRED` notifications at that
project's approvers. Both a data-integrity breach and a way to spam another tenant.

Suggested fix:
Drop `projectId` from both schemas and derive it server-side. If it must be chosen per record,
validate it against `listProjectsForUser`. The same applies to `vesselAreaId`, `assignedToId` and
`linkedChangeOrderId`, none of which are checked against the project either.

---

### [RBAC] — `updateProjectAction` edits any project by id, with no scope check
Severity: High
Location: src/app/(app)/admin/projects/actions.ts:21-79
Found by: auth-security

Description:
The action requires `PROJ_EDIT`, then takes the project id from the form, loads it and updates it
without consulting `listProjectsForUser`. `PROJ_EDIT` is held by OWNERS_REP and PROJECT_MANAGER, roles
explicitly intended to be project-scoped.

Impact:
A project manager assigned to one refit can rewrite another vessel's project code, yard name,
currency and all four yard-period dates. Those dates drive the dashboard timing cards and the
time-progress ring, and the currency is inherited by every job created afterwards, so the damage
propagates. Changing another tenant's code can also collide with or steal an identifier, since
`Project.code` is globally unique.

Suggested fix:
After loading, check `listProjectsForUser` contains the id. `storeActiveProject` already does exactly
this check for a far lower-stakes operation — the pattern exists and is simply not applied here.

---

### [UPLOADS] — Attachment records accept arbitrary client-supplied storage keys
Severity: High
Location: src/app/(app)/jobs/actions.ts:504-544, called at :117 and :465
Found by: auth-security

Description:
`attachUploads` reads the `attachments` field, `JSON.parse`s each entry and writes `storageKey` into
`Attachment`. The only validation is `typeof row.key === "string"`. The key is never checked against
`isSafeObjectKey`, never verified to have been issued by `/api/uploads/sign` for this user, never
checked to start with this project's prefix, and `filename`, `mimetype` and `size` are taken on trust —
so a recorded MIME type can contradict the allowlist, which is enforced only at sign time.

Impact:
A user can attach another project's file to a job in their own project by pasting that key into the
hidden field, then read it through the attachment UI — laundering a key they should not be able to use
into a record they may view. With the unscoped download route above, cross-project file access becomes
a visible feature rather than a crafted request. An unchecked mimetype also means a file recorded as
`application/pdf` is offered to other users from the app's own origin.

Suggested fix:
Validate each key: run `isSafeObjectKey`, require the project prefix, re-derive the mimetype against
the allowlist. Stronger: have `/api/uploads/sign` record a short-lived `PendingUpload` row keyed on the
object key and signing user, and have `attachUploads` consume it, so only a key this server issued to
this user can be attached.

---

### [SECRETS] — A default fallback secret backs the acceptance-code hash and the local upload token
Severity: Medium
Location: src/lib/jobs/acceptance.ts:26-29; src/lib/storage/index.ts:112-115, :121
Found by: auth-security

Description:
Both security-relevant hashes fall back to the literal `"dev-secret"` when `SESSION_SECRET` is absent,
with no failure and no warning, so a deployment that forgets the variable runs on a secret published in
this repository. Two secondary weaknesses sit on the same code: `verifyLocalUploadToken` compares with
`===` rather than `timingSafeEqual` (its comment conflates length-safety with timing-safety, while the
acceptance code is compared correctly); and `hashAcceptanceCode` is a single unsalted SHA-256 over
`challengeId:code:secret`, so with a known secret and the challenge id from the URL all 10^6 codes
enumerate in under a second from a database dump.

Impact:
If `SESSION_SECRET` is unset or left at a repo value, anyone reading this source can mint valid
`/api/uploads/local` PUT tokens without a session, writing files anywhere under the upload root; and
anyone with database read access can recover acceptance codes and forge the signature on money this
module exists to protect.

Suggested fix:
Remove both fallbacks and fail fast at module load. Use `timingSafeEqual` in
`verifyLocalUploadToken`. Replace the raw SHA-256 with an HMAC, the correct primitive for a keyed
digest. Document `SESSION_SECRET` as required.

---

### [SSRF] — PDF export trusts the Host header and hands the caller's session cookie to whatever host it names
Severity: Medium
Location: src/lib/export/pdf.ts:105-110, :40, :50-61; callers in both `[id]` export routes
Found by: auth-security

Description:
`appBaseUrl` prefers `APP_URL` but falls back to the incoming `Host` header. `APP_URL` is unset in
`.env` and empty in `.env.example`, so the fallback is the default path. The resulting URL is passed to
`renderPdf`, which launches Chromium with `--no-sandbox`, sets the caller's `oc_session` cookie for
that hostname, and navigates.

Impact:
An attacker who can set `Host` makes the server's headless browser fetch an arbitrary URL and present
`oc_session` to it — server-side request forgery from inside the deployment's network boundary (cloud
metadata, internal admin services), by a sandbox-disabled browser, plus delivery of a live session
cookie to an attacker-named domain. The error branch then returns `err.message` to the caller, leaking
what the fetch revealed.

Suggested fix:
Require `APP_URL` for the PDF routes and remove the Host fallback, or validate against an allowlist.
Never attach the session cookie unless the host matches `APP_URL` exactly. Drop `--no-sandbox` unless
the container cannot support a sandbox, and return a generic message to the client.

---

### [SESSION] — No rotation on login, no idle timeout, and expired sessions are never purged
Severity: Medium
Location: src/lib/auth.ts:6-7, :24-36, :47-74
Found by: auth-security

Description:
Session handling is otherwise sound: 256 bits of CSPRNG entropy, `httpOnly`, `sameSite: "lax"`,
`secure` in production, server-side expiry on every read, `user.active` re-checked per request,
permissions re-derived per request so a role change takes effect immediately, logout deletes the row,
and password reset revokes all sessions. Those are the hard parts and they are right. Three gaps
remain: `createSession` never invalidates the caller's existing session, so a token captured before
sign-in stays valid for its full 14 days alongside the new one; the 14-day TTL is fixed at creation
with no idle cutoff; and expired rows are filtered at read time but never deleted, so the table grows
without bound and every expired token stays on disk.

Impact:
Session fixation is unmitigated. A token stolen from a shared bridge terminal is good for a fortnight
of inactivity. A database leak hands an attacker the full history of tokens to correlate.

Suggested fix:
Delete the caller's existing sessions before `createSession`. Add a sliding `lastSeenAt` with an idle
cutoff alongside the absolute expiry, and a scheduled purge. When a change-password screen is built,
revoke all other sessions in the same transaction, as the reset flow already does.

---

### [AUTH] — Login reveals whether an email is registered through response timing
Severity: Medium
Location: src/app/login/page.tsx:20-23; src/app/forgot/page.tsx:34-65
Found by: auth-security

Description:
When the address is unknown the login action redirects immediately; when it exists it runs a bcrypt
compare at cost 10 first — a consistent extra 60-100ms on the real-account path. The message is
correctly identical; the timing is not. The reset flow was written with this hazard in mind and says so
in a comment, but has the same shape: the real branch performs an `updateMany`, a `create`, an email
send and an audit write while the unknown branch does nothing.

Impact:
An attacker can enumerate valid accounts — which crew, which yard staff, which surveyors — without any
successful login, from either endpoint. That is the input list for credential stuffing and targeted
phishing, and it is also a crew roster, which the reset flow's own comment identifies as something the
product does not want to leak.

Suggested fix:
Always run a bcrypt compare on login against a constant dummy hash when the user is not found. Move
reset token creation and email off the request so both branches return in the same time. Rate limiting
both endpoints also blunts enumeration.

---

### [RBAC] — The admin user directory is gated on `audit.view`, and no role is granted `admin.users`
Severity: Medium
Location: src/app/(app)/admin/page.tsx:13-24; src/lib/rbac.ts:71-73, :81-197
Found by: auth-security

Description:
The admin page admits anyone holding either `ADM_USERS` or `AUDIT_VIEW`, then loads the full user list
with roles unconditionally, with only the audit-log query conditioned on `AUDIT_VIEW`. `ADM_USERS`,
`ADM_ROLES` and `ADM_SETTINGS` are defined but appear in no role's list, so the `ADM_USERS` half of
the guard is dead code and the effective gate is `AUDIT_VIEW`, held by OWNER, OWNERS_REP,
PROJECT_MANAGER and AUDITOR.

Impact:
An AUDITOR — read-only by design — and every project manager sees the complete user directory for the
whole platform including external parties, with email addresses and role assignments: precisely the
roster the reset flow takes care not to leak. There is a matching operational gap: because no role
holds these permissions and no action exists to create users or assign roles, user administration
cannot be done through the application at all.

Suggested fix:
Load and render users, vessels and departments only under `ADM_USERS`, and the audit log only under
`AUDIT_VIEW`, rather than admitting on either and rendering everything. Grant the admin permissions to
a real administrator role. When user-management actions are written, guard role assignment carefully —
an unguarded assign-role action is the most direct privilege-escalation path a system like this has.

---

### [RBAC] — Comment actions have no view permission, no scope check and no existence check **[verified]**
Severity: Medium
Location: src/app/(app)/change-orders/actions.ts:213-229; crew-requests/actions.ts:127-143
Found by: auth-security

Description:
`addChangeOrderComment` requires only `requireUser()`. It does not check `CO_VIEW`, does not check
project access, and does not verify the parent exists — `resourceId` and `changeOrderId` are written
straight from the form. `addCrewRequestComment` is identical. `addJobComment` gets it right: it asserts
`JOB_COMMENT` and calls `loadJob`.

Impact:
Any signed-in user, including SUPPLIER and GUEST, can post a comment onto any change order or crew
request on any project, attributed to them and visible to everyone who can read the record — an
injection route into another tenant's workspace, and a way to write unbounded attacker-controlled text
against ids that need not exist.

Suggested fix:
Assert the view permission, load the parent, verify project access, and reject when the parent does not
exist rather than creating an orphan row.

---

### [RBAC] — The suppliers page has no permission check **[verified]**
Severity: Medium
Location: src/app/(app)/suppliers/page.tsx:8-10; src/app/(app)/search/page.tsx:66
Found by: auth-security

Description:
Every other page under `(app)` follows `requireUser()` with a `hasPermission` test. This one calls
`await requireUser()` and immediately queries all suppliers. There is no supplier permission in
`PERMISSIONS` at all — the resource was never given one. The search page reaches the same data the same
way: the supplier branch is the only one of eight not wrapped in a permission condition.

Impact:
Every authenticated user, including GUEST, CONTRACTOR and — pointedly — SUPPLIER, reads the full
supplier list with names, contacts, emails and phone numbers: a competitor-visible commercial
relationship list and personal contact data, exposed to the lowest-trust roles on the platform.

Suggested fix:
Add a `SUP_VIEW` permission, grant it to the roles that need it, and guard both the page and the search
branch, mirroring how `CON_VIEW` already guards contractors.

---

### [AUTH] — Reset tokens travel in the URL path and are re-echoed into error redirects
Severity: Low
Location: src/app/reset/[token]/page.tsx:28, :33, :125; src/app/forgot/page.tsx:51
Found by: auth-security

Description:
The reset link is `/reset/<token>`, so the secret sits in the URL path, and `completeReset` redirects
back to `/reset/${token}?err=...` on every validation failure. The token design itself is good — 32
random bytes, only the hash stored, single use, 60 minutes, prior resets superseded, all sessions
revoked on completion. The weakness is purely the transport.

Impact:
URL paths land in reverse-proxy access logs, browser history and, if the page ever loads anything
third-party, the `Referer` header. Anyone with log access can replay a live token within its hour.

Suggested fix:
Serve the form at a static `/reset` and carry the token in a short-lived `httpOnly` cookie, or accept
it as a POST body field only. At minimum drop the token from error redirects. Note that the root layout
loads Google Fonts on every page including this one.

---

### [RBAC] — The sidebar offers every destination to every user
Severity: Low
Location: src/components/layout/Sidebar.tsx:28-48, :66-75
Found by: auth-security

Description:
`NAV` is a flat constant of nineteen entries rendered with no permission filter. The component is a
client component receiving only `unread`, so it has no access to permissions. Every user sees
Financials, Admin, Projects, Approvals, Drawings and the rest. The pages themselves do guard, so this
is presentation rather than an access-control hole on its own.

Impact:
Discloses the full feature map to roles holding almost nothing — SUPPLIER can reach one of the nineteen
— and makes the app feel broken: nine links in a row each answering "Forbidden".

Suggested fix:
Pass the permission set down from the layout (which already passes `roleKeys` to `TopBar`, so the
plumbing exists) and attach a `permission` to each entry, filtering before render. Keep every
server-side guard regardless — hiding a link is not a control.

---

## Answers to the specific questions asked

1. **Logged-out access.** No. Every `(app)` page is covered by `requireUser()` in the group layout,
   both print pages call it directly, all five API handlers return 401. The weakness is structural:
   there is no `middleware.ts`, so the guarantee rests on each route outside `(app)` remembering to
   guard itself.
2. **Lower-privilege reaching higher-privilege.** Yes, in six places. The common pattern is a server
   action that checks a *global* permission but never checks the *record*.
3. **Rate limiting.** None exists anywhere.
4. **Session handling.** Expiry, revocation on reset, `active` re-check and per-request permission
   derivation are correct. Missing: rotation, idle timeout, purge.
5. **Secrets.** Nothing hardcoded in source and `.env` is correctly untracked, but a default fallback
   secret backs two security-relevant hashes and a working owner password ships in the client bundle.
6. **Multi-tenancy.** `listProjectsForUser` is applied only in the jobs subtree and the upload sign
   path. Everything else is global.
7. **Acceptance-code flow.** The ceremony itself is well built — codes bound to the challenge,
   `timingSafeEqual`, five attempts, consumed on success, ten-minute expiry, bound to job and user, and
   a quote fingerprint. Its weaknesses are all external: it can be skipped entirely via
   `transitionJob`, code requests are unlimited and each invalidates the last, and the hash is an
   unsalted SHA-256 over a potentially default secret.
