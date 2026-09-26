# UI/UX elevation — audit findings

A second UI pass. The first one (`findings-ui-ux.md`, `findings-accessibility.md`) looked for what is
**broken**. This one asks what it would take for OceancOS to be **the best refit and new-build tool
in the market**, and separates what can be done without touching functionality from what cannot.

Where a finding overlaps an item already in `ACTION_PLAN.md`, the ID is given and the defect is not
re-described.

A visual version, with the captured screens next to working mockups of the proposals, is at
https://claude.ai/artifact/QKsWUndwcHvV66Wd7LLGKQ. It is private until shared.

## How this was done

- **The running app.** A production build on seed data (PostgreSQL 16, `next start`). Before capturing,
  the data was warmed up the way users would do it: the PM raises a request with the captain as
  authoriser, and the yard prices it as `D.0400.30` with a €47.50/hr line.
- **The screens.** 35 screens were captured at 1440×900 and 390×844, as Robin Rep, Pat Manager,
  Cara Captain, Yara Yard and Alex Owner. Inter was confirmed loaded for every capture, so density
  was judged in the real typeface.
- **The rules.** The repo's `ui-ux-pro-max` rule set, applied in its priority order. Its recommender
  matches this product to **"Data-Dense Dashboard"** (sticky headers, sortable tables, 36px rows,
  compact cards, loading states, export). That style is adopted. Its suggested palette (a
  light-mode set) and fonts (Fira) are rejected: the dark navy system is right for this product, and
  Inter is already the correct face for tabular data.
- **Contrast.** Every ratio quoted was computed with the WCAG 2.x formula. Translucent surfaces were
  composited onto the real background first, so `.surface` is `#090e1a`.
- **Citations.** Every `file:line` was checked against `f77cc39`.

### Tiers

| Tier | Meaning |
|---|---|
| **1 — Visual** | Changes how something looks or reads. No behaviour change. |
| **2 — Interaction** | A client-side affordance (drawer, palette, split view, live totals). Same server actions, same rules. |
| **3 — Functional** | Behaviour changes. Each one says why it is worth it. |

## Count by tier

- **Tier 1: 27**
- **Tier 2: 9**
- **Tier 3: 5**
- **Total: 41**

A finding that mixes tiers is counted at its highest (E27, E29, E31). E35 is counted as Tier 2; its
exclusions checkbox is an optional Tier 3 element.

## Verdict

The workflow engine is ahead of The Bridge. A change-order approval chain gates acceptance,
acceptance is signed with an emailed code, and every step is recorded. The interface doesn't show
any of this. It is a competent but generic dark-SaaS template: gradient buttons, glow shadows, blur
on every card, a fade-up on every navigation, and seven different 11px uppercase label styles.

Three things hold it back, in order:

1. **It never tells a user what needs them.** The dashboard's approvals panel lists CO-0001 five
   times, once per stage, for everyone (E17). On the one screen where the captain signs for money,
   the most prominent control is a red "Cancel quote" (E24).
2. **It never shows where a job or change order sits in its lifecycle.** You get a status pill and
   a stack of up to eight cards. Nothing shows request → quote → accept → countersign → works →
   completion (E23).
3. **It doesn't work where refits happen.** Every signed-in screen lays out at 474–604px on a 390px
   phone. The acceptance page wraps the quote description one word per line (E15).

## The three that matter most

1. **E24 — The next action is buried, and the destructive action outranks it.** Small effort, Tier 1.
2. **E15 — The phone layout.** It blocks the captain's core use of the product. Tier 2, overlaps G2.7.
3. **E1 + E8 — The money buttons fail contrast and the money figures are rounded.** On a
   commercial signature screen, both are credibility problems. Small effort, Tier 1.

---

## A. Design foundations

### E1 — Primary and danger button labels fail WCAG AA  *(new)*
**Tier 1 · Effort S** · Where: `src/app/globals.css:136-144`

