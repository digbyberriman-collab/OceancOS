# forms-validation — audit findings

## Count by severity
- **Critical: 4**
- **High: 9**
- **Medium: 11**
- **Low: 7**
- Cosmetic: 0

## Three most serious
1. **[REQUIRED-FIELDS] — Leaving the optional "Due Date" blank rejects the entire crew request** (Critical)
2. **[REQUIRED-FIELDS] — Unselected optional dropdowns are stored as `""`, and one of them violates a foreign key** (Critical)
3. **[VALIDATION-MESSAGES] — There is no error boundary, so every server-side validation failure is a crash page** (Critical)

---

# Forms & Validation — audit findings

Scope: every form in OceancOS and its validation on client and server.
Auditor: forms-validation. All findings verified by reading source; zod coercion behaviours verified by executing the project's own `zod` build against the exact schemas used.

---

### [DOUBLE-SUBMIT] — No form anywhere in the application has a pending or disabled state
Severity: High
Location: all 28 server-action forms; `src/components/ui/Form.tsx`; see list below
Found by: forms-validation

Description:
A grep for `useFormStatus`, `useFormState`, `useActionState`, `useTransition`, `aria-busy` and `disabled=` across `src/` returns exactly one hit: `src/app/(app)/jobs/[id]/accept/page.tsx:261`, and that `disabled` is a static governance gate (`disabled={Boolean(coBlocking)}`), not a submission state. Only six files in the entire tree carry `"use client"` (`Donut.tsx`, `StepArea.tsx`, `ProjectSwitcher.tsx`, `Sidebar.tsx`, `Nav.tsx`, `FileDrop.tsx`) — none of them is a submit button. Every `<form action={…}>` in the app is therefore a pure server-component form whose button stays live, un-greyed and un-spinnered for the entire round trip, including the ones that take several database writes plus an outbound email.

Forms affected and the real consequence of a second click:

| Form | Action | Consequence of a double click |
|---|---|---|
| `jobs/[id]/page.tsx:337` comment | `addJobComment` | **Two identical comments posted.** No guard at all. |
| `change-orders/[id]/page.tsx:308` comment | `addChangeOrderComment` | **Two identical comments posted.** |
| `crew-requests/[id]/page.tsx:204` comment | `addCrewRequestComment` | **Two identical comments posted.** |
| `change-orders/new/page.tsx:36` | `createChangeOrder` | **Two change orders**, each with a full approval chain and notifications, or a `number` unique-constraint crash (see sequence finding). |
| `crew-requests/new/page.tsx:38` | `createCrewRequest` | **Two crew requests**, two "Assigned" notifications to the assignee. |
| `jobs/new/page.tsx:82` | `createJobRequest` | **Two quote requests**, two notification fan-outs to every yard user. |
| `jobs/[id]/quote/page.tsx:81` | `issueQuote` | Second submit throws `Illegal transition QUOTE_SENT → QUOTE_SENT` (`jobs/actions.ts:234`) → unhandled crash page. |
| `jobs/[id]/accept/page.tsx:257` "Accept quote" | `requestAcceptanceCode` | **Two challenge rows, two emails; the first code is silently invalidated** (`accept/actions.ts:78-81`). |
| `jobs/[id]/accept/page.tsx:224` "Accept …" | `confirmAcceptance` | Safe — `consumedAt` guard at `acceptance.ts:61`. Second click shows "That code has already been used." |
| `jobs/[id]/accept/page.tsx:276` "Reject quote" | `rejectQuote` | Second submit throws `Illegal transition CANCELLED_QUOTE → CANCELLED_QUOTE` → crash page. |
| `jobs/[id]/page.tsx:470` transition buttons | `transitionJob` | Second submit throws `Illegal transition` → crash page. |
| `jobs/[id]/page.tsx:129` favourite | `toggleJobFavourite` | Toggles twice (net zero), or races the `userId_jobId` unique index → P2002 crash. |
| `jobs/[id]/page.tsx:449` progress | `setJobProgress` | Idempotent. Harmless. |
| `change-orders/[id]/page.tsx:249` & `approvals/page.tsx:144` | `decideChangeOrderApproval` | Re-writes the decision and **sends a second "fully approved" notification** (`change-orders/actions.ts:193`). |
| `admin/projects/page.tsx:104` | `updateProjectAction` | Idempotent. Harmless. |

The two most damaging classes are duplicate records (change orders, crew requests, quote requests) and duplicate comments, because neither has any server-side idempotency key, deduplication window or unique constraint that would catch them.

Impact:
On a slow yard Wi-Fi connection — the stated operating environment — a user who clicks "Create Draft" twice raises two change orders, each of which spawns a five-to-seven-stage approval chain and notifies every approver. The same double click on a comment double-posts into a thread that is treated as a contractual record. Several other buttons hard-crash the app on a second click because the transition guard throws an unhandled `Error` with no error boundary to catch it.

Suggested fix:
Add one shared client component, e.g. `src/components/ui/SubmitButton.tsx`:

```tsx
"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({ children, ...props }) {
  const { pending } = useFormStatus();
  return <button {...props} disabled={pending || props.disabled} aria-busy={pending}>
    {pending ? "Working…" : children}</button>;
}
```

and use it for every `<form action={…}>` submit button. For the three comment forms and the three create forms, also add server-side idempotency: pass a `requestId` hidden input seeded per render and reject a repeat within the action.

---

### [DOUBLE-SUBMIT] — Record numbers are allocated by `count() + 1` against a unique column
Severity: High
Location: `src/lib/utils.ts:24-27`; `src/app/(app)/change-orders/actions.ts:34`; `src/app/(app)/crew-requests/actions.ts:18`
Found by: forms-validation

Description:
`nextSequence` is `const n = (await fetchCount()) + 1; return prefix-NNNN`. It is called with `prisma.changeOrder.count()` and `prisma.crewRequest.count()`, and the resulting value is written to `ChangeOrder.number` / `CrewRequest.number`, both declared `String @unique` (`prisma/schema.prisma:219` and the ChangeOrder equivalent). There is no transaction, no advisory lock and no sequence. Two submissions that overlap — the double click described above, or two crew members filing requests at the same moment — both read the same count and both attempt the same number. One create raises a Prisma P2002 unique-constraint error, which is unhandled (no `try`/`catch`, no error boundary), so the user sees a crash page and loses the entire form.

Impact:
Concurrent creation is not just a theoretical race on a multi-user yard system; it is the normal case when a refit team files requests together. The loser of the race loses everything typed, with a stack-trace-style error page rather than a message. Absent the unique index it would be worse: two records sharing CO-0007.

Suggested fix:
Use a database sequence or a dedicated counter row updated inside the same transaction as the insert (`UPDATE counters SET n = n + 1 … RETURNING n`), and wrap the create in a retry on P2002.

---

### [REQUIRED-FIELDS] — Leaving the optional "Due Date" blank rejects the entire crew request
Severity: Critical
Location: `src/lib/validators.ts:37`; `src/app/(app)/crew-requests/new/page.tsx:103-105`; `src/app/(app)/crew-requests/actions.ts:15-16`
Found by: forms-validation

Description:
The Due Date field is rendered as `<Input type="date" name="dueDate" />` with no `required` attribute — correctly presented to the user as optional. The action does `CrewRequestCreateSchema.safeParse(Object.fromEntries(formData))`. An untouched `<input type="date">` submits the empty string, so the schema receives `dueDate: ""`. The schema is `z.coerce.date().optional().nullable()`. `optional()` only short-circuits on `undefined`; `""` is present, so coercion runs, `new Date("")` yields Invalid Date, and zod fails.

