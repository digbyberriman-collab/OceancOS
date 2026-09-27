# OceancOS — Design consistency spec

What every page must do, on each axis below, stated as a single checkable rule. Every rule is
derived from whichever existing implementation already does that thing best — cited by file — not
invented from scratch, except where noted. This is the standard the page-by-page rebuild
(`ACTION_PLAN.md` Gates 2–3, and the ten scaffold modules as they get built out) is measured
against. Findings that motivate each rule are in `audit/findings-aesthetic-consistency.md`; do not
re-derive them here.

Tokens referenced below are the ones already defined in `tailwind.config.ts`: `ink` (950→500),
`line` (`DEFAULT`/`soft`/`strong`), `accent` (`DEFAULT`/`soft`/`bright`), `marine`, `ok`, `warn`,
`bad`, `muted`, `faint`. No new tokens are introduced by this spec.

---

## 1. Page header

**Rule:** every page's `<h1>` and its primary action button both live inside one
`<PageHeader>` call (`src/components/ui/EmptyState.tsx:28`), placed as the first element in the
page body. `eyebrow` (optional, `.eyebrow` class — cyan kicker) sits above the title; `subtitle`
(optional) sits below it; `actions` sits top-right of the title, vertically centred against it.
This is already the universal pattern — every one of the 33 pages that has a heading at all uses
`<PageHeader>` — so the rule is "keep doing this," not a change.

**On a list page:** `actions` holds, left to right, any secondary export/utility control (e.g.
`<a className="btn">…</a>` for a spreadsheet download) followed by the one primary
create-new-record button as `<Link className="btn-primary btn-lg">`. Cite: `jobs/page.tsx:93-104`,
`change-orders/page.tsx:56-69`. If the user lacks the create permission, the primary button is
omitted entirely — never disabled, never replaced with an explanation in the header.

**On a detail page:** `actions` holds only identity/status information (a `<StatusBadge>`, a
`<PriorityBadge>`) and secondary, non-destructive controls (Favourite, Print/PDF export). The
primary, state-changing action (Approve, Transition, Accept, Save) never lives in the header — it
lives in a `<SectionCard>` in the page body (see §6). Cite: `jobs/[id]/page.tsx:126-142`,
`change-orders/[id]/page.tsx:80-97`. This is a deliberate two-position rule, not one position: list
headers hold the primary CTA, detail headers never do.

**Breadcrumb:** every detail and "new" page carries exactly one `<ArrowLeft>` + text link, placed
directly above `<PageHeader>`, pointing at the list it came from. Cite the correct, single-instance
pattern: `jobs/[id]/page.tsx:114-118`. **Do not** repeat the same link at the bottom of the page —
`change-orders/[id]/page.tsx:355-357` and `crew-requests/[id]/page.tsx:215-217` currently do and
should be deleted, not copied forward.

---

## 2. Button hierarchy

**Rule:** three button classes, defined once in `src/app/globals.css:127-150`, cover every case:
- `.btn-primary` — the one primary action per screen (create, submit, approve).
- `.btn` — secondary/neutral actions (export, print, cancel-adjacent utility actions, Request Info).
- `.btn-ghost` — tertiary/low-emphasis actions (Cancel, Back).
- `.btn-danger` — the one destructive action per screen (Reject).
- `.btn-lg` is an additive size modifier for a screen's single most important button (page-level
  primary CTAs, auth submit buttons); never combine two variant classes on one element (e.g.
  `"btn btn-primary"` — already flagged as ui-ux `[CONSISTENCY]`, still true, fix in place).

**Primary-action position is per context, not universal** (see §1): top-right of the `<h1>` on
list pages; inside a body `<SectionCard>` on detail pages; see §7 for forms. Do not "fix" a detail
page by moving its primary action into the header to match a list page — that is two different,
intentional rules, not an inconsistency.

**Row-action buttons**, where a table needs them (only `approvals/page.tsx:104-155` currently
does), sit in a trailing column headed "Action", never at the start of the row. Every other table
puts navigation in the row's identifying cell (first or second column) instead of a button — pick
whichever of the two a given table needs (an action the user decides on inline, vs. simple
navigation to a detail page) and do not mix both idioms in one table.

