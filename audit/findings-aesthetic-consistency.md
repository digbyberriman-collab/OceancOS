# Aesthetic consistency — audit findings

A second, deeper pass over `audit/findings-ui-ux.md` and `AUDIT_REPORT.md`, scoped specifically to
cross-page aesthetic and structural consistency — not novel bugs, not accessibility, not workflow
logic. Anything already logged under those files is cited by ID and not repeated. Method: full read
of every `page.tsx` under `src/app/(app)/` plus the four public pages, every shared component under
`src/components/ui/`, `src/components/workflow/`, `src/components/dashboard/` and
`src/components/layout/`, `tailwind.config.ts` and `src/app/globals.css`; then a live pass against
the running app (`http://127.0.0.1:3001`) as `owner@oceancos.dev`, `pm@oceancos.dev` and
`crew@oceancos.dev`, at 1440×900 and 390×844, with full-page screenshots under
`/tmp/audit-scripts/screenshots/` (not part of this repo) used to confirm every source-level claim
below actually renders as described.

## Count by severity
- **Critical: 0**
- **High: 0**
- **Medium: 4**
- **Low: 6**
- **Cosmetic: 0**
- **Total: 10**

## Five most consequential
1. **[TYPOGRAPHY/SPACING] — Three incompatible "titled card section" header components are all in live use for the same structural role** (Medium) — the single most-reused primitive in the codebase has no single definition.
2. **[FORMS] — The three creation forms (jobs/new, change-orders/new, crew-requests/new) use two different card architectures, two different section-header colours, and mirror-image submit-button alignment** (Medium)
3. **[EMPTY STATES] — "You don't have permission" renders as two entirely different UI shells depending on which guard style the page happens to use** (Medium)
4. **[FILTERS] — Three incompatible implementations of "filter this list" coexist, and seven of the ten scaffold list pages have none at all** (Medium)
5. **[TABLES] — `row-hover` gives the whole row a pointer cursor and hover background on the app's three flagship tables, but only the identifier cell's inner `<Link>` actually navigates** (Medium)

---

## What this pass did not re-log