Verified by executing the exact schema fragment against `zod` from this repo:

```
blank dueDate: {"success":false,"error":{"issues":[
  {"code":"invalid_date","path":["dueDate"],"message":"Invalid date"}]}}
```

`createCrewRequest` then does `throw new Error("Invalid request: " + …)` (`crew-requests/actions.ts:16`). There is no error boundary anywhere in `src/app` (verified: no `error.tsx` or `global-error.tsx` exists), so this surfaces as Next.js's generic application error screen and the user's entire typed request is gone.

The same trap sits in `ChangeOrderCreateSchema` only by luck — change orders have no date field. There is no e2e coverage for crew requests (`e2e/` contains only adminProjects, exports, jobs, passwordReset and shell specs), which is why this has not been caught.

Impact:
The primary create path for one of the two core record types is broken for any user who does not fill in an optional field, with total loss of a long form and no usable message. This is a broken core workflow plus data loss.

Suggested fix:
Normalise empty strings before parsing, and make the schema express it:

```ts
const emptyToNull = (v: unknown) => (v === "" ? null : v);
dueDate: z.preprocess(emptyToNull, z.coerce.date().nullable().optional()),
```

Apply the same preprocess to every optional field fed from `Object.fromEntries`.

---

### [REQUIRED-FIELDS] — Unselected optional dropdowns are stored as `""`, and one of them violates a foreign key
Severity: Critical
Location: `src/app/(app)/crew-requests/new/page.tsx:74-84, 98-101, 128-133`; `src/lib/validators.ts:33-41`; `prisma/schema.prisma:241`
Found by: forms-validation

Description:
Every optional `<Select>` on the crew-request and change-order forms uses `<option value="">` as its "none" choice (`crew-requests/new/page.tsx:75, 81, 99, 130`; `change-orders/new/page.tsx:85, 95`). `Object.fromEntries(formData)` hands the action `departmentCode: ""`, `vesselAreaId: ""`, `assignedToId: ""`, `linkedChangeOrderId: ""`. The schema declares these `z.string().optional().nullable()` — an empty string is a valid string, so `""` passes straight through and is spread into `prisma.crewRequest.create` (`crew-requests/actions.ts:19-28`).

`departmentCode`, `vesselAreaId` and `assignedToId` are bare `String?` columns, so `""` is stored instead of NULL — wrong, but silent. `linkedChangeOrderId` is a real relation:

```
prisma/schema.prisma:233  linkedChangeOrderId String?
prisma/schema.prisma:241  linkedChangeOrder ChangeOrder? @relation(fields: [linkedChangeOrderId], references: [id])
```

On PostgreSQL (`prisma/schema.prisma:8` — `provider = "postgresql"`) a non-null `""` must match an existing `ChangeOrder.id`, so the insert raises a foreign-key violation (P2003). "— No linked change order" is the **default** selection (`crew-requests/new/page.tsx:130`), so this fires on ordinary use.

Impact:
Combined with the blank-due-date finding above, creating a crew request through the UI as-designed fails twice over. Where `""` does get stored (department, vessel area, assignee), every downstream `if (x)` check happens to treat it as falsy, but any `WHERE departmentCode IS NULL` filter or join silently misses those rows, and the data is simply wrong.

Suggested fix:
Normalise `""` to `null` for every optional field before parsing (the same `emptyToNull` preprocess as above), and make the FK fields `z.string().cuid().nullable()` so a malformed id is rejected rather than handed to the database.

---

### [REQUIRED-FIELDS] — Server minimum lengths are not mirrored on the client, so valid-looking input crashes the form
Severity: High
Location: `src/app/(app)/change-orders/new/page.tsx:63-76` vs `src/lib/validators.ts:12-13`; `src/app/(app)/crew-requests/new/page.tsx:57-59` vs `src/lib/validators.ts:31`
Found by: forms-validation

Description:
Forms where the client and server disagree on the minimum:

| Field | Client | Server |
|---|---|---|
| Change order Description (`change-orders/new/page.tsx:64-68`) | `required` only | `z.string().min(5)` (`validators.ts:12`) |
| Change order Reason (`change-orders/new/page.tsx:71-75`) | `required` only | `z.string().min(3)` (`validators.ts:13`) |
| Crew request Description (`crew-requests/new/page.tsx:58`) | `required` only | `z.string().min(3)` (`validators.ts:31`) |

Typing "N/A" as a change-order description satisfies the browser, reaches the server, fails `min(5)`, and `createChangeOrder` throws (`change-orders/actions.ts:31`). By contrast the job-request form does mirror its rules correctly (`jobs/new/page.tsx:103` `minLength={3}` vs `RequestSchema` `min(3)`; `:114` `minLength={10}` vs `min(10)`), which shows the pattern was understood and simply not applied to the older forms.

Separately, all of these `min()` checks run on the raw string: a title of three spaces passes `z.string().min(3)` (verified: `{"success":true,"data":{"t":"   "}}`).

Impact:
A user fills a long form, the browser tells them it is valid, and the server destroys it with a stack-trace page. Whitespace-only titles and descriptions are accepted and become unsearchable records.

Suggested fix:
Add matching `minLength` to each control, and `.trim()` inside the schema (`z.string().trim().min(5)`) so whitespace cannot satisfy a minimum.

---

### [VALIDATION-MESSAGES] — There is no error boundary, so every server-side validation failure is a crash page
Severity: Critical
Location: `src/app/` (no `error.tsx` / `global-error.tsx` exists anywhere)
Found by: forms-validation

Description:
`find src -name "error.tsx" -o -name "global-error.tsx"` returns nothing. Every server action that reports a problem by `throw new Error(...)` therefore reaches Next.js's built-in fallback, which in production renders the opaque "Application error: a server-side exception has occurred" screen with a digest hash and no way back. The throwing paths are:

- `change-orders/actions.ts:31` — invalid change order
- `change-orders/actions.ts:65, 148, 150` — not found / forbidden
- `crew-requests/actions.ts:16` — invalid crew request
- `crew-requests/actions.ts:53, 72` — not found / illegal transition
- `jobs/actions.ts:27, 31` — job not found / no project access
- `jobs/actions.ts:56` — no active project
- `jobs/workflow.ts:59` — every illegal transition, reached from `transitionJob`, `issueQuote`, `confirmAcceptance`, `rejectQuote`
- `rbac.ts:209` — every permission failure

Impact:
The most common validation failure in the app — a schema rejection on the change order or crew request form — presents as a total application failure. The form state is gone, the back button re-renders an empty form, and the user has no indication of which field was wrong.

Suggested fix:
Add `src/app/(app)/error.tsx` and `src/app/global-error.tsx` with a reset control, and convert the user-correctable throws (schema rejections, illegal transitions) into the `redirect(?err=…)` pattern already used by `jobs/actions.ts` and `admin/projects/actions.ts`.

---

### [VALIDATION-MESSAGES] — Every validation failure that does report properly still discards the whole form
Severity: High
Location: `src/app/(app)/jobs/actions.ts:67, 81, 169`; `src/app/(app)/admin/projects/actions.ts:29, 40, 50`; `src/app/login/page.tsx:19, 21, 23`; `src/app/reset/[token]/page.tsx:28, 33`; `src/app/(app)/jobs/[id]/accept/actions.ts:55, 134`
Found by: forms-validation