What: `.btn-primary` is a gradient from `#60a5fa` to `#3b82f6` with white text. That gives
**2.54:1** at the light end and **3.68:1** at the dark end. `.btn-danger` (`#ef4444`) gives
**3.76:1**. AA needs 4.5:1 at 14px. These are the Approve, "Accept €…", Send quote and Reject
buttons. The previous audit judged the primary button acceptable because its fill carries the
affordance, but that ignored the label.

How: use a solid fill with no gradient and no glow. Primary **`#2563eb`** gives white text 5.17:1,
with a 3.73:1 boundary against the card. Danger **`#dc2626`** gives 4.83:1. The hover state darkens
rather than lightens.

### E2 — Contrast tokens, including a correction to the previous audit
**Tier 1 · Effort S** · Where: `tailwind.config.ts:18-22,34` · Overlaps: G5.1, accessibility `[1.4.11]`

- **`faint`** `#5a6b8c` → **`#7c8dab`**. This goes from 3.60 to **5.74** on cards and from 2.86 to
  4.56 on `ink-700`. Passes AA on every surface.
- **New `line-control` token, `#566894`**, for input and secondary-button boundaries. It measures
  **3.49** on cards and 3.14 against the button fill. The previous audit proposed `#3a4a74`, which
  only reaches **2.21:1** and so would not have fixed 1.4.11.
- **`muted`** `#8294b3` → **`#a6b3ca`** (9.04:1 on cards). Once `faint` rises to 5.74:1, the old
  `muted` at 6.23:1 would be indistinguishable from it. This gives three distinct text steps:
  16.1, 9.0 and 5.7.
- Keep `line` and `line-soft` for decorative dividers. Keep `marine` as the single focus and
  active signal (9.29:1).

### E3 — A semantic token layer
**Tier 1 · Effort M** · Where: every component that uses raw scale names (`bg-ink-950`,
`text-faint`, `border-line`)

What: components name palette steps, not roles. So no theme (E37) and no density mode can be added
without editing every file.

How: define CSS variables in `globals.css` and map them in `tailwind.config.ts`:
- `--surface-0..3`
- `--text-1..3`
- `--border-subtle|control|strong`
- `--status-{draft,waiting,active,done,void}`

Then migrate the primitives first (`SectionCard`, `Panel`, `StatCard`, `.btn`, `.input-base`,
`.table-base`), so pages mostly follow automatically.

### E4 — Sub-12px text and seven competing label styles
**Tier 1 · Effort M** · Where: `globals.css:100,123,171,200`; `DefinitionGrid.tsx:18`;
`SectionCard.tsx:26`; `Sidebar.tsx:79`

What: 64 of the 72 arbitrary font sizes in `src/` are `text-[10px]` or `text-[11px]`. Seven uppercase
tracked label styles exist: table headers, form labels, stat labels, eyebrows, definition terms,
section titles and nav groups, with three different tracking values. When every heading whispers in
small caps, nothing leads. This is the main reason the screens look busy even when they aren't.

How:
- Adopt a scale of 12 / 13 / 14 / 16 / 20 / 24 / 30, with weights 400, 500 and 600.
- Keep **one** uppercase style, for table headers only.
- Form labels and definition terms become sentence-case 13px medium.
- Section titles become 14px semibold sentence case.
- Remove the eyebrow from every page except the dashboard.

### E5 — Template effects: gradient, glow, blur, ambient light
**Tier 1 · Effort S** · Where: `globals.css:23-31` (ambient gradients), `:80` (`backdrop-blur-sm`
on `.surface`), `:136-141`; `tailwind.config.ts:53` (`glow`); the logo tile in `Sidebar.tsx:56`

What: the product's own description promises a "calm, auditable workspace", but the effects are
those of a marketing template. The blur on `.surface` costs a compositing layer on every card and has
no visible effect over a near-solid background.

How: remove the blur and the ambient gradients. Keep shadows to two levels (card, floating). Keep
`glow` for focus only. Give the "O" gradient tile a proper mark (the marketing `Logo.tsx` already
has one).

### E6 — Every navigation animates
**Tier 1 · Effort S** · Where: 61 `animate-fade*` uses across `src/`; `EmptyState.tsx:15,40`

