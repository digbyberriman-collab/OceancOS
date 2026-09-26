# Phase 6 — Regression audit

Run against `HEAD` after Gate 6 closed (commit `04067ec` plus the G3.11 catch-up fix at the same
commit). Per `ACTION_PLAN.md`'s Gate 7: nine parallel specialist re-audits against the fixed tree,
plus a full role walkthrough. **Not a fix gate** — this document records status and new findings;
it does not resolve them. Two exceptions, noted below, were small enough and clearly enough this
session's own mistake to fix immediately rather than log and defer.

## Role walkthrough

Signed in as each of the 19 seeded roles and visited all 22 authenticated top-level routes
(dashboard, jobs, jobs/new, change-orders, change-orders/new, crew-requests, crew-requests/new,
approvals, notifications, admin, admin/projects, search, and the ten scaffold modules) — 418 page
visits total, against a fresh `db:reset`, built and served via `npm start`.

**Result: clean.** Zero HTTP 4xx/5xx responses, zero Next.js error-page renders, zero navigation
failures or timeouts. An automated console-error classifier initially flagged all 418 visits; on
inspection every flag was a false positive from one of three benign sources, not an app defect:
- `net::ERR_CERT_AUTHORITY_INVALID` on the Google Fonts `<link>` — this sandbox's outbound proxy
  doesn't present a CA the browser trusts for third-party origins; unrelated to the app.
- "Failed to fetch RSC payload... Falling back to browser navigation" — a normal Next.js
  prefetch-cache fallback, not an error condition.
- "An error occurred in the Server Components render..." — Next.js's standard production console
  notice for *any* server-thrown error, including a correctly-handled `assertPermission()` /
  `forbidden()` `ActionError` on a page a role legitimately can't reach. Cross-checked against the
  server's own stdout log: every instance traces to `kind: 'forbidden'` with the expected digest,
  i.e. the app correctly refusing access, not crashing.

No genuine anomaly survived filtering. Every role reaches every route it should, and is correctly
refused (with a rendered `Forbidden` state, not a crash) everywhere it shouldn't.

## Specialist re-audits

Nine agents, one per Phase 2 domain, each re-read their own `audit/findings-<domain>.md` in full
and verified every finding against current code (not trusting old line numbers), then
independently searched for anything new. Condensed results below; full agent reports are not
preserved verbatim here — this is the synthesis.

| Domain | Originally-tracked findings still open (not fixed, not regressed) | New findings this pass |
|---|---|---|
| accessibility | A handful of Low/Cosmetic items never in scope for G5.x (brand panel heading order, chart hover being mouse-only, a `<p>` inside a `<dl>`, `role="alert"`+`aria-live` combo on login, mobile-menu `aria-controls`, two decorative `title` attributes) | Cosmetic: `row-hover` (non-clickable row styling) now also appears on G6.9's restructured admin tables — same pre-existing defect class, wider surface, not a new one |
| auth-security | No rate limiting/lockout; `attachUploads` still trusts client-supplied storage keys; default `"dev-secret"` fallback with no fail-fast; PDF renderer trusts `Host` header; no session rotation/idle-timeout; login/reset timing side-channel; **G3.12 (suppliers permission gate) confirmed still not implemented** — none of these were ever assigned an ACTION_PLAN gate | None beyond confirming the above are still open |
| data-api | Attachment metadata unchecked at write time (impact reduced by the fixed GET-side check); real pagination UI landed only on `/jobs`, not the other list pages G4.1's own wording named; 8 read-only models still have no write path (already logged in `findings-phase5.md`) | **High: the `decideChangeOrderApproval` concurrent-decision race is not actually closed** by G3.4's transaction wrap — see below. **Medium**: `/api/uploads/sign` still echoes raw exception text (e.g. internal S3 config errors) to the caller; `updateProjectAction`'s `currency` field still accepts any string, which can throw a `RangeError` in `Intl.NumberFormat` downstream |
| dead-code | Four unused enum constants, a few module-internal unused exports, three duplicated brand-lockup snippets, two unrelated `Row` components, four dependency CVEs needing a major-version bump — all Low/Cosmetic, never gated | None |
| docs | `BRIDGE_ALIGNMENT_PLAN.md` §2's Bridge-parity table is several phases stale (describes shipped features as "Missing") | **Two mistakes in this session's own G6.3/G3.11 work, both fixed directly below rather than logged**: README's Deployment section overclaims that `SESSION_SECRET` fails fast in production (it doesn't); `SITE_MAP.md` is now stale (43 models not 46, 42 permission keys not 56, lists three since-deleted models) and README pointed to it without the same "point-in-time snapshot" caveat given to `AUDIT_REPORT.md`/`ACTION_PLAN.md` |
| forms-validation | Quote-line numeric edge cases (negative price, blank-to-zero, price-without-description, unbounded validity days); `FileDrop` upload trust/UX gaps; `Field`'s `error` prop has zero call sites anywhere in the app | **Medium**: `change-orders/new` and `crew-requests/new` were left out of the value-preservation ("flash") pattern that `jobs/new`, `admin/projects` and `login` now have — a validation failure on those two still discards every typed field (no longer crashes, but still loses data) |
| performance | `/` pays a DB session check on every anonymous visit (no middleware short-circuit); approvals page's `myCoApprovals` still unbounded with an undercounting total; notifications "mark all read" still round-trips ids instead of one `updateMany` | **Medium**: `inventory`, `documents` and `meetings` compute their summary-strip counts via `.filter().length` on a `take`-capped array — the exact bug class G4.1 fixed on risks/drawings/suppliers/contractors, missed on these three. **Low**: a few sibling queries left uncapped (`crew-requests/new`'s assignee picker, `jobs/[id]/quote`'s attachments, `admin/projects`) |
| ui-ux | Several Medium/Low items never gated (wide tables without horizontal scroll, grey status badges for several enums, footer legal links going nowhere, hard-capped 6-line quote form, uncapped animation stagger delay, no History panel on crew-request detail, "Forbidden" wording used inconsistently with other no-access copy) | **Medium**: `contractors/page.tsx` still calls `fmtMoney()` with no currency argument — the one page G3.10's currency-threading pass didn't reach. Already tracked in `findings-phase5.md` as deliberately deferred (`Contractor` has no `projectId` and no currency column at all, and no create/edit flow exists yet to set one through) |
| workflow-logic | Job/CO budget reconciliation never implemented; comment threads notify nobody; Captain/Chief Engineer can't act on their own change-order draft; crew requests can't become change orders; job-code allocation (unlike CO/CR numbers) still isn't atomic | **High: same concurrency-race finding as data-api, independently found** — plus its own instance in the job-acceptance flow: `confirmAcceptance`/`rejectQuote` in `jobs/[id]/accept/actions.ts` use plain unconditional updates rather than the `applyTransition` pattern used everywhere else, and challenge consumption isn't atomic either |