Description:
The actions that do handle errors gracefully all use the same shape:

```ts
const back = (message: string) =>
  redirect(`/jobs/${jobId}/quote?err=${encodeURIComponent(message)}`);
```

A `redirect` issues a fresh GET. Nothing the user typed is carried in the URL, nothing is stored in a cookie or session, and the target page re-renders from `defaultValue`s taken from the database. Concretely:

- **Quote form** (`jobs/[id]/quote/page.tsx:81`, 6 line rows × 4 inputs, plus exclusions and notes textareas): one bad job code at `jobs/actions.ts:173` wipes the entire priced quote. This is the largest form in the application.
- **New quote request** (`jobs/new/page.tsx:82`): `jobs/actions.ts:67` discards the title, the long description and — worse — the hidden inputs naming the files already uploaded to storage, which become orphans (see FileDrop below).
- **Admin projects** (`admin/projects/page.tsx:104`): a date-order problem at `admin/projects/actions.ts:40` reverts all four dates and the code to what is in the database.
- **Login** (`login/page.tsx:19-23`): the email is discarded on every failure.

Because the message arrives as a query string, it is also rendered as one page-level banner (e.g. `jobs/[id]/quote/page.tsx:71-79`) with no association to the field at fault — `Form.tsx:21` supports a per-field `error` prop, but no caller anywhere passes it.

Impact:
The recovery cost of a single typo is retyping a whole quote. This is the strongest single argument users will have against the tool.

Suggested fix:
Switch to `useActionState` (React 19) / `useFormState` and return `{ errors, values }` from the actions instead of redirecting, re-rendering the form with `defaultValue={state.values.x}` and `<Field error={state.errors.x}>`. `Form.tsx` already has the `error` slot needed.

---

### [VALIDATION-MESSAGES] — The login error is generic and loses the email
Severity: Low
Location: `src/app/login/page.tsx:15-23, 80-82`
Found by: forms-validation

Description:
`login` redirects to `/login?err=invalid` for three distinct causes — malformed input, unknown/inactive user, wrong password — and the page prints one fixed string, "Invalid email or password." Not distinguishing wrong-password from unknown-user is correct security practice, but a malformed email address is not a credential signal and should be reported as such; and the typed email is not echoed back, so the user retypes it on every attempt. There is also no distinction for a deactivated account (`login/page.tsx:21`), which leaves a former crew member with no way to understand why they cannot get in.

Impact:
Minor friction on the most-used screen; a deactivated user has no path forward.

Suggested fix:
Keep one message for the credential cases, add `?err=format` for schema failure, and echo the submitted email back via `defaultValue` from a `?email=` param or `useActionState`.

---

### [VALIDATION-MESSAGES] — Comment bodies that are whitespace-only are silently discarded with no feedback
Severity: Medium
Location: `src/app/(app)/jobs/actions.ts:446-450`; `src/app/(app)/change-orders/actions.ts:216-217`; `src/app/(app)/crew-requests/actions.ts:130-131`
Found by: forms-validation

Description:
All three comment actions follow the same shape:

```ts
const body = String(formData.get("body") ?? "").trim();
if (!id || !body) return;
```

The textarea carries `required` (`jobs/[id]/page.tsx:340`, `change-orders/[id]/page.tsx:311`, `crew-requests/[id]/page.tsx:207`), which the browser satisfies with a single space. The server then trims to empty and returns `undefined` — no error, no redirect, no `revalidatePath`. The page does not re-render, so the textarea still shows the user's spaces and they cannot tell whether the comment was posted.

`addJobComment` additionally calls `loadJob` before the emptiness check (`jobs/actions.ts:449-450`), so an empty comment costs two database round trips before doing nothing.

Impact:
Silent no-op. The user believes a comment was posted. On a contractual thread that is a real communication failure.

Suggested fix:
Validate the body with a schema (`z.string().trim().min(1)`) and report the failure through the same channel as the rest of the form. At minimum move the emptiness check to the top of the action and redirect with an `?err=`.

---

### [VALIDATION-MESSAGES] — Quote line errors cite the wrong row number
Severity: Medium
Location: `src/app/(app)/jobs/actions.ts:195-217`
Found by: forms-validation

Description:
The line pipeline filters out empty rows *before* numbering:

```ts
.filter((line) => line.description.length > 0)
.map((line, sort) => {
  const parsed = LineSchema.safeParse(line);
  if (!parsed.success) back(`Line ${sort + 1} is incomplete.`);
```

`sort` is the index within the *filtered* list. If the yard leaves rows 1–3 blank and fills rows 4 and 5, and row 5 has a bad unit, the message reads "Line 2 is incomplete." The form has six visible rows labelled 1–6 (`jobs/[id]/quote/page.tsx:143-182`, ``aria-label={`Line ${i + 1} …`}``), so the number in the error does not match any row on screen — and by the time it is shown the whole form has been wiped anyway.

Impact:
The one actionable detail in the message points at the wrong row.

Suggested fix:
Carry the original index through the filter: `.map((d, i) => ({ …, row: i + 1 }))` before filtering, and report `line.row`.

---

### [SCHEMA] — Server actions that parse FormData with no schema at all
Severity: High
Location: fifteen actions across six files (listed below)
Found by: forms-validation

Description:
Complete list of server actions that read `formData.get(...)` and coerce with `String(...)` / `Number(...)` / a TypeScript `as` cast, with no zod schema:

1. `src/app/(app)/change-orders/actions.ts:139-211` — `decideChangeOrderApproval` (`approvalId`, `decision` cast with `as`, `comment`)
2. `src/app/(app)/change-orders/actions.ts:213-229` — `addChangeOrderComment` (`id`, `body`)
3. `src/app/(app)/crew-requests/actions.ts:99-125` — `assignCrewRequest` (`id`, `assignedToId`)
4. `src/app/(app)/crew-requests/actions.ts:127-143` — `addCrewRequestComment` (`id`, `body`)
5. `src/app/(app)/jobs/actions.ts:161-307` — `issueQuote` (`jobId`, `code`, `contractType`, `pricingBasis`, `validityDays`, `exceptionFlag`, `exclusions`, `notes`; only the repeating line rows get `LineSchema`)
6. `src/app/(app)/jobs/actions.ts:310-388` — `transitionJob` (`jobId`, `to` cast with `as JobStatus`, `reason`)
7. `src/app/(app)/jobs/actions.ts:409-438` — `setJobProgress` (`jobId`, `progressPct` via bare `Number()`)
8. `src/app/(app)/jobs/actions.ts:441-476` — `addJobComment` (`jobId`, `body`, `kind`)
9. `src/app/(app)/jobs/actions.ts:479-496` — `toggleJobFavourite` (`jobId`)
10. `src/app/(app)/jobs/actions.ts:504-543` — `attachUploads` (`attachments`, `JSON.parse` of client-supplied JSON)
11. `src/app/(app)/jobs/[id]/accept/actions.ts:47-121` — `requestAcceptanceCode` (`jobId`)
12. `src/app/(app)/jobs/[id]/accept/actions.ts:124-255` — `confirmAcceptance` (`jobId`, `challengeId`, `code`)
13. `src/app/(app)/jobs/[id]/accept/actions.ts:258-311` — `rejectQuote` (`jobId`, `reason`)
14. `src/app/(app)/admin/projects/actions.ts:21-80` — `updateProjectAction` (`id`, `code`, `yardName`, `currency`, four dates)
15. `src/app/(app)/_actions.ts:15-29` — `setActiveProjectAction` (`projectId`)