What: a tool opened fifty times a day should feel instant. Every page, header, section and empty
state fades up over 0.4–0.5s, and some add staggered delays.

How: delete the page-level and section-level entrance animations. Keep 150ms transitions for state
changes (hover, open, selected). Rows never stagger. The existing `prefers-reduced-motion` block
stays.

### E7 — Fonts and reference numbers
**Tier 1 · Effort S** · Where: `src/app/layout.tsx:36-41`; job codes at `jobs/page.tsx:251`
(sans `tnum`) against CO numbers at `change-orders/page.tsx:147` (`font-mono`)

How:
- Load Inter through `next/font`: self-hosted, no layout shift, no third-party request.
- Enable Inter's `cv11` and `ss01` for unambiguous 1/l/I in codes.
- Render every reference number (job code, CO number, REQ number, client ref) in one style:
  JetBrains Mono 13px, `text-2`. Codes are the common language of a refit and should be
  recognisable at a glance.

### E8 — Money is rounded to whole euros, including on the signature page
**Tier 1 · Effort S** · Where: `src/lib/utils.ts:7` (`maximumFractionDigits: 0`); used at
`jobs/[id]/page.tsx:197-199`, `jobs/[id]/accept/page.tsx:152-154`, `print/jobs/[id]/page.tsx:130`

What: on the warmed-up quote, the €47.50/hr line shows as "€48" and the total as "€2,995". The system
comment on the same page reads "2995.25 EUR". The PDF carries the same rounding. On the page where
money is signed for, two figures for the same quote undermine trust.

How: add `fmtMoney(n, ccy, { precision: "exact" })` and use it for unit prices, line totals, quote
totals and anything shown in the accept flow. Keep whole-euro output for dashboard summaries.
Thread the project currency everywhere (G3.10).

### E9 — Status needs a system, not a lookup table
**Tier 1 · Effort M** · Where: `src/lib/enums.ts:185-223`; `components/ui/Badge.tsx:24-34`;
evidence at `/jobs?view=pending`

What: statuses are bordered pills in five tones with no icon, and the tone map is shared across
domains, so keys collide (see the previous audit). In the Pending view, three quotes read "Quote
sent" in amber with "Lapsed 134–183 days ago" in red underneath, while a fourth reads "Expired".
The user has to reconcile two signals for one fact.

How:
- Group every domain's statuses into five lifecycle groups, each with a hue and an icon:
  **draft/new** · **awaiting decision** · **in works** · **done** · **void**.
- Use per-domain tone maps.
- Render status as a dot and label in tables (lighter than a pill), and keep the pill for page
  headers.
- A lapsed quote shows a single "Lapsed" state with the date, whatever its stored status.

### E10 — Raw enum keys shown to users
**Tier 1 · Effort S** · Where: `ENGINEERING` (`change-orders/[id]/page.tsx:110`), `IT_AV` and
`CLASS_FLAG` (the department selects), `MEDIUM`/`CRITICAL` (priority badges), `OWNERS_REP` and
`PROJECT_MANAGER` (`TopBar.tsx:53`), "MORE INFO" and "UNDER REVIEW" (upper-case CO statuses),
history events lower-cased from keys (`jobs/[id]/page.tsx:515`)

How: one `src/lib/labels.ts` exporting `label(domain, key)`, used by every select, badge and
history line. Job statuses already do this (`JOB_STATUS_LABELS`); extend it to the rest.

## B. Shell and navigation

### E11 — The project should anchor the shell, with a refit clock
**Tier 1 · Effort M** · Where: `components/layout/TopBar.tsx`, `ProjectSwitcher.tsx`; data from
`lib/projectDates.ts`, `lib/metrics/project.ts`

What: the whole product is scoped to a project, but the project is a small select in the middle
of the top bar. The one number a refit runs on, days to departure, appears nowhere in the shell. On
the seed, delivery is **4 days** away with **98%** of the yard period gone, and no screen says so.

How: put a project block top-left, above the nav: vessel, project type, yard, and
**"Day 210 of 214 · 4 days to delivery"**, amber inside 14 days and red inside 3. The switcher
becomes that block's menu.