---

## 3. Modals / dialogs / drawers

**Current state:** no Dialog, Modal or Drawer component exists anywhere in the codebase, and none
is used. This is uniform, not inconsistent, so there is nothing to standardise on today — but two
rules should hold as the app grows:

**Rule A — creation stays full-page.** `jobs/new`, `change-orders/new` and `crew-requests/new` are
already full navigations, not modals, and that is correct for forms this size (attachments, 6+
sections, validation that benefits from its own URL for error recovery). Do not introduce a modal
for creating a Job, Change Order or Crew Request; keep using a dedicated route.

**Rule B — irreversible transitions get a confirmation step.** None currently exists anywhere
(Approve/Reject/Reject-terminal buttons all fire on first click — see
`audit/findings-aesthetic-consistency.md` [MODALS]). Since nothing in the app already does this
well, the proposal (not derived from an existing pattern, per the brief's exception clause): a
single `<ConfirmButton>` client component wrapping `.btn-danger` actions, built from existing
tokens only — a small `role="alertdialog"` popover anchored to the button, `bg-ink-850 border
border-line-strong shadow-floating`, with the action's own label plus a `.btn-ghost` "Cancel" and a
`.btn-danger` "Confirm". No new color tokens; reuse `shadow-floating` (already defined,
`tailwind.config.ts:52`, currently unused) for the elevation. Apply it to every `.btn-danger` in
the app the first time one is wired to a real destructive action, so the pattern exists before a
second one is invented independently.

---

## 4. Empty states

**Rule:** every "no rows" and every "no access" condition renders through the shared
`<EmptyState>` component (`src/components/ui/EmptyState.tsx:3-26`) — `icon` in the 12×12
`bg-ink-800 ring-1 ring-line rounded-xl` box, `title` as `text-base font-semibold text-white`,
optional `hint`, optional `action`. This is already followed for "no rows" everywhere (see
`audit/findings-ui-ux.md` for the copy/action-prop gaps still to fix on nine pages — unchanged by
this spec).

**"No permission" must use this same component, always** — never let a permission check throw and
fall through to the error boundary. Concretely: every page-level permission gate is
`if (!hasPermission(user, PERM)) return <EmptyState title="…" hint="…" icon={<Lock size={20}
/>} />;`, checked *before* any code that could throw `assertPermission`'s `forbidden()`.
`assertPermission()` remains correct for **server actions** (where there is no page to render
around a check — a thrown `ActionError` there is correct and already the standard, per
`AUDIT_REPORT.md` G1.1) but must not be the sole guard on a **page component**. Cite the two
`page.tsx` files to fix: `change-orders/new/page.tsx:14`, `crew-requests/new/page.tsx:14` — add the
same `hasPermission()` check every other `new`/list page already has, ahead of the existing
`assertPermission()` call the server action underneath still needs.

**Wording:** one sentence, no HTTP jargon ("Forbidden" is banned per ui-ux `[CONSISTENCY]`,
unchanged by this spec) — e.g. "You don't have access to Change Orders — ask your project manager
if you need it."

---

## 5. Loading states

**Current state:** no `loading.tsx`, no `<Suspense>`, anywhere (`ui-ux [LOADING STATES]`, still
High, unfixed as of this pass). Nothing to reconcile across pages because nothing exists on any of
them — this spec's rule is simply what closes that finding, restated as a checkable target:

**Rule:** `src/app/(app)/loading.tsx` renders a skeleton built from the existing, already-defined
`.shimmer` utility (`globals.css:220-234`) and `.surface`/`.stat-card` shapes — a row of four
`.stat-card`-shaped shimmer blocks plus one full-width `.surface` shimmer block, matching the
general shape every list and dashboard page already has above the fold. Add a heavier per-route
`loading.tsx` (mirroring that route's actual layout more closely) only for `dashboard`, `jobs`,
`search` and `financials`, per `AUDIT_REPORT.md` G3.8 — do not invent a second skeleton visual
language; every `loading.tsx` in the app reuses the same shimmer treatment.

---

## 6. Table pattern

**Rule — container:** every table sits inside `<div className="surface overflow-hidden"><div
className="overflow-x-auto"><table className="table-base">`. This is already the pattern on 15 of
22 tables; the seven missing the `overflow-x-auto` wrapper (`ui-ux [RESPONSIVE]`, still Medium,
unfixed) should be brought in line with the majority, not the other way round.

**Rule — header:** `<thead><tr><th>` per `.table-base th` (`globals.css:99-101`) — 11px uppercase
tracked muted-grey — visible by default. Use `<thead className="sr-only">` (as `jobs/page.tsx:232`
does) only when a visual header would duplicate an adjacent, already-visible column-group heading;
in that case the number of `sr-only` `<th>`s must equal the number of `<td>`s in every row (fix the
existing four-header/five-column mismatch at `jobs/page.tsx:232-239`, per ui-ux's accessibility
finding — unchanged by this spec, just restated as the rule this brings it in line with).

**Rule — row density and click target:** `table-base td` (`globals.css:102-104`) — no per-page
padding overrides. A row gets the `row-hover` class **if and only if** the entire row shares one
click destination; when that is true, wrap the whole `<tr>` in a click-through (a small client
`<TableRow href="…">` that renders `<tr onClick={...} className="row-hover">`) so every cell, not
just the identifier cell, actually navigates — closing the mismatch in this pass's [TABLES]
finding. A row with per-cell affordances instead (row-level action buttons, or multiple links to
different destinations) never carries `row-hover`; `approvals/page.tsx`'s plain `<tr>` rows are the
existing correct example.

**Rule — row actions:** when a row needs one or more buttons rather than plain navigation, they go
in a single trailing `<td>` headed `"Action"` (or a case-appropriate label), left un-padded
extra beyond the table's own `px-3.5 py-2.5`, buttons laid out `flex gap-1.5 flex-wrap`, sized
`text-xs py-1 px-2.5`. Cite: `approvals/page.tsx:250-260`, the only and correct existing example.

---

## 7. Form layout

**Rule — container:** every form's fields live inside one `<SectionCard title="…">`
(`src/components/workflow/SectionCard.tsx`), not a stack of raw `.surface` divs. Cite the correct
example: `jobs/new/page.tsx:81` (`<SectionCard title="Request">` wraps the whole form). Rebuild
`change-orders/new/page.tsx:35-179` and `crew-requests/new/page.tsx:38-141` on this pattern —
either one `SectionCard` per logical group (Project / Change Details / Classification / …, each
its own card with normal spacing between cards, not stitched edge-to-edge) or, if the six-group
shape is worth keeping visually merged, a single `SectionCard` with internal `<hairline>`-separated
groups — but never bare `.surface` divs with `.eyebrow` standing in for a header.

**Rule — section header, if a form has more than one titled group:** use `SectionCard`'s built-in
header (`text-xs font-semibold uppercase tracking-[0.12em] text-muted`, bottom border) for every
sub-section title. Never reuse `.eyebrow` (reserved for the page-level kicker above the page's
`<h1>` — see §1) as a section header inside a form body.

**Rule — field order and grouping:** related fields that are short (a select + a short input, two
numeric fields) sit in a `grid grid-cols-1 sm:grid-cols-2 gap-4` pair; long fields (textareas,
file drops) are always full-width, one per row. Cite: `jobs/new/page.tsx:87-96` (reference/section
pair), `:118-152` (authoriser/linked-CO pair).

**Rule — label position:** every field uses `<Field label="…">` (`src/components/ui/Form.tsx:3-24`)
— the label is an 11px uppercase-tracked block above the control, hint or error text below it. No
form anywhere deviates from this; keep it that way.

**Rule — submit row:** a `<div className="flex items-center gap-3">` at the end of the (single)
`SectionCard`, primary submit button first (`.btn-primary.btn-lg`), a `.btn-ghost` "Cancel" link
immediately beside it pointing back at the list, both left-aligned under the last field. Cite the
correct example: `jobs/new/page.tsx:163-166`. Any explanatory copy about what submitting will do
(e.g. "will be saved as a Draft") goes above the button row as a `<p className="text-xs
text-muted">`, never beside the button in a `justify-between` row that pushes the button to the
opposite side of the screen — `change-orders/new/page.tsx:163-172` and
`crew-requests/new/page.tsx:130-137` both need to move to this pattern.

**Rule — the three auth pages** (`login`, `forgot`, `reset/[token]`) all wrap their form in
`<div className="surface p-6 shadow-raised sm:p-7">`, matching `login/page.tsx:61`. Add the wrapper
to `forgot/page.tsx:106` and `reset/[token]/page.tsx:124`.

---

## 8. Typography / spacing scale

**Rule — one "titled section" component.** `SectionCard` (`src/components/workflow/SectionCard.tsx`)
is the canonical way to title a group of content anywhere in the app: `text-xs font-semibold
uppercase tracking-[0.12em] text-muted`, inside a `px-5 py-3.5 border-b border-line` header bar,
with an optional `headerRight` slot for a trailing link or control. `Panel`
(`src/components/dashboard/Panel.tsx`) is retired: migrate the dashboard's seven `<Panel>` usages
to `<SectionCard>`, moving `Panel`'s "label →" link into `headerRight`. `.eyebrow` keeps its
original, narrower job — a kicker line directly above a page's `<h1>` inside `<PageHeader>` — and
is never again used as a section heading inside page body content.

**Rule — one "stat tile" component for non-linking summary numbers.** Extract the pattern
currently duplicated across `admin/page.tsx`, `risks/page.tsx`, `contractors/page.tsx`,
`drawings/page.tsx`, `documents/page.tsx` and `meetings/page.tsx` into a shared `MiniStat({ label,
value, tone })` in `src/components/ui/`, rendering `.stat-card` + the coloured bottom accent strip
those six files already agree on. Use it in all seven places that currently show a bare `.stat-card`
number, including `financials/page.tsx`, which currently omits the strip. Reserve
`<StatCard>` (`src/components/dashboard/StatCard.tsx`) — icon, tone ring, optional `href` — for
tiles that are genuinely clickable, as the dashboard's already are.

**Rule — no arbitrary one-off sizes.** `text-[Npx]` and `rounded-[…]` values that do not correspond
to an existing Tailwind scale step are allowed only where they already exist for a documented
reason (font sizes below the default scale's granularity — already reviewed and found acceptable in
`AUDIT_REPORT.md` §7). Do not introduce a new one-off size where a named step (`text-xs`
/`text-sm`/`text-base`, `rounded-lg`/`xl`/`2xl`) already covers the need — this is how three
different "section header" sizes (11px / 12px / 14px) arose in the first place.

**Rule — colour.** Only the nine tokens (`ink`, `line`, `accent`, `marine`, `ok`, `warn`, `bad`,
`muted`, `faint`) and their defined shades are used for anything. `marine` is reserved for kickers,
active-nav indicators and chart highlights (its existing uses); it is not a second "muted-label"
colour — the `.eyebrow`-as-section-header misuse in §7/§8 is the concrete case to fix.

---

## 9. Responsive

Out of scope for new rules here — `AUDIT_REPORT.md` G2.7 already specifies the fix for C12 (sidebar
becomes a `lg:` drawer) and the two Medium responsive findings (table overflow wrappers,
project-switcher visibility) already have fixes on file in `audit/findings-ui-ux.md`. This spec
adds one forward-looking rule so the drawer, once built, does not create a fourth pattern: the
mobile nav drawer specified in G2.7 reuses the same `NAV` array `Sidebar.tsx` already renders, and
opens as an overlay with the same `.surface` background/blur treatment used everywhere else
(`bg-ink-950/80 backdrop-blur-sm`) — not a new surface treatment invented for the drawer alone.