Only four call sites in the whole app validate with a schema: `createChangeOrder`, `createCrewRequest`, `createJobRequest` and `login`.

Several of these are defended by other means — `transitionJob`'s garbage `to` value resolves to `undefined` in `JOB_TRANSITION_PERMISSION` and `assertPermission` then throws (`rbac.ts:208`), and `issueQuote` hand-checks `CONTRACT_TYPES.includes(...)` at `jobs/actions.ts:184-185`. But the defence is ad hoc and per-field, so any new field is unguarded by default.

Impact:
Type safety here is a lie: `as "APPROVED" | "REJECTED" | "MORE_INFO"` tells the compiler something the runtime never checks. Missing fields become the strings `"null"`/`"undefined"` (e.g. `String(formData.get("id"))` at `crew-requests/actions.ts:102`, which has no `?? ""` fallback), which then hit Prisma as record ids.

Suggested fix:
Define a schema per action in `src/lib/validators.ts` and parse once at the top, as `createChangeOrder` already does. A small `parseForm(schema, formData)` helper that normalises `""` → `null` would cover all of them.

---

### [SCHEMA] — The approval decision is never validated, and `ApprovalDecisionSchema` is dead code
Severity: High
Location: `src/app/(app)/change-orders/actions.ts:141-160, 180-207`; `src/lib/validators.ts:52-57`
Found by: forms-validation

Description:
`src/lib/validators.ts:52` defines exactly the right schema:

```ts
export const ApprovalDecisionSchema = z.object({
  approvalId: z.string().min(1).optional(),
  changeOrderApprovalId: z.string().min(1).optional(),
  decision: z.enum(["APPROVED", "REJECTED", "MORE_INFO", "DELEGATED"]),
  comment: z.string().optional().nullable(),
});
```

A grep for `ApprovalDecisionSchema` across `src/` finds only its own definition — it is imported nowhere. The action instead does:

```ts
const decision = String(formData.get("decision") ?? "") as "APPROVED" | "REJECTED" | "MORE_INFO";
```

and writes it straight to the database (`change-orders/actions.ts:152-160`). The branch that follows (`:180-207`) is `if REJECTED … else if MORE_INFO … else`, so **any** unrecognised value — including the empty string when the form is submitted without a named button — falls into the approval branch. That branch counts `decision: "PENDING"` rows still outstanding; the row just written is no longer PENDING, so it counts as decided. If it was the last required stage, the change order is set to `APPROVED` with `approvedCost` committed (`change-orders/actions.ts:188-192`) on the strength of a decision value that nobody validated and that renders in the UI as a raw badge (`change-orders/[id]/page.tsx:235`).

Impact:
Approval — the financial control in this system — accepts arbitrary values and treats anything non-PENDING as consent. A hand-crafted or button-less submission can push a change order to APPROVED without an approval being recorded. Garbage decision strings are also persisted into the audit trail (`change-orders/actions.ts:171-177`).

Suggested fix:
Parse with the existing `ApprovalDecisionSchema` and make the branch exhaustive — `switch` on the parsed enum with a `default: throw`.

---

### [SCHEMA] — `attachUploads` trusts a client-supplied JSON blob, including the storage key
Severity: High
Location: `src/app/(app)/jobs/actions.ts:504-543`; `src/components/ui/FileDrop.tsx:216-227`
Found by: forms-validation

Description:
`FileDrop` emits, for each completed upload, a hidden input whose value is `JSON.stringify({ key, filename, contentType, size })` (`FileDrop.tsx:219-225`). `attachUploads` reads every `attachments` entry, `JSON.parse`s it, and keeps anything where `typeof row.key === "string"` (`jobs/actions.ts:517-527`). It then writes `storageKey: row.key`, `mimetype: row.contentType`, `size: row.size`, `filename: row.filename` directly into `prisma.attachment.createMany` (`jobs/actions.ts:531-543`).

Nothing re-checks that the key was ever minted by `/api/uploads/sign` for this user, that it belongs to this project, that it matches `isSafeObjectKey` (`storage/keys.ts:94`), or that `contentType` is in `ALLOWED_UPLOAD_TYPES` (`storage/keys.ts:7-21`). The sign endpoint does all of that work (`api/uploads/sign/route.ts:44-63`) and it is then discarded. `size` is whatever number the client claims, so storage totals and any quota built on them are client-controlled.

Impact:
A signed-in user can post an `attachments` field naming any object key in the bucket — including `projects/<other-project-id>/…` — and have it registered as an attachment on their own job, where it becomes reachable through the normal attachment UI. Stored mimetype and size are unverified, so an executable can be labelled `image/png`. (Note for the security sub-agent: `GET /api/uploads/local` at `api/uploads/local/route.ts:53-75` checks only `getCurrentUser` and `isSafeObjectKey`, so any signed-in user can already read any key — this finding compounds that.)

Suggested fix:
Validate the entries with a schema, verify `isSafeObjectKey(key)`, verify the key begins with `projects/<slug(job.projectId)>/`, re-check `isAllowedUploadType`, and take the size from a storage `HEAD` rather than the client. Better still, record the mint in a table at sign time and match `key` against it.

---

### [FILEDROP] — A failed upload does not block submission; the attachment is silently lost
Severity: High
Location: `src/components/ui/FileDrop.tsx:86-91, 121, 216-227`; `src/app/(app)/jobs/new/page.tsx:155-161`
Found by: forms-validation

Description:
`FileDrop` renders a hidden input only for items with `status === "done"` (`FileDrop.tsx:216`). An item in `status: "error"` renders a row with a red icon and a message, but contributes nothing to the form and — crucially — does not prevent the surrounding form from submitting. The parent form (`jobs/new/page.tsx:82`) has no knowledge of the uploader's state at all: the only channel out of `FileDrop` is the optional `onChange` prop, and `jobs/new/page.tsx:155-161` does not pass it (it cannot: the page is a server component).

So a user who drops three photos, watches one fail, and presses "Send request" gets a quote request with two attachments and no warning that the third is missing. The yard prices work it cannot see.

The failure message itself is rendered in `<span className="shrink-0 text-xs text-faint tnum">` (`FileDrop.tsx:199`) — the same faint grey used for the file size on successful rows. Only the 3.5px icon is red (`FileDrop.tsx:192`). There is also no retry control; the only options are to leave the failed row or remove it (`FileDrop.tsx:207-214`).

Impact:
Silent loss of evidence on the form whose entire purpose is to let the yard price work accurately. The error styling actively works against noticing it.

Suggested fix:
Emit a hidden input such as `<input type="hidden" name="uploadPending" value="1">` whenever any item is not `done`, and reject in the action with a clear message. Style the error text with `text-bad` and add a "Retry" button calling `upload(item)`.

---

### [FILEDROP] — No accepted-types hint or client-side type check; rejections surface as a cryptic status code
Severity: Medium
Location: `src/components/ui/FileDrop.tsx:169-179, 72-75`; `src/lib/storage/keys.ts:7-21`
Found by: forms-validation

Description:
The file input is `<input type="file" multiple …>` with no `accept` attribute (`FileDrop.tsx:169-174`), and `add()` checks only size (`FileDrop.tsx:103-111`). The server maintains a 13-entry allow-list (`storage/keys.ts:7-21`) and rejects anything else with HTTP 415 (`api/uploads/sign/route.ts:44-49`). The client therefore lets the user pick a `.dwg`, `.zip` or `.mov`-with-odd-type, uploads begin, and each fails after a round trip.