### E12 — Role-aware, de-duplicated navigation
**Tier 2 · Effort S** · Where: `components/layout/Sidebar.tsx:28-48` · Overlaps: G3.11

What: all 19 items show for every role. Notifications and Search repeat the top bar. Admin and
Projects sit in the main nav. The ten unbuilt modules are peers of the working ones.

How:
- Hide entries the user's permissions cannot open. This changes visibility only; the server checks
  are untouched.
- Move Admin and Projects to the user menu.
- Remove the duplicate Notifications and Search entries.
- Group the scaffolds under a collapsed "Coming next".

### E13 — A command palette keyed on codes
**Tier 2 · Effort M** · Where: new client component in the shell; `/search` becomes its "see all"
page

What: refit people talk in codes (D.0130.05, CO-0007). Today, reaching one means going to a list and
scanning it.

How: ⌘K / Ctrl-K opens a palette that matches code, number or title across jobs, COs and requests,
with a "Go to…" section for navigation. Search results (`search/page.tsx:122-131`) gain a type icon,
status, project code and the matched text highlighted. This is navigation only.

### E14 — User menu, role, sign out, unread dot
**Tier 1 · Effort S** · Where: `TopBar.tsx:40-58`

How: the avatar opens a menu with the humanised role ("Owner's representative"), profile, and Sign
out separated from the rest. Show an unread dot on the bell; the count lives only in the sidebar today.

### E15 — The phone layout
**Tier 2 · Effort M** · Where: `Sidebar.tsx:53`, `(app)/layout.tsx:15-23`; evidence from every `m-*`
capture · Overlaps: G2.7

What: at 390px, signed-in screens lay out at **474–604px**. On `/jobs/[id]/accept` the quote
description runs one word per line in a column about 130px wide. On `/approvals` the "15 pending"
badge overprints the page eyebrow. The captain's core tasks (approve, accept, raise a defect) are
phone tasks.

How:
- A drawer below `lg`. `marketing/Nav.tsx:57-95` already has the pattern.
- A **bottom bar** on phones with Home · Approvals · Quotes · Requests · Inbox.
- `<main>` padding becomes `p-4 sm:p-6`.
- Tables collapse to stacked rows below `sm`.

### E16 — Breadcrumbs that follow the code hierarchy
**Tier 1 · Effort S** · Where: back links at `jobs/[id]/page.tsx:114-120`,
`change-orders/[id]/page.tsx:70-76`

How: `R-00721 › Dry Dock › D.0400 › D.0400.30`, where each segment links to the filtered list.

## C. Dashboard → "Today"

### E17 — "Needs your decision" first, and filtered to the user
**Tier 1 · Effort S** · Where: `dashboard/page.tsx:65-69` (query), `:251-300` (panel)

What: the panel queries every pending approval with no user or stage filter, no ordering and
`take: 5`. On the seed, Robin Rep sees **CO-0001 five times**, once for each stage, including stages
that aren't theirs. It sits in the fifth row of the page.

How:
- Move it to the top of the page.
- List the approvals waiting on this user's stages, the quotes waiting on their acceptance (with
  the expiry), and the crew requests assigned to them that are overdue.
- One row per record, each with its direct action.
- Title it "Waiting on you". When empty: "Nothing needs you today."

### E18 — The yard-period timeline
**Tier 1 · Effort S** · Where: "Upcoming milestones" panel, `dashboard/page.tsx:195-216`

How: a horizontal timeline from arrival through haul-out, class, sea trials and departure, with a
today marker and days-to-go on each milestone. Build it once and use it on the dashboard, in the
live preview on `admin/projects/page.tsx:145-182`, and at the top of the schedule.

### E19 — Money in one sentence
**Tier 1 · Effort S** · Where: `components/dashboard/BudgetSummary.tsx`

How: lead with a sentence built from the figures already computed: "Forecast **€4.80m**, €89.7k
(1.9%) over baseline; €89.7k awaiting decision." The five cells and the bar stay underneath as
detail.