### The one finding two agents found independently: approval-chain concurrency

`src/app/(app)/change-orders/actions.ts`'s `decideChangeOrderApproval` — the sibling-approval rows
used to decide "is the chain complete" are read *before* the `$transaction` opens, and the
approval-row's own `update` isn't conditioned on `decision: "PENDING"`. Two stages decided at
effectively the same moment can each observe the other as still-pending, each conclude the chain
isn't complete, and the change order never reaches `APPROVED` even though every stage is in fact
decided. The parent `ChangeOrder.status` write does go through the conditional `applyTransition`
helper G3.4 introduced — but that only protects the parent row, not the sibling reads that feed the
decision of what to write. The equivalent gap exists in the job-acceptance flow
(`confirmAcceptance`/`rejectQuote`), which was never migrated to the `applyTransition` pattern at
all.

This is the most consequential item in this report: it's on the two paths that commit money
(change-order approval, quote acceptance), it's a real and previously-described race (Critical
finding #2 in the original `findings-data-api.md`), and G3.4's transaction wrap looks like it
should have closed it but didn't. Recorded here per Gate 7's instruction, not fixed — Phase 6 is
explicitly not a fix gate.

## Fixed directly (not logged-and-deferred)

Two documentation inaccuracies were this session's own mistakes, small, and unambiguous, so they
were corrected immediately rather than added to the backlog:

1. README.md's Deployment section claimed `SESSION_SECRET` "throws at startup rather than silently
   defaulting" alongside `STORAGE_DRIVER` and `SEED_PASSWORD`. Only the latter two actually do;
   `SESSION_SECRET` still falls back to a hard-coded literal with no guard (a real, separate,
   never-gated finding in its own right — see auth-security's table above). Corrected the README
   claim to describe what's actually true.
2. README.md described `SITE_MAP.md` as "every route, who can reach it, and what it does" without
   the same "point-in-time snapshot, not living documentation" caveat given to `AUDIT_REPORT.md`/
   `ACTION_PLAN.md` two lines below it — misleading given `SITE_MAP.md`'s own model/permission
   counts are now stale. Added the same caveat.

## `audit/findings-phase5.md` status

Four entries, all triaged with an explicit rationale for staying open (test-isolation ordering,
a `qa.ts` query-stability fix already applied separately, five read-only models needing a scoped
feature build, and `Contractor`'s missing currency column needing a schema change plus a create/
edit flow that doesn't exist yet). None needed further action for Gate 7. Per the gate's own
wording ("empty or triaged") this file satisfies the requirement.

## Recommendation

Gate 7 (regression) is complete: the role walkthrough is clean, no fix from Gates 0–6 regressed,
and every re-audit's findings are either previously-known-and-deferred or newly surfaced here for
a decision. The codebase is materially more solid than at the Phase 2 audit. It is not, however,
a fully clean slate — the approval-chain/acceptance concurrency race in particular is a genuine,
previously-identified Critical-class gap that a transaction wrap was expected to close and didn't.
Recommend a short follow-up cycle scoped to: the concurrency race (both instances), G3.12
(suppliers permission gate, already explicitly deferred pending a decision on the permission key
and role grant), the upload-sign error leak, and the two forms left out of the flash pattern —
before treating this codebase as done rather than substantially remediated.