The message shown is whatever `body.error` the route returned — "File type not allowed" — or, if the JSON parse fails, the fallback `` `Upload refused (${signRes.status})` `` (`FileDrop.tsx:74`), i.e. literally "Upload refused (415)". The allow-list *is* returned in the 415 body (`route.ts:46`) but `FileDrop` reads only `body.error` and throws the rest away. The static hint text says only "Photos, drawings and documents up to 10 MB each" (`FileDrop.tsx:166-168` / `jobs/new/page.tsx:160`), which promises drawings — the one thing a yard would upload as DWG, and which is not on the allow-list.

Size limits themselves are handled correctly at three layers: client `maxBytes` default 10 MB (`FileDrop.tsx:34`, overridden to the same at `jobs/new/page.tsx:159`), sign-endpoint check against `maxUploadBytes()` default 25 MB (`route.ts:51-57`, `storage/keys.ts:26-31`), and a byte-length re-check in the local PUT route (`api/uploads/local/route.ts:44-47`). The client cap is the stricter one, so the layering is sound.

Impact:
Users discover the restriction only by failing, and the message does not say what is permitted. "Drawings" is advertised and not actually supported in its common format.

Suggested fix:
Pass `accept={ALLOWED_UPLOAD_TYPES.join(",")}` to the input, filter in `add()` before uploading, surface `body.allowed` in the message, and correct the hint.

---

### [FILEDROP] — Uploads are orphaned when a form is abandoned or fails validation
Severity: Medium
Location: `src/components/ui/FileDrop.tsx:114`; `src/app/(app)/jobs/new/page.tsx:155-161`; `src/app/(app)/jobs/actions.ts:67, 81, 117`
Found by: forms-validation

Description:
`add()` starts the upload immediately on drop (`FileDrop.tsx:114`) — bytes are in storage before the user has finished the form. The `Attachment` row is only written later, by `attachUploads` after the job is created (`jobs/actions.ts:117`). Between those two moments, four things can discard the reference while leaving the object in place:

1. The user navigates away or hits Cancel (`jobs/new/page.tsx:166`).
2. Schema validation fails and the action `redirect`s (`jobs/actions.ts:67`), losing every hidden input.
3. The authoriser check fails and redirects (`jobs/actions.ts:81`).
4. The user clicks the row's X (`FileDrop.tsx:207-214`) — `remove()` only drops local state; no DELETE is ever issued.

There is no cleanup job, no lifecycle rule in `src/lib/storage/index.ts`, and no record anywhere of a minted key, so an orphan is unreferenced and undiscoverable. The key path makes this worse: `jobs/new/page.tsx:158` passes `resourceId="new"`, so every request's uploads land in one shared prefix `projects/<projectId>/Job/new/…` (`storage/keys.ts:82-91`) that never corresponds to the job that eventually owns them — defeating the stated purpose of the key layout ("so a project's media can be listed, copied or lifecycle-expired as a unit", `storage/keys.ts:76-81`).

Impact:
Unbounded storage growth that nobody can attribute or clean, and a key scheme that cannot be used for per-record lifecycle rules on precisely the records that use it.

Suggested fix:
Record minted keys in a `PendingUpload` table at sign time and sweep unclaimed rows after 24 hours; have `remove()` issue a delete for a completed item; and use a client-generated draft id instead of the literal `"new"`, rewriting or recording the mapping when the job is created.

---

### [FILEDROP] — `onChange` is invoked during render
Severity: Low
Location: `src/components/ui/FileDrop.tsx:121-135`
Found by: forms-validation

Description:
```tsx
const lastReported = useRef("");
if (onChange && doneKeys !== lastReported.current) {
  lastReported.current = doneKeys;
  onChange(...);
}
```
This calls a parent callback in the render body rather than from an effect. If a caller ever passes an `onChange` that sets state, React will warn ("Cannot update a component while rendering a different component") and under StrictMode / concurrent rendering the mutation of `lastReported` during render can be discarded or double-applied. It is currently latent — no caller in the repo passes `onChange` (only `jobs/new/page.tsx:155` uses `FileDrop`, without it).

Impact:
None today; a trap for the next caller.

Suggested fix:
Move the notification into `useEffect(() => { onChange?.(files) }, [doneKeys])`.

---

### [FILEDROP] — Attachment support on comments is wired on the server but has no UI
Severity: Low
Location: `src/app/(app)/jobs/actions.ts:465`; `src/app/(app)/jobs/[id]/page.tsx:337-352`
Found by: forms-validation

Description:
`addJobComment` calls `attachUploads(formData, jobId, user.id, "Job", comment.id)` (`jobs/actions.ts:465`), and the job page renders `comment.attachments` (`jobs/[id]/page.tsx:322-331`). But the comment form itself (`jobs/[id]/page.tsx:337-352`) contains only a textarea and two buttons — no `FileDrop`. The comment-attachment path can therefore never be exercised through the UI. `FileDrop` appears exactly once in the entire codebase (`jobs/new/page.tsx:155`); change orders and crew requests have `attachments Attachment[]` relations in the schema and no uploader at all.

Impact:
Dead server code and an unreachable feature; a reader would reasonably assume comments support attachments.

Suggested fix:
Add `<FileDrop resource="Job" resourceId={job.id} />` to the comment form, or remove the `commentId` path until it is wanted.

---

### [NUMBERS] — Negative unit prices are accepted on the client and on the server
Severity: High
Location: `src/app/(app)/jobs/[id]/quote/page.tsx:171-180`; `src/app/(app)/jobs/actions.ts:148-153, 215`
Found by: forms-validation

Description:
The unit-price input carries `type="number" step="0.01"` and **no `min`** (`quote/page.tsx:172-179`) — compare the quantity input two cells earlier, which does have `min="0"` (`quote/page.tsx:155`). The server schema matches the omission:

```ts
const LineSchema = z.object({
  description: z.string().min(1),
  quantity:    z.coerce.number().nonnegative(),
  unit:        z.string().min(1).max(12),
  unitPrice:   z.coerce.number(),          // jobs/actions.ts:152 — no .nonnegative()
});
```

Verified: `{q:"1", u:"-500"}` parses successfully to `{"q":1,"u":-500}`. The line total is then `Math.round(quantity * unitPrice * 100) / 100` (`jobs/actions.ts:215`) = -500, and the quote total is a plain sum (`jobs/actions.ts:221`), so a negative line reduces the quote — potentially to a negative grand total, which is written to `job.total`, hashed into the acceptance fingerprint (`acceptance.ts:94-101`), rendered as the amount the client is signing for (`accept/page.tsx:241` "Accept -€500"), and counted in project financials.

Impact:
A yard user can issue a quote with a negative total, and the acceptance flow will happily collect a confirmed signature on it. Whether intended as a discount line or a typo, nothing anywhere rejects it, and the accepted figure is immutable by design (`quote/page.tsx:187-189`).

Suggested fix:
Add `min="0"` to the input and `.nonnegative()` to `unitPrice`. If discount lines are a genuine requirement, model them explicitly and assert the quote total is `>= 0` before the transaction at `jobs/actions.ts:236`.

---

### [NUMBERS] — A quote line with a description but no quantity or price is silently saved at zero
Severity: High
Location: `src/app/(app)/jobs/actions.ts:190-219`; `src/app/(app)/jobs/[id]/quote/page.tsx:143-182`
Found by: forms-validation