### E20 — The progress rings mislead
**Tier 1 · Effort S** · Where: `components/charts/ProgressRings.tsx:47-58`

What: the outer ring is longer than the inner one at the same percentage, so work looks nearer
completion than it is. On the seed it reads 50% against 98%.

How: a single horizontal bar for work done, with a tick at time elapsed. Keep the "48 points behind
the clock" sentence (`:76-78`); it is the best line on the page.

### E21 — A feed people can read
**Tier 1 · Effort S** · Where: `dashboard/page.tsx:54`, `:347-376`

What: after the warm-up, the feed is eight rows of `LOGIN on User (cmui3ryw)` and two of
`CREATE on Job (cmui3vkq)`.

How: exclude sign-ins, resolve the actor and the record, and write sentences: "Yara Yard quoted
D.0400.30 Tender garage door hydraulic overhaul · €2,995.25 · 2h". Each row links to the record.

### E22 — Mixed scope on one screen
**Tier 1 · Effort S** · Where: `dashboard/page.tsx:33-55` (cross-project counts) against `:76-80`
(active-project charts) · Depends on: G2.1

How: once G2.1 lands, scope everything to the active project, and add a separate portfolio view
for owners with several vessels.

## D. Detail pages

### E23 — A lifecycle stepper
**Tier 1 · Effort M** · Where: under the page header of `jobs/[id]/page.tsx` and
`change-orders/[id]/page.tsx`

What: the job model already records requested, quote-delivered, client-accepted, yard-countersigned,
progress, yard-completed and works-accepted timestamps. None of them is shown as a sequence.

How: a horizontal stepper, **Requested → Quoted → Accepted → Countersigned → In works (n%) → Yard
completed → Works accepted**. Each completed step shows who and when. Expired, cancelled and
minor-deficiency appear as off-path markers. For change orders, the approval chain *is* the
stepper.

### E24 — The next action is buried, and "Cancel quote" outranks it
**Tier 1 · Effort S** · Where: `jobs/[id]/page.tsx:466-504`; `lib/jobs/workflow.ts:122`; text at
`jobs/[id]/page.tsx:414`

What: for the authoriser, the rail runs Quote facts → Acceptance → **Actions** (a reason field and a
full-width solid red "Cancel quote") → **Authorise** ("Review and accept"). The destructive action is
the most visually dominant control on the page, and it sits above the primary one. The acceptance
card also tells the client "Awaiting the client's authorisation."

How: a single **next-action card** at the top of the rail, built from the same `jobActions` and
permission checks.
- For the authoriser: "Awaiting your acceptance · €2,995.25 · valid 30 more days" with one primary
  button.
- For others: "Waiting on Cara Captain", or "Waiting on the yard to price".
- Cancel and reject move into a secondary "More" menu, with a confirmation step and the reason field.
- Pending-state copy is written from the viewer's side.

### E25 — Three rail cards, and one activity thread
**Tier 1 · Effort M** · Where: `jobs/[id]/page.tsx:357-521` (up to eight rail cards),
`:289-354` (comments), `:506-520` (history)

How:
- The rail holds three cards: next action, key facts, signatures.
- Comments, minutes and history merge into one thread with filters: All · Comments · Minutes · Events.
- System events render as compact timeline markers rather than cards.
- The composer is anchored at the bottom of the thread.
- The lines table gets a `<tfoot>` for the total.
- Exclusions get a "Read before accepting" heading and readable ordinals.

### E26 — Change-order detail
**Tier 1 · Effort S** · Where: `change-orders/[id]/page.tsx:154-179`

What: status transitions sit at the bottom of the left column. When there are none, a bare line of
text floats between two cards ("No status changes available to you in the current state.",
`:178`). A whole card holds a single "Created" field (`:154-161`).

How:
- Transitions move into the header action area.
- The one-field card folds into the facts.
- The approval chain shows each stage's approver name and "waiting 3 days" ageing.
- Estimated and approved cost sit side by side with the variance.

### E27 — Crew-request detail
**Tier 2 (parts Tier 1) · Effort S** · Where: `crew-requests/[id]/page.tsx:139-146` (up to four equal primary
buttons), `:157-163` (assignee list of all 12 users, surveyors included)