Confirmed still true in the current tree and cited here by ID rather than repeated:
- ui-ux `[SCAFFOLDS]` — the ten list-only modules, and `row-hover` being fully dead on eight of them.
- ui-ux `[EMPTY STATES]` (the "instructs an impossible action" one) and the three-panels-vanish-when-empty one.
- ui-ux `[CONSISTENCY]` — page-title casing, four wordings for "no access", redundant button-class combos, missing Cancel on change-orders/new and crew-requests/new (this pass's [FORMS] finding below is a superset of the Cancel point, so the two should be read together, not added).
- ui-ux `[RESPONSIVE]` (C12, sidebar) and the seven-tables-no-overflow-wrapper and project-switcher-hidden Mediums. The mobile captures taken for this pass (`mobile-owner-*.png`) reproduce C12 exactly as described and surfaced nothing further beyond it.
- ui-ux `[LOADING STATES]` (High) — still true, and uniform: `grep -rn "loading.tsx" src/app` and `grep -rn "Suspense" src` both return nothing anywhere, built or scaffold alike. Because the absence is total and even, there is no cross-page *inconsistency* to log on this axis — every page fails the same way. See ui-ux `[LOADING STATES]` and `AUDIT_REPORT.md` §G3.8.
- ui-ux `[DESIGN TOKENS]` (STATUS_TONE gaps) and AUDIT_REPORT.md §7's confirmation that badge/status colours otherwise pass contrast.
- `AUDIT_REPORT.md` §7's note that `error.tsx`/`(app)/error.tsx` etc. did not exist at audit time — they exist now (`src/app/error.tsx`, `src/app/(app)/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, per G1.1). Their arrival is what surfaces this pass's [EMPTY STATES] finding below, which is new precisely because that boundary is new.

---

## [PAGE HEADERS]

### Detail pages duplicate the "back" link at the top and the bottom on two of three built modules, but not the third
Severity: Low
Location: `src/app/(app)/change-orders/[id]/page.tsx:70-76` (top) and `:355-357` (bottom);
`src/app/(app)/crew-requests/[id]/page.tsx:56-60` (top) and `:215-217` (bottom); compare
`src/app/(app)/jobs/[id]/page.tsx:114-118`, which has the link only once, at the top.
Screenshots: `owner-co_detail.png` (shows the bottom "Back to Change Orders" link below History/Comments), `owner-job_detail.png` (no equivalent link at the bottom).
Found by: aesthetic-consistency pass

Description:
All three detail pages open with an identical `<ArrowLeft>` + text breadcrumb link above the
`PageHeader` (`Change Orders` / `Crew Requests` / `Quotes & requests`). Change orders and crew
requests then repeat the same link, with the same icon and near-identical copy ("Back to Change
Orders" / "Back to Crew Requests"), a second time at the very bottom of the page, after Comments
and History. The job detail page — the most complete of the three — has no such second copy.

Impact:
A page that is 500+ lines long and ends in a duplicate of its own top-of-page navigation reads as
unfinished, and the duplication is pure upkeep cost: two link labels to keep in sync with the route
instead of one. Not a broken link, just a copy-paste remnant that the third, otherwise-least-built
detail page happens not to have.

Suggested fix:
Remove the bottom link from `change-orders/[id]/page.tsx` and `crew-requests/[id]/page.tsx`; the
identical top breadcrumb already exists on every detail page and does the job.

---

## [BUTTON PLACEMENT]

### The header's `actions` slot means something different on list pages than on detail pages
Severity: Low
Location: list pages — `jobs/page.tsx:93-104`, `change-orders/page.tsx:56-69`,
`crew-requests/page.tsx:61-68` (primary "New …" CTA lives in `PageHeader`'s `actions` prop,
top-right); detail pages — `jobs/[id]/page.tsx:126-142`, `change-orders/[id]/page.tsx:80-97`,
`crew-requests/[id]/page.tsx:80-92` (the same `actions` slot holds only a `StatusBadge` and
secondary controls — Favourite, Print/PDF, export — never the primary state-changing action,
which instead lives in a separate mid-page card: `jobs/[id]/page.tsx:461-500` "Workflow Actions" /
quote / accept panels, `change-orders/[id]/page.tsx:169` transition buttons,
`crew-requests/[id]/page.tsx:142` transition buttons).
Found by: aesthetic-consistency pass

Description:
This is consistent *within* each page type — all three list pages put the primary CTA top-right in
the header, and all three detail pages keep the header for identity/status only and push every
transition button into a body panel — so it is not a bug. But it means the answer to "is the
primary action always in the same relative position" is no: it depends on whether you're on a list
or a detail screen, and that split is implicit rather than documented anywhere.

Impact:
Low on its own, but it is exactly the kind of thing a future page-by-page rebuild will get wrong by
accident (e.g. someone "fixing" a detail page by moving its primary action into the header to match
the list pages) unless the rule is written down. See `DESIGN_CONSISTENCY_SPEC.md`.

Suggested fix:
No code change needed; document the two positions as two distinct, intentional rules (see the spec
document) so the split survives the next contributor.

---

## [MODALS]

### No Dialog/Modal/Drawer primitive exists anywhere, and no destructive action has a confirmation step
Severity: Low
Location: `grep -rn "Dialog\|Modal\|Drawer" src` — no matches. `grep -rn "confirm(" src
--include=*.tsx --include=*.ts` — no matches outside the unrelated `AcceptanceChallenge`/reset-token
domain. Immediate-fire destructive buttons: `approvals/page.tsx:250-260` ("Reject" sits beside
"Approve" in one `<form>`, submits on first click), `crew-requests/[id]/page.tsx:142` and
`change-orders/[id]/page.tsx:169` (transition buttons, including terminal/rejecting transitions).
Found by: aesthetic-consistency pass

Description:
`src/components/ui/` has no dialog, modal or drawer component of any kind, and nothing in the app
ever opens an overlay. Every multi-step or destructive-feeling action — rejecting a change order or
crew request, moving a job to a terminal status — is a single form-submit button with no "are you
sure?" interstitial, sitting directly beside its opposite (Approve/Reject, Back to Work/Complete/
Reject) in the same row. This is *consistent* — nothing in the app uses a modal for some destructive
actions and skips it for others, because nothing uses one at all — but it means the axis this pass
was asked to check ("does a modal exist, and is it used consistently, and would a modal fit better
than the current pattern somewhere") resolves to "there is no modal pattern to be consistent about."
Given the app's largest creation flows (`jobs/new`, `change-orders/new`) are already full pages
rather than modals, that choice is reasonable and consistently applied — the gap is specifically
around confirming irreversible decisions, not around create/edit flows.

Impact:
Not a defect today (this is a deliberate, uniform absence, not a broken half-built feature), but it
is a real product surface — approving/rejecting money and safety-relevant items with one click — that
a future rebuild needs to decide about once, deliberately, rather than have each future module invent
its own answer. Recorded here so the decision is explicit rather than accidental. This is a different
angle from the already-logged "no pending state on any form" High finding (`ui-ux [DEAD BUTTONS]`),
which is about missing *latency* feedback, not missing *confirmation*.

Suggested fix:
Decide, once, whether destructive/irreversible transitions get a confirmation step (a lightweight
`<ConfirmDialog>` primitive, or a two-click "Reject — are you sure?" affordance) and apply it
everywhere such a transition exists, rather than leaving it to be added ad hoc per module as the
scaffolds are built out.

---

## [EMPTY STATES]

### "You don't have permission" renders as two entirely different UI shells, one of which offers a button that cannot do anything useful
Severity: Medium
Location: inline-check pages (return `<EmptyState>` directly, no buttons at all) —
`jobs/new/page.tsx:20-22`, `jobs/page.tsx:31`, `jobs/[id]/quote/page.tsx`, `admin/page.tsx:14`,
`admin/projects/page.tsx:27` (partially — see below), `contractors/page.tsx:13`,
`documents/page.tsx:14`, `drawings/page.tsx:14`, `meetings/page.tsx:14`, `risks/page.tsx:28`.
Throwing-check pages (call `assertPermission()`, which throws and is caught by
`src/app/(app)/error.tsx`) — `change-orders/new/page.tsx:14`, `crew-requests/new/page.tsx:14`, and
by extension every server action guarded the same way. `error.tsx:35-71` is the second shell.
Screenshots: `owner-_jobs_new.png` (plain "Forbidden" text box, no icon, no buttons) vs.
`owner-_change-orders_new.png` (bordered card, Lock icon, "Not permitted" heading, two buttons),
captured back-to-back for the same signed-in user navigating between two adjacent sidebar items.
Found by: aesthetic-consistency pass (builds on, but is a distinct finding from, ui-ux
`[CONSISTENCY]` — "four different wordings for the same forbidden state", which only covers copy)

Description:
Two different guard styles produce two different component trees for the identical outcome. The
`hasPermission()` style renders the shared `<EmptyState>` component — title, hint text, nothing
else, no icon by default. The `assertPermission()` style throws an `ActionError("forbidden")`,
which `(app)/error.tsx` renders as a bordered card with a Lock icon, the heading "Not permitted",
and two buttons: "Try again" (calls `reset()`) and "Back to dashboard". "Try again" is meaningless
here — the permission has not changed, so retrying reproduces the identical rejection — but it is
styled identically to `.btn-primary` and sits first, so it reads as the obvious next step.

Impact:
Any role lacking `CO_CREATE` or `CR_CREATE` (several of the nineteen roles, including ones with
seeded accounts) who clicks the always-visible "New Change Order" or "New Request" sidebar links —
the same click that produces a plain, static, no-button message on "New quote request" one item up —
lands on a screen with a lock icon and a primary-styled button whose only effect is to reproduce the
same screen. It is not broken (the "Back to dashboard" escape hatch works), but it is a materially
different, more alarming-looking experience for what is, from the user's point of view, the same
situation they just saw one click earlier.

Suggested fix:
Pick one shell for "you cannot do this" and route both guard styles through it. Since
`(app)/error.tsx` and `<EmptyState>` already share the same icon-box classes
(`h-12 w-12 rounded-xl bg-ink-800 ring-1 ring-line`), the fix is mechanical: either make
`assertPermission()`-guarded pages check `hasPermission()` first and return `<EmptyState>` before
ever throwing (matching the majority pattern), or give `EmptyState`'s "Forbidden" usage the same
icon + "Back to dashboard" link and drop "Try again" from the `forbidden`-kind branch of
`error.tsx` specifically, since retrying can never change a permission check's outcome.

---

## [TABLES]

### `row-hover` promises the whole row is clickable; on the three built list pages, only one cell in each row actually is
Severity: Medium
Location: `src/app/globals.css:109-111` (`.table-base tr.row-hover:hover { @apply bg-ink-800/60
cursor-pointer; }` — applies to the whole `<tr>`); `jobs/page.tsx:245` (`<tr key={job.id}
className="row-hover">`, only the code cell at `:246-250` is a `<Link>`);
`change-orders/page.tsx:147` (only the number and title cells, `:150-166`, are `<Link>`s of the
row's seven columns); `crew-requests/page.tsx:145` (same — only the number/title cells of seven
navigate). Compare `approvals/page.tsx:115` and `:189`, whose rows correctly carry **no**
`row-hover` class because no part of those rows navigates.
Found by: aesthetic-consistency pass

Description:
`.row-hover` is a server-rendered CSS class with no accompanying click handler on the `<tr>` itself
— it exists purely to signal "this row goes somewhere" via background-tint and `cursor: pointer` on
hover. On the app's three most-developed, most-tested list pages, that signal covers the entire row
(status badge, priority, cost, dates, progress bar), but the actual destination is only reachable by
clicking the narrow identifier or title text inside the first one or two cells. Hovering over the
Status, Cost, Schedule Δ or Created columns shows the same pointer cursor and the same row highlight
as hovering the title, then does nothing on click.

Impact:
This is the inverse of the already-logged `[SCAFFOLDS]` finding, where `row-hover` rows are
*entirely* dead in the eight unbuilt modules. Here the rows are mostly navigable, which makes the
failure mode worse in a different way: a user learns from the working portion of the row that the
whole row navigates, then loses that trust the first time they click a cell outside the narrow
link area on Jobs, Change Orders or Crew Requests — the three modules the platform is best at.

Suggested fix:
Either wrap the whole `<tr>` in a client-side click handler that navigates to the same href the
inner `<Link>` uses (keeping the inner `<Link>` for keyboard/screen-reader access and correct
`<a>` semantics), or drop `row-hover` from the `<tr>` and move the hover affordance onto just the
cells that are genuinely links, matching what `approvals/page.tsx` already does correctly for rows
with no navigation at all.

---

## [FILTERS]

### Three incompatible implementations of "filter this list" coexist, and seven of the ten scaffold list pages have none
Severity: Medium
Location: shared component — `src/components/workflow/FilterBar.tsx` (bordered `.surface` bar,
labelled `FilterField`s, an "Apply filters" + "Reset" button pair, a result-count footer row),
used by `change-orders/page.tsx:104-124` and `crew-requests/page.tsx:71-124`. Bespoke minimal
version — `jobs/page.tsx:157-171` (a bare `<form action="/jobs">` with one search input and a
separate "Favourites" toggle button, no `.surface` wrapper, no Reset control, no result-count
footer; the count is instead a custom line at `:190-196`). Bespoke re-implementation —
`inventory/page.tsx:101-159` (its own `.surface p-3.5` bar with Search/Category/Status fields and
one "Apply" button, no Reset link, no result-count footer). No filter or search control of any
kind — `logistics/page.tsx`, `schedule/page.tsx`, `drawings/page.tsx`, `documents/page.tsx`,
`meetings/page.tsx`, `risks/page.tsx`, `contractors/page.tsx`, `suppliers/page.tsx` (confirmed by
`grep -n "FilterBar\|Apply\|Reset" ` returning nothing in any of the eight).
Found by: aesthetic-consistency pass (distinct from ui-ux `[CONSISTENCY]`'s "Apply filters vs.
Apply" wording-only Low finding, which does not address the structural divergence below it)

Description:
`FilterBar` is a real, reusable, correctly-built shared component, used by exactly two of the twelve
filterable list pages. Jobs — the platform's flagship module — reimplements the idea from scratch
with a visibly different, much sparser layout (no card border, no Reset, no count footer).
Inventory reimplements it a third way, close enough in appearance to `FilterBar` (`.surface` bar,
labelled fields, a button on the right) to look like the same component at a glance, but missing
the Reset link and the footer that `FilterBar` provides for free. The other eight scaffold list
pages simply have no way to narrow the list at all, which will matter as soon as any of them holds
more than a screenful of rows.

Impact:
A user who learns "type a value, click Apply filters, click Reset to clear it" on Change Orders
gets no Reset button on Quotes & Requests or Inventory (they have to clear the URL manually or use
the browser back button), and no filtering mechanism whatsoever on eight other pages reachable from
the same sidebar. The skill does not transfer between modules that all look, at a glance, like the
same kind of screen.

Suggested fix:
Route `jobs/page.tsx`'s search box and `inventory/page.tsx`'s filter form through the existing
`FilterBar`/`FilterField` components instead of hand-rolling the same idea a second and third time;
jobs' section/view tabs are a legitimately different, additional control and can sit above the
shared `FilterBar`, not replace it.

---

## [FORMS]

### The three auth-flow pages disagree on whether the form sits inside a card
Severity: Low
Location: `src/app/login/page.tsx:61` (`<div className="surface p-6 shadow-raised sm:p-7">`
wraps the whole form); `src/app/forgot/page.tsx:106-117` (identical `<form>` markup, no `.surface`
wrapper, sits directly on the page's ambient gradient background); `src/app/reset/[token]/page.tsx:124-145`
(same — no wrapper). Screenshots: `public-login.png` (a visibly bordered, raised panel around the
two fields) vs. `public-forgot.png` (fields floating on the background with no boundary).
Found by: aesthetic-consistency pass

Description:
Sign in, Forgot password and Reset password are one linear flow, and two share every other visual
choice (the same `BrandPanel`, the same `max-w-sm` column, the same `Field`/`Input` components, the
same `btn-primary btn-lg w-full` submit button) — except that only the first page puts a `.surface`
card boundary and drop shadow around its fields. The other two present the identical field markup
with no enclosing surface at all.

Impact:
A user who resets their password sees three consecutive screens, one of which looks visually
"finished" (raised, bordered) and two of which look unstyled by comparison, in a flow whose entire
purpose is to reassure an anxious, locked-out user that they are still inside the real product.

Suggested fix:
Wrap the `forgot` and `reset` forms in the same `<div className="surface p-6 shadow-raised sm:p-7">`
`login` already uses, or remove it from `login` — either way, pick one and apply it to all three.

### The three creation forms diverge on card architecture, section-header colour, and submit-button alignment
Severity: Medium
Location: `jobs/new/page.tsx:81-166` — one `<SectionCard title="Request">` (single card, header
`text-xs font-semibold uppercase tracking-[0.12em] text-muted` with a `border-b border-line`,
`src/components/workflow/SectionCard.tsx:26`), fields in `sm:grid-cols-2` pairs where related,
submit row `<div className="flex items-center gap-3">` at `:163-166` — primary button first,
`Cancel` link beside it, block left-aligned. `change-orders/new/page.tsx:35-179` and
`crew-requests/new/page.tsx:38-141` — six raw `.surface` `<div>`s stitched edge-to-edge
(`rounded-b-none` / `rounded-none` / `rounded-t-none`, no border between them), each headed by the
`.eyebrow` utility class (`text-[11px] font-semibold uppercase tracking-[0.18em] text-marine` —
bright cyan, no divider), mostly single-column fields, and a submit row
`flex items-center justify-between` (`change-orders/new/page.tsx:163-172`,
`crew-requests/new/page.tsx:130-137`) that right-aligns the lone primary button against explanatory
copy on the left, with no Cancel control at all (already logged narrowly as ui-ux
`[CONSISTENCY]`, Medium — this finding is the architecture and alignment divergence around it, not
just the missing button).
Screenshots: `pm-form-_jobs_new.png` vs. `pm-form-_change-orders_new.png`.
Found by: aesthetic-consistency pass

Description:
`.eyebrow` is defined and used everywhere else in the app as a small kicker line above an `<h1>`
(e.g. "WORKFLOW" above the "Change Orders" title) — a page-level label, not a section-level one.
Change-orders/new and crew-requests/new repurpose it as an inline sub-heading for six card-like
regions of one long form, which is a second, incompatible use of a class designed for something
else, and it produces a visibly different colour (bright cyan vs. `SectionCard`'s muted grey) and
size (11px vs. 12px) from the one existing "titled section" component the app already has. The
submit row is also a mirror image: jobs/new's primary action sits on the left with an explicit way
out; the other two put the primary action on the right with no way out beside scrolling back to the
top-of-page breadcrumb.

Impact:
These are the only three "create something" screens in the entire application, and a user moving
between them (a PM raising a change order, then a crew request, then a quote request — a completely
ordinary sequence) meets three different card systems, sees the section-header colour and case
change, and has to notice the primary button has moved from one side of the screen to the other and
lost its neighbouring Cancel link.

Suggested fix:
Standardise on `SectionCard` for all three — it already provides the bordered header bar,
`headerRight` slot and consistent padding `.eyebrow`-as-section-header does not — and standardise the
submit row on jobs/new's left-aligned `Primary + Cancel` pattern, moving any "this will be saved as
Draft" explanatory copy to a `hint` under the button group rather than beside it.

---

## [TYPOGRAPHY/SPACING]

### Three incompatible "titled card section" header styles are all in live use for the same structural role
Severity: Medium
Location: `SectionCard` — `src/components/workflow/SectionCard.tsx:26` —
`text-xs font-semibold uppercase tracking-[0.12em] text-muted`, inside a bordered header bar
(`px-5 py-3.5 border-b border-line`); used throughout the jobs/change-order/crew-request detail
pages. `Panel` — `src/components/dashboard/Panel.tsx:20` —
`text-sm font-semibold text-white tracking-tight`, sentence case, no border, no header bar, with an
optional "label →" link in the same row (`:21-29`); used **only** on the dashboard
(`grep -rln "from \"@/components/dashboard/Panel\"" src` returns exactly one file). `.eyebrow`
utility — `src/app/globals.css:199-201` —
`text-[11px] font-semibold uppercase tracking-[0.18em] text-marine`; designed as a page-level
kicker (see every `PageHeader eyebrow="…"` usage) but reused as an inline section header inside
`change-orders/new` and `crew-requests/new` (see the [FORMS] finding above).
Found by: aesthetic-consistency pass

Description:
Three different sizes (11px / 12px / 14px), three different colours (marine cyan / muted grey /
white), and two different letter-cases (uppercase-tracked / sentence-case) all currently mean "here
is a labelled group of content" somewhere in this app, and which one appears on a given screen is
purely a function of which page happened to be built when and by which pattern its author copied.
This is the single most structurally significant finding in this pass because `SectionCard` and its
siblings are the most-reused non-trivial primitive in the codebase — nearly every non-scaffold
screen has at least one titled section — and there is no canonical definition among the three.

Impact:
A contributor adding a new titled panel to a scaffold module as it gets built out (per
`ACTION_PLAN.md` Gate 3+) has no way to know which of the three existing patterns is "the" pattern;
copying whichever file happens to be nearby perpetuates the split indefinitely.

Suggested fix:
Adopt `SectionCard` as the one component (it already has the most complete feature set: a bordered
header bar, an optional `headerRight` slot, and a `noPad` escape hatch for table content). Migrate
`Panel`'s two current dashboard usages that need a "view all" link by adding that as a
`SectionCard` `headerRight` node, and stop using `.eyebrow` for anything but its original job — a
kicker directly above an `<h1>`.

### Three incompatible "stat tile" implementations render the same kind of summary number
Severity: Low
Location: dashboard-only component — `src/components/dashboard/StatCard.tsx` (icon in a
tone-coloured ring, optional `href` making the whole tile a link; used only in
`dashboard/page.tsx`). Hand-built pattern A — raw `.stat-card` plus a glued-on coloured 2px accent
strip, repeated verbatim across six files: `admin/page.tsx:42-61`, `risks/page.tsx:61-92`,
`contractors/page.tsx:38-56`, `drawings/page.tsx:44-63`, `documents/page.tsx:48-67`,
`meetings/page.tsx:46-60` (each: `<div className="absolute bottom-0 left-0 right-0 h-0.5
rounded-b-xl bg-{tone}/60" />`). Hand-built pattern B — `financials/page.tsx:57-76`, the same raw
`.stat-card` class as the six above but with **no** accent strip, making it the odd one out even
among its closest siblings.
Found by: aesthetic-consistency pass

Description:
Three visually distinct treatments exist for "a label, a number, and what the number means":
icon + coloured ring + optional link (dashboard); label + number + coloured bottom strip, no icon,
no link (six other pages, all copy-pasted); label + number with nothing else (financials). No
shared component backs the second pattern despite it being duplicated six times with only the tone
colour changing between call sites.

Impact:
Purely cosmetic today, but the six-file duplication means any future change to the pattern (e.g.
adding an icon, or making the tiles clickable like the dashboard's) requires editing six files
identically and remembering that a seventh, financials, needs the strip added rather than matched.

Suggested fix:
Extract the six-file pattern into a `MiniStat` component (label, value, tone) and use it in all
seven places, including financials with its tone-appropriate strip. Reserve `StatCard` for tiles
that are genuinely links, per its existing `href` prop.

---

## [RESPONSIVE]

Reviewed against the mobile (390×844) captures for `/dashboard`, `/jobs`, `/change-orders/new`,
`/schedule` and `/financials`. All reproduce C12 (the fixed 240px sidebar) exactly as already
logged, and nothing distinct from C12 or the two already-logged Medium findings
(`[RESPONSIVE] — seven wide tables have no horizontal scroll container`, `[RESPONSIVE] — the
project switcher is hidden below md`) was found. No new finding recorded for this axis.