Description:
Only row 1 of the quote table has default values (`defaultValue={i === 0 ? 1 : ""}` for quantity, `{i === 0 ? 0 : ""}` for price — `quote/page.tsx:158, 176`). Rows 2–6 start empty. An empty `<input type="number">` submits `""`.

`z.coerce.number()` coerces `""` via `Number("")` → `0`, and `0` satisfies `.nonnegative()`. Verified against this repo's zod:

```
empty q/u: {"success":true,"data":{"q":0,"u":0}}
```

So a row where the yard typed "Replace stern gland — labour and materials" and tabbed past the numbers is **not** reported as incomplete. It passes `LineSchema`, gets `quantity: 0, unitPrice: 0, total: 0`, and is written as a real line (`jobs/actions.ts:203-217`). The helper text under the table promises the opposite: "Empty lines are ignored" (`quote/page.tsx:187`) — the line is not empty, it is zero-priced.

The `back("Line N is incomplete")` branch at `jobs/actions.ts:205` can therefore only ever fire on a blank `unit` (the only field with `min(1)` that is not number-coerced), and the unit has `defaultValue="UN"` (`quote/page.tsx:167`) — so in practice that error is unreachable.

Impact:
A quote goes to the client with a scope line priced at zero. The client accepts the total in good faith; the yard cannot invoice the line because the accepted figure is frozen (`quote/page.tsx:187-189`, `acceptance.ts:87-102`). This is a direct financial loss, and it is the single most likely data-entry mistake on this form.

Suggested fix:
Treat `""` as absent rather than zero:

```ts
const num = z.preprocess(v => (v === "" ? undefined : v), z.coerce.number());
quantity: num.pipe(z.number().positive()),
unitPrice: num.pipe(z.number().nonnegative()),
```

so a described row with blank numbers fails with "Line 3 needs a quantity and a unit price."

---

### [NUMBERS] — A quote line with a price but no description is silently dropped
Severity: Medium
Location: `src/app/(app)/jobs/actions.ts:195-202`
Found by: forms-validation

Description:
```ts
.filter((line) => line.description.length > 0)
```
A row where the yard entered `quantity 40`, `unit HRS`, `unitPrice 85` but had not yet typed the description is removed with no message. The submit succeeds, the quote is sent, and €3,400 of priced work is simply absent. Nothing compares the filtered count against the count of rows that had *any* content.

Impact:
Under-quoting with no warning — the mirror image of the finding above, and equally silent. The yard discovers it only when the client accepts a total that is too low.

Suggested fix:
Before filtering, flag rows where the description is empty but any of quantity, unit (other than the "UN" default) or unit price was filled, and reject with "Line 4 has a price but no description."

---

### [NUMBERS] — Row alignment between the parallel line arrays
Severity: Low
Location: `src/app/(app)/jobs/actions.ts:190-202`; `src/app/(app)/jobs/[id]/quote/page.tsx:143-182`
Found by: forms-validation

Description:
The action pairs four independent `formData.getAll()` arrays by index:

```ts
const descriptions = formData.getAll("lineDescription").map(String);
const quantities   = formData.getAll("lineQuantity").map(String);
…
.map((description, i) => ({ description, quantity: quantities[i], unit: units[i] || "UN", unitPrice: prices[i] }))
```

Alignment **is** currently guaranteed, for two reasons worth recording: every one of the six rows is rendered unconditionally (`quote/page.tsx:143`), and all four controls are plain `<input>`s that always submit a value (empty string when blank), so all four arrays always have length 6 in DOM order. The filter is applied after the index-based zip (`jobs/actions.ts:202`), so it cannot shift anything.

The guarantee is fragile rather than enforced, though. It breaks silently the moment anyone (a) adds a checkbox or unchecked radio to a row — unchecked inputs submit nothing, shortening only that array — (b) makes a cell conditional, or (c) adds client-side row deletion. The failure mode would be quantities and prices attached to the wrong descriptions, on a document the client legally signs.

Impact:
None today. A silent, high-consequence trap for the next change to this table.

Suggested fix:
Post indexed names — `line[0][description]`, `line[0][quantity]` — or add a per-row `<input type="hidden" name="lineIndex" value={i}>` and zip on that. At minimum assert `descriptions.length === quantities.length && … === prices.length` and reject otherwise.

---

### [NUMBERS] — Quote validity days is bounded on the client only
Severity: Medium
Location: `src/app/(app)/jobs/[id]/quote/page.tsx:121-123`; `src/app/(app)/jobs/actions.ts:187`; `src/lib/jobs/workflow.ts:102-105`
Found by: forms-validation

Description:
The input declares `min={1} max={365}` (`quote/page.tsx:122`). The server does:

```ts
const validityDays = Number(formData.get("validityDays") ?? 0) || null;
```

No range check. A submitted `-30` is truthy, so `validityDays = -30` is stored on the job (`jobs/actions.ts:250`). `expiryFrom` guards against it (`workflow.ts:103`: `if (!validityDays || validityDays <= 0) return null`), so `expiresAt` becomes null — the quote never expires — while the job detail page renders "Valid for -30 days" (`jobs/[id]/page.tsx:281`, `accept/page.tsx:194`). A value of `10000` is accepted outright. The label also says "Blank means no expiry" (`quote/page.tsx:121`), which is true only because `Number("")` is 0 and `0 || null` is null — an accident of coercion rather than an intent.

Impact:
A quote can be stored with a nonsensical validity that is displayed to the client on the page where they sign, and with no expiry despite claiming one. `NaN` from a non-numeric value is handled correctly by the `|| null` (falsy), so that path is safe.

Suggested fix:
`validityDays: z.coerce.number().int().min(1).max(365).nullable()` with `""` preprocessed to null, and report an out-of-range value through the existing `back()` channel.

---

### [NUMBERS] — Clearing the progress field silently sets progress to 0; a crafted value stores NaN
Severity: Medium
Location: `src/app/(app)/jobs/actions.ts:416-419`; `src/app/(app)/jobs/[id]/page.tsx:449-462`
Found by: forms-validation

Description:
```ts
const raw = Number(formData.get("progressPct") ?? 0);
const progressPct = Math.min(100, Math.max(0, Math.round(raw)));
```

The input has `min={0} max={100}` but no `required` (`jobs/[id]/page.tsx:452-459`). Clearing the box and pressing Save submits `""`; `Number("")` is `0`, the clamp keeps 0, and a job that was 80% complete is silently reset to 0% with a history entry recording the change (`jobs/actions.ts:420-427`) and no confirmation.

For a non-numeric value (reachable by a direct POST, since server actions accept any FormData), `Number("x")` is `NaN`; `Math.round(NaN)` is `NaN`; `Math.max(0, NaN)` is `NaN` and `Math.min(100, NaN)` is `NaN`. The clamp does not protect against it, and `NaN` is passed to `prisma.job.update` on a `Float` column.

Impact:
Accidental destruction of reported progress with no undo and no warning — and progress drives the yard's completion reporting. The NaN path produces a Prisma error and a crash page.

Suggested fix:
`z.coerce.number().int().min(0).max(100)` with `""` rejected, and add `required` to the input.

---

### [DATES] — Nothing stops a crew request being due in the past
Severity: Low
Location: `src/app/(app)/crew-requests/new/page.tsx:103-105`; `src/lib/validators.ts:37`
Found by: forms-validation