How: one primary next step with the rest in "More", an "Assign to me" button, and an assignee list
limited to vessel and yard roles.

## E. Approvals

### E28 — A decision inbox, not a table of buttons
**Tier 2 · Effort M** · Where: `approvals/page.tsx:104-160` (waiting on you), `:45-54` and
`:179-216` (pending with others)

What:
- Money is approved straight from a table row, with no description, no prior-stage decisions and
  no comment box.
- The buttons are about 26px tall and 6px apart, Approve beside Reject.
- "Pending with other approvers" lists CO-0001 four times, once per stage.

How:
- A split view. On the left, the queue sorted by age, with cost, schedule change and stage.
- On the right, the selected change order: description, reason, cost and schedule change, class
  and flag flags, the decisions already made, and a comment field. The buttons sit at the bottom,
  with Reject separated from the others.
- It uses the same `decideChangeOrderApproval` action.
- A header line: "**€217,000** waiting on your decision · 4 items · oldest raised today".
- The other-approvers list shows one row per change order, with a stage progress pip.
- No batch approve on money.

## F. Lists and registers

### E29 — The jobs list
**Tier 2 (parts Tier 1) · Effort M** · Where: `jobs/page.tsx:109-180` (two stacked tab styles), `:207-229`
(group header), `:232-239` (`sr-only` header row), `:253-259` (two badges per row)

What:
- The column headers are visually hidden, so the price, delivered date and progress columns are
  unlabelled, and the status column drifts horizontally from row to row.
- In the Pending view, each one-quote group repeats its price in a group header with a 0% bar:
  five quotes take ten rows of chrome.

How:
- Visible, sticky column headers with fixed widths.
- Group headers only when a group has more than one job, and sticky when shown.
- Progress hidden in views where it cannot be non-zero.
- One toolbar: view as a segmented control, section as a select, then search, favourites and
  density.
- A text meta line ("Variation certificate · Fixed · Ref MY-2026-024") instead of two bordered badges.
- Whole-row click through a stretched link.
- Sortable columns via a URL parameter.
- A summary bar: "5 quotes · €34,145.25 · 4 lapsed".

### E30 — The change-order list
**Tier 1 · Effort S** · Where: `change-orders/page.tsx:130-186`

How: an approval-progress pip per row (●●●○○), the cost labelled Estimated or Approved, and an
"Awaiting me" filter chip.

### E31 — Registers that say what to do
**Tier 2 (parts Tier 1) · Effort M** · Where:
- Stat strips on `documents/page.tsx:47-68`, `drawings/page.tsx:43-64`,
  `contractors/page.tsx:37-57`, `meetings/page.tsx:45-61`, `admin/page.tsx:41-62`
- `inventory/page.tsx:84-89,168-179`, `risks/page.tsx:54-89`, `meetings/page.tsx`,
  `admin/page.tsx:82-98`

How:
- **Stat strips:** replace count-only strips with chips you can act on ("2 insurances expire within
  30 days" links to the filtered list).
- **Inventory:** its two chips count the same items; merge them.
- **Risks:** a 5×5 likelihood × impact heat map, plus the Owner and Mitigation fields that exist in
  the schema but aren't shown.
- **Meetings:** show the MINUTE comments already recorded on jobs, grouped by day.
- **Admin users:** group by Owner / Vessel / Yard / Third party, with "approves the X stage".

## G. Forms and data entry

### E32 — The quote line editor
**Tier 3 · Effort L** · Where: `jobs/[id]/quote/page.tsx:18,131-190`

What: six fixed rows, no line totals, and no running total. The yard types 16 × 47.50 and sees no
figure until it has sent a binding quote.

How:
- A client-side line editor: add, remove and reorder rows, each with a live line total and a grand
  total. The server still recomputes and stores the figure.
- Tab through cells.
- **Paste from a spreadsheet**: tab-separated rows map to description, quantity, unit and price.
- A unit list (HR, DAY, UN, LOT, M, M², KG).
- Exclusions and notes as list editors.
- A "Preview as client" panel.

**Why functional:** it removes the six-line ceiling, which makes larger quotes impossible to issue.
Pasting also matches where yard pricing actually lives: spreadsheets.

### E33 — Form layout and field design
**Tier 1 · Effort M** · Where: `change-orders/new/page.tsx:36-181` (six stacked surfaces held
together with `rounded-none` and `border-t-0`); `crew-requests/new/page.tsx`; `jobs/new/page.tsx`

How:
- A settings-style layout: section title and one line of explanation on the left, fields on the right.
- Humanised selects (E10).
- Money inputs with a currency prefix and thousands grouping.
- Schedule impact with a "days" suffix.
- Class and flag toggles that state their consequence: "Adds a Class stage to the approval chain",
  from `change-orders/actions.ts:21-22`.
- A sticky footer with Cancel and the primary button.
- The project taken from the active project rather than asked again.
- `jobs/new` gains a short "What happens next" panel: the yard prices it, then the authoriser gets
  an emailed code.

### E34 — Defects raised from the dock
**Tier 2 · Effort M** · Where: `crew-requests/new/page.tsx:38-144`; `components/ui/FileDrop.tsx:156-200`

How:
- A quick-capture mode (title, area, priority chips, photo), with everything else under "More
  detail".
- On touch devices, `FileDrop` offers "Take photo" (`capture="environment"`) alongside "Choose
  file", shows thumbnails and a real progress bar, and is added to crew requests, which cannot take
  attachments today.

### E35 — The acceptance moment
**Tier 2 (Tier 3 for the checkbox) · Effort M** · Where: `jobs/[id]/accept/page.tsx`

How:
- A three-step indicator: Review → Confirm → Code.
- A signature statement that reads like a document: "I, Cara Captain, accept D.0400.30 for
  **€2,995.25** on behalf of M/Y Solstice."
- A six-box code input that accepts a pasted code.
- On a phone, the summary and the button stay pinned to the bottom of the screen.

**Tier 3: an exclusions acknowledgement** ("I have read the 2 exclusions") before the code can be
requested. *Why:* it adds a required step, but it creates an evidential record that the signer saw
the carve-outs. That is where refit disputes start.

> **Decided and implemented (26 Sep 2026, `b4769d0`):** the checkbox only.
> - **Enforcement.** The checkbox carries a fingerprint of the exclusions on screen, and the server
>   refuses the code request when it is missing or stale.
> - **Evidence.** The count and fingerprint are recorded with the code request and the signature.
> - **A gap closed on the way.** The quote fingerprint now covers exclusions, so a change after the
>   code is sent invalidates it.
> - **Not yet done.** The step indicator, the signature statement, the six-box code input and the
>   pinned phone button.

## H. Field conditions

### E36 — Touch targets
**Tier 1 · Effort S** · Where: `.btn` (`globals.css:127-135`, about 38px), approval buttons
(`approvals/page.tsx:146-153`, about 26px)

How: a minimum 44px hit area on touch viewports, and at least 8px between adjacent actions. Reject
is never adjacent to Approve.

### E37 — A "Daylight" theme
**Tier 3 · Effort M (after E3)** · Where: theme tokens

What: dark-first is right for the office and the bridge at night. It is hard to read on a dock or a
sundeck in Mediterranean sun.

How: a high-contrast light theme, as a variable swap once E3 lands. Chosen per user, and the
default stays dark. *Why functional:* it adds a user preference and a second theme to test.

> **Decided and implemented (26 Sep 2026, `fc2433d`):** Dark (default) / Light / System, chosen
> from the profile menu at the top right.
> - **How.** It was done ahead of E3 by turning the palette tokens into variables.
> - **Scope.** The choice is kept per browser in a cookie. Sign-in and marketing pages stay dark.
> - **Contrast.** Every light text pair measures 4.5:1 or better.
> - **Dark unchanged.** Dark mode was pixel-diffed against pre-change screenshots and is identical
>   below the top bar.

## I. Functional issues found in passing

### E38 — Crew requests list CRITICAL last  *(new; logged in `findings-phase5.md`)*
**Tier 3 · Effort S** · Where: `crew-requests/page.tsx:48`

What: `orderBy: [{ priority: "desc" }]` on a string column sorts alphabetically, so the order is
MEDIUM, LOW, HIGH, CRITICAL.

How: sort on a rank (a `CASE` expression, or an integer column). *Why functional:* the order
changes. The current order is wrong.

### E39 — The captain cannot raise a crew request  *(decided: the captain can; fixed in `6d50d3d`)*
**Tier 3 · Effort S** · Where: `src/lib/rbac.ts:127-137`

What: the CAPTAIN role has `CR_TRIAGE`, `CR_ASSIGN` and `CR_COMPLETE`, but not `CR_CREATE`.
`/crew-requests/new` returns "Not permitted" to the captain. This may be intended (requests come
from crew and heads of department), but it reads as an oversight. It is a product decision, not a
UI one.

> **Decided and implemented (26 Sep 2026, `6d50d3d`):**
> - **The grant.** CAPTAIN holds `crew_request.create`.
> - **The migration.** A data migration adds the grant to databases that are already seeded.
> - **Knock-on.** `findings-auth-security.md` (holders of `crew_request.create` can create records
>   in another owner's project) now covers the captain too. Its fix is G2.1.

### E40 — Notifications destroy unread state on render
**Tier 3** · Already G3.7. An inbox (Bridge Phase 3) is impossible until it is fixed.

### E41 — The marketing site undersells the product
**Tier 1 · Effort S** · Where: `marketing/Workflow.tsx:22-24`, `marketing/Stats.tsx:3-4`,
`components/auth/BrandPanel.tsx`

What: `Stats.tsx` claims 4 approval stages and 9 roles, and `Workflow.tsx` describes a PM → owner's
rep → owner chain. The product ships a five-stage default chain (Captain → Tech Manager → Yard →
Owner's rep → Finance, seven with class and flag) and 19 roles. It never mentions code-confirmed acceptance or the change-order gate,
the two things The Bridge cannot do. The sign-in side panel sells features to people who already use
the product.

How: correct the numbers, lead with the change-order gate and signed acceptance, and give the
sign-in panel project context instead: the last project used, and "3 items waiting on you" after
sign-in.

---

## Sequencing

The remediation plan's open Criticals come first: G1.2, G1.3 and G2.1–G2.6, covering tenancy and the
approval money path. Nothing below should ship to production ahead of them.

The effort figures are rough, for one developer.

| Step | Contents | Effort | Fits |
|---|---|---|---|
| **1. Quick wins** | E1, E2, E5, E6, E8, E10, E14, E21, E24, E36, E38 | 2–3 days | Alongside Gate 3; all Tier 1 except E38 |
| **2. Design foundations (proposed G3.12)** | E3, E4, E7, E9, E16, E22 | about 1 week | **Before Gate 5**, which re-picks `faint` and the focus rings; doing tokens after it duplicates the work |
| **3. Workflow surfaces** | E17–E20, E23, E25–E30, E32, E33, E35 | about 2–3 weeks | After Gate 3 has settled the actions these screens call |
| **4. Field and mobile** | E11, E12, E13, E15, E34, E37 | about 2 weeks | E15 is G2.7; the rest follow it |
| **Decisions for the owner** | E39, E35's checkbox, E37 — all decided and shipped 26 Sep 2026 | — | Done |

## Notes on the evidence

- **Lapsed quotes.** Every seeded "Quote sent" job was delivered in April–May, so all of them show as
  lapsed. The live quote used for the detail and accept screens was created during the capture run.
- **Approver names.** Every seeded approval decision is credited to Cara Captain, including the Tech
  Manager and Yard stages (`prisma/seed.ts:287`). Screens showing approver names reflect the seed,
  not the product.
- **Seeded line maths.** Some seeded line items don't add up: 130 × €67.50 ≠ €8,760
  (`prisma/seedJobs.ts:253-256`). No finding relies on seeded totals.
- **Empty modules.** The scaffold modules are empty on the seed, so their findings come from the code.