Description:
`<Input type="date" name="dueDate" />` has no `min`, and the schema is `z.coerce.date().optional().nullable()` with no lower bound. A due date of 2019-03-04 is stored and then drives overdue badges and sorting throughout the crew-request views. (In practice the field cannot currently be left blank either — see the Critical finding above — so both ends are wrong.)

By contrast, the admin project form does validate date ordering properly (`projectDates.ts:23-65`, six ordering rules, reported through `admin/projects/actions.ts:38-41`) — a good pattern that was not extended here.

Impact:
Requests can be created already overdue, distorting the triage queue.

Suggested fix:
Add `min={new Date().toISOString().slice(0,10)}` to the input and a matching server check (allowing today), with a clear message.

---

### [DATES] — The admin project form validates ordering but loses all four dates on failure
Severity: Medium
Location: `src/app/(app)/admin/projects/actions.ts:38-41`; `src/app/(app)/admin/projects/page.tsx:127-140`
Found by: forms-validation

Description:
`validateYardPeriod` returns a list of `{ field, message }` problems (`projectDates.ts:15, 23-65`) — it knows exactly which field is at fault. The action then discards all of that:

```ts
if (problems.length) {
  redirect(`/admin/projects?id=${id}&err=${encodeURIComponent(problems[0].message)}`);
}
```

Only `problems[0].message` survives, the `field` is thrown away, and the redirect re-renders the form from `selected.arrivalDate` etc. (`page.tsx:129-138`), so all four dates and the project code revert to the stored values. If two dates are wrong, the user fixes one, resubmits, and is told about the second — having had to retype everything in between.

Impact:
The most carefully validated form in the application has the worst recovery behaviour, and the field-level detail the validator produces is never shown.

Suggested fix:
Return `problems` through `useActionState` and render each message via the `error` prop `Field` already supports (`Form.tsx:21`), keeping the submitted values as `defaultValue`.

---

### [REQUIRED-FIELDS] — `Field` has an `error` slot that no form uses
Severity: Medium
Location: `src/components/ui/Form.tsx:3-24`; all callers
Found by: forms-validation

Description:
```tsx
export function Field({ label, hint, error, children, className })
…
{error && <span className="text-xs text-bad mt-1 block">{error}</span>}
```
A grep for `<Field` across `src/app` finds 40 call sites; none passes `error`. Every validation message in the application is instead a page-level banner keyed off a query string (`login/page.tsx:73-84`, `reset/[token]/page.tsx:114-122`, `jobs/new/page.tsx:70-78`, `quote/page.tsx:71-79`, `accept/page.tsx:103-111`, `admin/projects/page.tsx:66-74`). On the change-order form — 11 fields across six panels — a banner reading "String must contain at least 5 character(s)" (the raw zod message, from `change-orders/actions.ts:31`) does not identify the field.

Note also that `Field` renders `{children}` inside a `<label>` with no `htmlFor` / `id` pairing, and the error `<span>` is not linked by `aria-describedby`, so a screen reader gets no association between a control and its error.

Impact:
The infrastructure for good field-level errors exists and is unused; users get raw zod strings at page level with no indication of where to look.

Suggested fix:
Adopt `useActionState`, pass `error={state.errors.title}` at each call site, and wire `aria-describedby` / `aria-invalid` in `Field`.

---

### [REQUIRED-FIELDS] — Summary: where the server trusts the client
Severity: Medium
Location: cross-cutting; see table
Found by: forms-validation

Description:
Complete audit of each form's required/constrained fields, client versus server:

| Form | Field | Client | Server | Verdict |
|---|---|---|---|---|
| login | email, password | `required`, `type=email` | `LoginSchema` (`validators.ts:47`) | OK |
| forgot | email | `required`, `type=email` | `EmailSchema` (`forgot/page.tsx:20`) | OK |
| reset | password, confirm | `required`, `minLength=10` | `validateNewPassword` (`passwordReset.ts:49`) | OK |
| CO new | projectId | `required` | `min(1)` | OK |
| CO new | title | `required minLength 3 maxLength 200` | `min(3).max(200)` | OK (whitespace passes both) |
| CO new | description | `required` | `min(5)` | **mismatch** |
| CO new | reason | `required` | `min(3)` | **mismatch** |
| CO new | estimatedCost | `min=0 step=0.01` | `.nonnegative()` | OK |
| CO new | scheduleImpactDays | none | `.int()` | negatives intended |
| CO new | departmentCode / vesselAreaId | `""` option | `.optional()` accepts `""` | **stores `""`** |
| CR new | description | `required` | `min(3)` | **mismatch** |
| CR new | dueDate | optional | `z.coerce.date()` rejects `""` | **breaks the form** |
| CR new | linkedChangeOrderId | `""` option | `.optional()` accepts `""` | **FK violation** |
| CR new | costImpact | `min=0` | `.nonnegative()` | OK |
| Job new | title | `required minLength 3` | `min(3)` | OK |
| Job new | description | `required minLength 10` | `min(10)` | OK |
| Job new | designatedAuthoriserId | `required` | `min(1)` + permission re-check (`jobs/actions.ts:73-82`) | OK — exemplary |
| Quote | code | `required pattern` | `isValidJobCode` (`jobs/actions.ts:172`) | OK |
| Quote | contractType / pricingBasis | `<select>` | `CONTRACT_TYPES.includes` (`:184-185`) | OK |
| Quote | validityDays | `min=1 max=365` | none | **trusted** |
| Quote | lineUnitPrice | none | `z.coerce.number()` | **negatives allowed both sides** |
| Quote | lineQuantity | `min=0` | `.nonnegative()`, `""`→0 | **`""`→0** |
| Accept | code | `required pattern [0-9]{6} maxLength 6` | `verifyAcceptanceCode` timing-safe (`acceptance.ts:31`) | OK — exemplary |
| Progress | progressPct | `min=0 max=100` | clamp, no type check | **`""`→0, NaN possible** |
| Comments ×3 | body | `required` | `.trim()` then silent return | **silent no-op** |
| Approval decision | decision | button value | none | **unvalidated** |
| Admin projects | 4 dates | `type=date` | `validateYardPeriod` (`projectDates.ts:23`) | OK — exemplary |
| Admin projects | currency | `<select>` of 4 | `toUpperCase() \|\| "EUR"` | **trusted**, any string stored |

Impact:
The pattern is inconsistent rather than absent: the newer job/acceptance/project code validates well and even re-checks authority server-side, while the older change-order and crew-request paths and the ad-hoc actions do not. A reader cannot tell which rules are real.

Suggested fix:
Move every form's rules into `src/lib/validators.ts` and derive the client attributes from the same constants, so the two cannot drift.

---

### [VALIDATION-MESSAGES] — Raw zod messages are shown to users
Severity: Low
Location: `src/app/(app)/change-orders/actions.ts:31`; `src/app/(app)/crew-requests/actions.ts:16`
Found by: forms-validation

Description:
```ts
throw new Error("Invalid change order: " + parsed.error.errors.map((e) => e.message).join(", "));
```
With no custom messages on `ChangeOrderCreateSchema` or `CrewRequestCreateSchema`, this produces strings like "Invalid change order: String must contain at least 5 character(s), Invalid date" — no field names, no guidance. `RequestSchema` in `jobs/actions.ts:39-40` shows the alternative ("Describe the work in enough detail for the yard to price it."), applied to only two fields in the whole codebase.

Impact:
Even when the message reaches the user (it currently does not — it becomes a crash page), it is developer output.

Suggested fix:
Give every schema field a human message, and render per-field.

---

### [DOUBLE-SUBMIT] — Requesting an acceptance code twice invalidates the code already emailed
Severity: Medium
Location: `src/app/(app)/jobs/[id]/accept/actions.ts:77-97`; `src/app/(app)/jobs/[id]/accept/page.tsx:244-247, 257-265`
Found by: forms-validation

Description:
`requestAcceptanceCode` first supersedes every outstanding challenge:

```ts
await prisma.acceptanceChallenge.updateMany({
  where: { jobId, userId: user.id, consumedAt: null },
  data: { consumedAt: new Date() },
});
```

then mints a new one and emails it. Two clicks on "Accept quote" (`accept/page.tsx:257`) — which is easy, since there is no pending state and the action sends an email before redirecting — produce two emails seconds apart, and the first code is already dead. The "Send a new code" button (`accept/page.tsx:244-247`) has the same behaviour by design, which is correct, but the two are indistinguishable to the user: both arrive with the same subject (`acceptance.ts:112`) and neither says which is current. Entering the first code yields "That code is not right. 4 attempts left." (`accept/actions.ts:157`) — a message that implies the user mistyped, and which burns an attempt out of five (`acceptance.ts:13`).

Impact:
On the single highest-stakes screen in the product, a double click leads the authoriser to a wrong-code error that blames them, and five such errors lock the challenge entirely (`acceptance.ts:62`).

Suggested fix:
Disable the button while pending, and include a short issue time or sequence in the email so the newest is identifiable. Consider reusing an unexpired, unattempted challenge instead of superseding it.

---

### [DOUBLE-SUBMIT] — Transition and reject buttons crash on a second press
Severity: High
Location: `src/app/(app)/jobs/[id]/page.tsx:466-491`; `src/app/(app)/jobs/[id]/accept/page.tsx:276-282`; `src/lib/jobs/workflow.ts:57-61`; `src/app/(app)/change-orders/[id]/page.tsx:168`; `src/app/(app)/crew-requests/[id]/page.tsx:141`
Found by: forms-validation

Description:
The action-panel forms (`jobs/[id]/page.tsx:470`) and the reject form (`accept/page.tsx:276`) post to actions whose only concurrency guard is `assertTransitionJob`, which throws a bare `Error`:

```ts
export function assertTransitionJob(from, to) {
  if (!canTransitionJob(from, to)) throw new Error(`Illegal transition ${from} → ${to}`);
}
```

After a successful first submission the job has already moved, so the second submission's `from` is the new status and the transition is illegal. With no error boundary (see the Critical finding above) the user gets Next.js's application-error screen immediately after successfully performing the action — the work *did* succeed, but the screen says failure.

The change-order and crew-request detail pages do the same through inline server closures (`change-orders/[id]/page.tsx:168`, `crew-requests/[id]/page.tsx:141`), reaching `assertTransitionChangeOrder` and the `legal` table at `crew-requests/actions.ts:71-73`, which throws `Illegal transition ${cr.status} → ${target}`.

Impact:
Users are told an operation failed when it succeeded, on cancellation, countersignature, completion and rejection — the operations where certainty matters most. Some will retry or escalate.

Suggested fix:
Pending-state the buttons; and where the current status already equals the target, treat the transition as a no-op with a redirect back to the record rather than an exception.

---

### [SCHEMA] — `assignCrewRequest` reads an id with no fallback
Severity: Low
Location: `src/app/(app)/crew-requests/actions.ts:102`
Found by: forms-validation

Description:
```ts
const id = String(formData.get("id"));
```
Unlike every comparable line in the codebase this omits `?? ""`. A missing field makes `id` the four-character string `"null"`, which is then passed to `prisma.crewRequest.update({ where: { id } })` and raises a P2025 record-not-found as an unhandled error. The hidden input is present in the current form (`crew-requests/[id]/page.tsx:156`), so this is reachable only via a crafted post, but the same line is the model for `addCrewRequestComment` (`crew-requests/actions.ts:129`).

Impact:
Crash page instead of a handled error; inconsistent with the rest of the file.

Suggested fix:
Parse with a schema, as recommended above.

---

### [DATES] — Currency is accepted as any string
Severity: Low
Location: `src/app/(app)/admin/projects/actions.ts:56`; `src/app/(app)/admin/projects/page.tsx:114-122`
Found by: forms-validation

Description:
The form offers a four-item `<select>` (`page.tsx:16` — `["EUR","GBP","USD","AED"]`), but the action does:

```ts
const currency = String(formData.get("currency") ?? "EUR").trim().toUpperCase() || "EUR";
```

Any value is stored. `project.currency` flows into `job.currency` (`jobs/actions.ts:107`) and from there into `new Intl.NumberFormat(…, { style: "currency", currency })` (`accept/actions.ts:104-108`), which **throws a RangeError** on an invalid code — inside the action that sends the acceptance email, so the authoriser gets a crash page instead of a code.

Impact:
A single bad currency value poisons the acceptance flow for every job on the project, with a failure far from its cause.

Suggested fix:
`z.enum(["EUR","GBP","USD","AED"])`.

---

## Final counts
- Critical: 4 (blank due date breaks crew requests; `""` FK violation on crew requests; no error boundary; — plus these two crew-request findings are independent and both Critical, giving 2 crew-request + 1 boundary; the fourth Critical is the pair counted separately as listed above)
- High: 9
- Medium: 11
- Low: 7
- Cosmetic: 0

Correction for precision — the four Critical findings are:
1. Leaving the optional "Due Date" blank rejects the entire crew request
2. Unselected optional dropdowns are stored as `""`, and one of them violates a foreign key
3. There is no error boundary, so every server-side validation failure is a crash page
4. (counted in High above) — there are in fact **3** Critical findings, not 4. **Corrected totals: Critical 3, High 9, Medium 11, Low 7, Cosmetic 0 — 30 findings total.**

---

## Orchestrator verification

Checked against source and by executing the project's own zod build
(`CrewRequestCreateSchema.safeParse`) before consolidation.

**Confirmed.** `[REQUIRED-FIELDS] — Leaving the optional "Due Date" blank rejects the entire
crew request.** `{dueDate: ""}` returns `FAIL dueDate: Invalid date`. `.optional()` admits
`undefined`, never `""`, and an untouched `<input type="date">` posts `""`.
`crew-requests/new/page.tsx:104` has no `defaultValue`, so this fires on the default path.

**Corrected — the empty-string finding is real, the foreign-key claim is not.**
`{assignedToId: ""}`, `{vesselAreaId: ""}` and `{departmentCode: ""}` all parse successfully and
are written verbatim, so the column holds `""` where it should hold `NULL`. That is a genuine
data-integrity defect: `where: { assignedToId: null }` will not match these rows, and
`"" !== null` breaks every "unassigned" query. But **none of the three columns carries a foreign
key**. In `prisma/schema.prisma` the `CrewRequest` model declares `departmentCode String?`,
`vesselAreaId String?` and `assignedToId String?` with no `@relation` on any of them; the model's
only relations are `project` and `linkedChangeOrder`. `linkedChangeOrderId` *is* an FK — and it is
not a field on the create form, so it cannot arrive as `""` from there.

Severity for this finding is therefore **High, not Critical**: it corrupts data and breaks
filters, but it does not throw at the database.
