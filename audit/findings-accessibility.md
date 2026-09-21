# Accessibility findings — OceancOS

All contrast ratios below were computed with the WCAG 2.x relative-luminance formula (sRGB, 8-bit), including alpha compositing for translucent surfaces (`bg-ink-900/80` etc. composited over the `#060912` body background).

Reference numbers for the two text tokens in `tailwind.config.ts:33-34`:

| token | ink-950 `#060912` | ink-900 `#0a0f1c` | ink-850 `#0e1525` | ink-800 `#121a2e` | ink-700 `#1a2440` | `.surface` (ink-900/80 composited -> `#090e1a`) |
|---|---|---|---|---|---|---|
| `muted` `#8294b3` | 6.48 | 6.23 | 5.93 | 5.64 | 4.99 | 6.28 |
| `faint` `#5a6b8c` | **3.71** | **3.57** | **3.40** | **3.23** | **2.86** | **3.60** |

`muted` passes 4.5:1 everywhere it is used. `faint` fails 4.5:1 on every surface in the system, and fails 3:1 on `ink-700`.

---

### [COLOUR CONTRAST] — `faint` #5a6b8c fails WCAG AA body-text contrast on every surface in the app
Severity: High
Location: `tailwind.config.ts:34`; consumed in 98 places across 34 files (`text-faint`, `placeholder:text-faint`)
Found by: accessibility

Description:
`faint` is `#5a6b8c`. Computed ratios: 3.71:1 on `ink-950 #060912`, 3.57:1 on `ink-900 #0a0f1c`, 3.40:1 on `ink-850 #0e1525`, 3.23:1 on `ink-800 #121a2e`, 2.86:1 on `ink-700 #1a2440`, and 3.60:1 on the composited `.surface` (`bg-ink-900/80` over the body background = `#090e1a`).

Every one of those fails the 4.5:1 AA threshold for body text. The token is never used at large-text size — every occurrence is `text-xs` (12px), `text-[13px]`, `text-[11px]` or `text-[10px]`, so the 3:1 large-text exemption does not apply anywhere, and on `ink-700` it fails even that.

Representative uses, all on real content rather than decoration:
- `src/app/globals.css:119` — `.input-base { placeholder:text-faint }`. Placeholder on the composited input fill `#070b14` = **3.67:1**. This is the placeholder in every form field in the product, including the login email field (`src/app/login/page.tsx:97`) and the acceptance-code field (`src/app/(app)/jobs/[id]/accept/page.tsx:236`).
- `src/components/layout/Sidebar.tsx:61` — "Project command" strapline, 10px, 3.71:1.
- `src/components/layout/Sidebar.tsx:79` — the "Project" / "Knowledge" / "Network" / "System" nav group headings, 10px, 3.71:1. These are the only labels grouping 19 navigation links.
- `src/components/layout/Sidebar.tsx:88` — inactive nav icons, 3.71:1.
- `src/components/layout/TopBar.tsx:53` — the signed-in user's role (`OWNER`, `PM`…), 3.71:1.
- `src/app/(app)/jobs/page.tsx:125` — the count badge on each view tab; `:161` the search glyph; `:261` "Ref {clientRef}"; `:268` the comment count.
- `src/app/(app)/jobs/[id]/page.tsx:226,239` — the ordinal numbers on every **exclusion** and **note** on a quote (3.51:1 on the card surface). These are the contractual carve-outs the client is asked to read before accepting.
- `src/app/(app)/jobs/[id]/accept/page.tsx:169` — the same ordinals on the "Excluded from this price" list inside the accept flow.
- `src/app/(app)/jobs/[id]/quote/page.tsx:186` — the note explaining that an accepted figure never changes afterwards.
- `src/app/login/page.tsx:120` — the copyright / "Secure, audited access" line.
- `src/components/ui/FileDrop.tsx:155,166,194,199,211` — the upload hint, the file size, the file icon and the remove control.
- `src/components/marketing/Footer.tsx:47,76,79` — every footer column heading and both copyright lines.
- `src/components/charts/Donut.tsx:115` — the percentage share for every slice.

Impact:
Low-vision users, users on dim or glare-affected screens (a yard or a deck is not an office), and older users cannot reliably read secondary metadata anywhere in the product. Because `faint` is the token chosen for "quiet" information, the failures cluster precisely on the text that gives numbers their meaning — units, references, counts, exclusion ordinals, form placeholders and nav group labels.

Suggested fix:
Re-pick the token. `#8294b3` (the existing `muted`) already clears 4.5:1 on every surface, so the cheapest correct fix is to raise `faint` to roughly `#7c8dab` (~5.7:1 on ink-950, ~5.3:1 on ink-850) and keep `muted` as the brighter step, or collapse the two tokens and express the hierarchy with weight/size instead of lightness. Any replacement must be re-measured against `ink-700` (`#1a2440`), the darkest-contrast context, not just against `ink-950`.

---

### [KEYBOARD] — No skip link in the authenticated app shell; every page starts with 19 sidebar links
Severity: High
Location: `src/app/(app)/layout.tsx:14-26`; `src/components/layout/Sidebar.tsx:28-48,65-97`
Found by: accessibility

Description:
The marketing home page has a proper skip link (`src/app/page.tsx:27-33`, `sr-only focus:not-sr-only` -> `#main`). The authenticated shell has none. The layout renders `<Sidebar>` first, then `<TopBar>`, then `<main>` — and `<main>` at `src/app/(app)/layout.tsx:23` has no `id`, so there is nothing to skip to even if a link were added.

The tab order on **every** signed-in route is therefore: brand link -> 19 sidebar nav links (`NAV` array, `Sidebar.tsx:28-48`) -> search field -> project switcher -> notifications -> sign out -> page content. Twenty-four stops before the first piece of page content, repeated on every navigation.

Impact:
Keyboard-only and switch-device users pay a 24-stop tax on every single page load, including the multi-step accept flow where they must return to the page repeatedly (`/jobs/[id]/accept` -> request code -> enter code). WCAG 2.4.1 Bypass Blocks. For a switch user this is the difference between a usable and an unusable product.

Suggested fix:
Add `id="main"` to the `<main>` in `src/app/(app)/layout.tsx:23` and put the same skip link already proven on `src/app/page.tsx:27-33` at the top of the app layout, before `<Sidebar>`. While there, wrap the sidebar `<nav>` and give it a name (see the landmark finding below).

---

### [FOCUS] — Project switcher removes the focus outline and puts nothing back
Severity: High
Location: `src/components/layout/ProjectSwitcher.tsx:45-57` (class list at `:49`)
Found by: accessibility

Description:
`globals.css:43-47` defines a good global keyboard focus ring: `outline: 2px solid theme("colors.marine")` — `#38bdf8` at **9.29:1** against `ink-950`. The project `<select>` cancels it:

```
className="cursor-pointer appearance-none bg-transparent pr-5 text-xs font-medium text-white focus:outline-none"
```

`focus:outline-none` compiles to `outline: 2px solid transparent` on `.…:focus`, which is specificity (0,2,0) and beats the global `:focus-visible` at (0,1,0). Unlike `.input-base`, no ring, border or background change replaces it — the surrounding `<label>` only changes its border on `hover:` (`ProjectSwitcher.tsx:42`), never on focus-within.

Impact:
A sighted keyboard user tabbing across the top bar loses the caret entirely at the project switcher. Changing the active project re-scopes every list, budget and chart in the app, so this is a control with global consequences that gives no indication it is focused. WCAG 2.4.7 Focus Visible — a clean failure, not a borderline one.

Suggested fix:
Delete `focus:outline-none` from `ProjectSwitcher.tsx:49` and let the global `:focus-visible` rule apply, or move the indicator to the wrapper with `focus-within:ring-2 focus-within:ring-marine`.

---

### [FORMS / ARIA] — `Field` wraps `FileDrop`, putting three labelable controls inside one `<label>`
Severity: High
Location: `src/components/ui/Form.tsx:16-23`; `src/app/(app)/jobs/new/page.tsx:151-162`; `src/components/ui/FileDrop.tsx:158-164,169-179,207-214`
Found by: accessibility

Description:
`Field` renders `<label>{label}{children}</label>` — implicit association, which is correct for a single input. On the new-quote-request page it wraps the whole `FileDrop` composite:

```tsx
<Field label="Attachments" hint="Photos, drawings or documents that help the yard…">
  <FileDrop … />
</Field>
```

`FileDrop` contains, in tree order: a `<button type="button">browse</button>` (`FileDrop.tsx:158`), an `<input type="file" className="sr-only">` (`FileDrop.tsx:169`), and one `<button>` per queued file (`FileDrop.tsx:207`). `button` and `input` are both *labelable* elements, so:

1. The HTML content model for `<label>` — "no labelable descendants other than the labeled control" — is violated three times over.
2. The label's implicit control is the **first** labelable descendant, i.e. the `browse` **button**, not the file input. The button's accessible name becomes the label's entire text content: "Attachments Photos, drawings or documents that help the yard understand the work. Drop files here, or browse Photos, technical documents or drawings, up to 10 MB each" — plus every uploaded filename, status string and "Remove …" as files are added, because those are inside the label too.
3. The `<input type="file">` at `FileDrop.tsx:169` is left with **no accessible name at all**. It has `id={inputId}` (`FileDrop.tsx:49,170`) but nothing ever references that id — the `useId` is dead. `sr-only` does not remove it from the tab order, so a keyboard user tabs onto an unnamed file-upload control.

Impact:
A screen-reader user on `/jobs/new` hears a single control announced with a paragraph-length name that changes every time a file finishes uploading, then tabs onto an unlabelled "file upload button". Attaching drawings and photos is how the yard is told what to price; the control is reachable but not comprehensible. WCAG 1.3.1, 4.1.2.

Suggested fix:
Stop using `Field` for composite controls. Either give `Field` an optional `as="fieldset"` mode that renders `<fieldset><legend>` instead of `<label>`, or on `jobs/new/page.tsx:151` replace the `Field` wrapper with a plain `<div role="group" aria-labelledby=…>`. Separately, in `FileDrop` either give the file input a real label (`<label htmlFor={inputId} className="sr-only">Choose files to upload</label>`) or add `aria-label` to it, and consider `tabIndex={-1}` on the input now that `browse` is the intended keyboard entry point.

---

### [FOCUS] — Every form field downgrades the 9.29:1 focus outline to a 1.50:1 ring
Severity: Medium
Location: `src/app/globals.css:116-122` (`.input-base`), `:43-47` (`:focus-visible`)
Found by: accessibility

Description:
```css
.input-base {
  @apply … focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 focus:bg-ink-950;
}
```
`focus:outline-none` compiles to `outline: 2px solid transparent` on `.input-base:focus`, specificity (0,2,0), which beats the global `:focus-visible` (0,1,0). The 2px marine outline (9.29:1 against `ink-950`) is therefore suppressed on every text input, textarea and select in the product, including the login fields and the acceptance-code field.

What replaces it:
- `focus:ring-accent/30` -> `#3b82f6` at 30% over `.surface` = `#18315c`, which is **1.50:1** against the card and **1.53:1** against the input fill. Effectively invisible.
- `focus:border-accent` -> the 1px border moves from `#1e2a48` to `#3b82f6`. That is a 3.86:1 *change of state* on a 1px line, but the border itself is only 1.39:1 against the field fill (see the non-text-contrast finding), so the focused state reads as a faint blue hairline rather than a ring.

Impact:
The one strong, consistent focus indicator in the design system is turned off exactly where keyboard users need it most — inside forms. The remaining indicator is a 1px hairline. This is a marginal WCAG 2.4.7 pass at best and a clear failure of WCAG 2.2 SC 2.4.11 Focus Appearance.

Suggested fix:
Drop `focus:outline-none` from `.input-base` and let the global marine `:focus-visible` outline show, keeping `focus:border-accent` as a secondary cue. If the ring must stay, raise it to full opacity (`focus:ring-marine`) rather than 30%.

---

### [COLOUR CONTRAST] — Chart axis labels, tick values and centre captions use `faint` at 10–11px
Severity: Medium
Location: `src/components/charts/palette.ts:72` (`TEXT.muted = "#5a6b8c"`); used at `StepArea.tsx:146,188,191,201`, `Donut.tsx:92`, `ProgressRings.tsx:63`
Found by: accessibility

Description:
`palette.ts` defines `TEXT.secondary = "#8294b3"` (6.23:1 on the declared chart surface `#0a0f1c` — fine) and `TEXT.muted = "#5a6b8c"`. Every chart uses the *muted* one for real data labels:

- `StepArea.tsx:146` — the y-axis tick values, `fontSize={10}`. These are the money figures on the "Cumulative change-order value" chart. **3.57:1**.
- `StepArea.tsx:188,191` — the first and last date on the x-axis, `fontSize={10}`. **3.57:1**.
- `StepArea.tsx:201` — the hover crosshair line stroke. **3.57:1** (non-text, 3:1 threshold: passes, marginally).
- `Donut.tsx:92` — the centre caption under the total figure, `fontSize={11}`. **3.57:1**.
- `ProgressRings.tsx:63` — the "work done" caption, `fontSize={11}`. **3.57:1**.

All are well under 18.66px/24px, so the 3:1 large-text allowance does not apply.

Impact:
The axis scale is what makes a chart readable. On the dashboard (`src/app/(app)/dashboard/page.tsx:224-250`) the tick values are the only place the money magnitude appears, so a low-vision user gets shape without scale.

Suggested fix:
Switch `StepArea.tsx:146,188,191`, `Donut.tsx:92` and `ProgressRings.tsx:63` from `TEXT.muted` to `TEXT.secondary` (`#8294b3`, 6.23:1) — the palette already has a passing token. Keep `TEXT.muted` for the crosshair stroke only, where the 3:1 non-text threshold applies. The comment block at `palette.ts:1-29` states every pair was machine-checked; the text tokens at `:69-73` evidently were not included in that check.

---

### [COLOUR CONTRAST] — Input and button boundaries fail the 3:1 non-text threshold
Severity: Medium
Location: `src/app/globals.css:116-122` (`.input-base`), `:131-142` (`.btn`); `tailwind.config.ts:24-28` (`line` scale)
Found by: accessibility

Description:
WCAG 1.4.11 requires 3:1 for the visual information needed to identify a UI component. Measured against the composited `.surface` (`#090e1a`):

| boundary | ratio |
|---|---|
| `border-line` `#1e2a48` vs `.surface` | **1.36:1** |
| `border-line` `#1e2a48` vs the input fill `#070b14` | **1.39:1** |
| `border-line-soft` `#16203a` vs `.surface` | **1.20:1** |
| `border-line-strong` `#2c3a60` vs `.surface` | **1.73:1** |
| `.input-base` fill (`bg-ink-950/70` -> `#070b14`) vs `.surface` | **1.02:1** |
| `.btn` fill `ink-800 #121a2e` vs `.surface` | **1.11:1** |

So a text field is distinguished from the card it sits on by a 1.02:1 fill and a 1.36:1 border — neither is perceivable at low vision. The same applies to every secondary `.btn` (`Cancel`, `Spreadsheet`, `Favourite`, `Record minute`, `Send a new code`, `Reset`), whose only affordance is the same `border-line` hairline. `btn-primary` is exempt — its gradient fill carries the affordance.

Impact:
A low-vision user cannot see where a form field begins or ends, or that a secondary button is a button rather than static text. On `/jobs/[id]/quote` this matters concretely: the Lines table (`jobs/[id]/quote/page.tsx:143-182`) is a 6x4 grid of bare `.input-base` cells whose only visual structure is the failing border.

Suggested fix:
Raise `line` (`tailwind.config.ts:25`) to roughly `#3a4a74` (~3.0:1 against `.surface`) for interactive boundaries, or introduce a separate `line-interactive` token used by `.input-base` and `.btn` while `line`/`line-soft` stay decorative for card and table rules — decorative dividers are not subject to 1.4.11, but control boundaries are.

---

### [SEMANTICS] — `EmptyState` renders an `<h3>`, so permission-denied and empty routes have no `<h1>` and skip two levels
Severity: Medium
Location: `src/components/ui/EmptyState.tsx:21` (`<h3>`) vs `:43` (`<h1>` in `PageHeader`)
Found by: accessibility

Description:
`PageHeader` renders the page `<h1>` (`EmptyState.tsx:43`); `EmptyState` renders an `<h3>` (`EmptyState.tsx:21`). Two problems follow.

**No `<h1>` at all.** Seventeen routes return a bare `<EmptyState>` as the *entire* page body, with no `PageHeader` above it, so the document's highest heading is an `<h3>`:
- `src/app/(app)/jobs/page.tsx:31` ("Forbidden") and `:36` ("No project")
- `src/app/(app)/jobs/[id]/accept/page.tsx:32` ("Not an authoriser") and `:56` ("Nothing to accept") — both states of the accept flow
- `src/app/(app)/jobs/[id]/quote/page.tsx:29,43`
- `src/app/(app)/jobs/new/page.tsx:22,26`
- `src/app/(app)/admin/page.tsx:14`, `admin/projects/page.tsx:26,40`
- `src/app/(app)/change-orders/page.tsx:23`, `crew-requests/page.tsx:23`, `meetings/page.tsx:14`, `contractors/page.tsx:13`, `drawings/page.tsx:14`, `documents/page.tsx:14`, `risks/page.tsx:28`, `logistics/page.tsx:64`, `inventory/page.tsx:57`, `schedule/page.tsx:124`, `financials/page.tsx:15`

**Level skip.** Where `EmptyState` *is* used under a `PageHeader` (e.g. `jobs/page.tsx:89` then `:183`; `search/page.tsx:89` then `:107`), the structure is h1 -> h3 with no h2. `SectionCard` correctly uses `<h2>` (`SectionCard.tsx:26`), so the h3 is simply the wrong level.

Impact:
Screen-reader users navigate by heading. A "Forbidden" or "Not an authoriser" page with no h1 gives no landmark to orient on and no statement of what the page is; the user lands in the sidebar and has to hunt. WCAG 1.3.1, and 2.4.6 in spirit.

Suggested fix:
Give `EmptyState` a `headingLevel` prop defaulting to `2`, and use `1` on the seventeen bare-`EmptyState` returns listed above (those *are* the page). At minimum change `EmptyState.tsx:21` from `h3` to `h2` so no route skips a level.

---

### [SEMANTICS] — Jobs-list table declares four column headers for five-column rows
Severity: Medium
Location: `src/app/(app)/jobs/page.tsx:231-316` — `<thead className="sr-only">` at `:232-239`, body cells at `:246,273,293,296,299`
Found by: accessibility

Description:
The screen-reader-only header row declares four columns:

```tsx
<thead className="sr-only">
  <tr><th>Quote</th><th>Status</th><th>Price</th><th>Delivered</th></tr>
</thead>
```

Every body row renders **five** `<td>`s: quote link + badges (`:246`), status (`:273`), price (`:293`), delivered date (`:296`), and a progress bar + percentage (`:299`). The fifth column has no header. The `<th>`s also carry no `scope="col"`, so association relies on the browser's heuristics for an irregular table.

Impact:
A screen-reader user reading the jobs list in table mode hears four column names against five cells; the progress percentage — how far along the work is — is announced with no header, and from that column onward the header-to-cell mapping in some AT drifts. This is the primary list of the application.

Suggested fix:
Add a fifth `<th>Progress</th>` at `jobs/page.tsx:238` and `scope="col"` on all five. Consider the same audit on every other table in the app (see the `scope` finding below).

---

### [ARIA / FORMS] — Upload progress and upload errors are never announced
Severity: Medium
Location: `src/components/ui/FileDrop.tsx:182-231` (status span at `:199-205`, error text at `:203`)
Found by: accessibility

Description:
`FileDrop` is a client component that mutates its list in place: a queued file shows `"Uploading…"`, then either its size (success) or an error string such as `"Larger than 10 MB"` (`FileDrop.tsx:108`), `"Upload refused (413)"` (`FileDrop.tsx:74`) or `"Storage rejected the file (500)"` (`FileDrop.tsx:83`).

None of it is announced. There is no `aria-live` region, no `role="status"`, no `role="alert"` anywhere in the component, and the status icons at `FileDrop.tsx:190,192,194` are all `aria-hidden`. The only signal is the visual text swap inside the `<li>`.

Impact:
A screen-reader user drops or picks a file and gets silence. If the file is over 10 MB or the server refuses it, they are never told — they submit the quote request believing the drawing is attached when it is not. Because the hidden form field is only emitted on success (`FileDrop.tsx:216-227`), the request silently goes to the yard without the attachment. WCAG 4.1.3 Status Messages.

Suggested fix:
Wrap the `<ul>` at `FileDrop.tsx:183` in a container with `role="status" aria-live="polite" aria-atomic="false"`, and render failures in a sibling `role="alert"`. Announce a short sentence per transition ("drawing-01.pdf uploaded", "drawing-01.pdf rejected: larger than 10 MB") rather than relying on the visual row.

---

### [ARIA] — Search inputs with no accessible name
Severity: Medium
Location: `src/app/(app)/search/page.tsx:26-31` and `:100`
Found by: accessibility

Description:
The dedicated Search page has two search fields, neither of which is named:

- `:26-31` — `<input name="q" placeholder="Type and press enter…" className="input-base pl-9" autoFocus />`. No `<label>`, no `aria-label`. The only name source is the placeholder, which most AT expose only as a hint and which disappears the moment the user types.
- `:100` — `<input name="q" defaultValue={q} className="input-base pl-9" />`. No label, no `aria-label`, **and no placeholder** — the accessible name is empty.

This is inconsistent with the rest of the codebase, which gets it right: the top-bar search has `aria-label="Search"` (`TopBar.tsx:32`), the jobs search has `aria-label="Search quotes"` (`jobs/page.tsx:168`), and the list filters use `FilterField` / `<label>` wrappers (`FilterBar.tsx:124-139`, `inventory/page.tsx:106-122`).

Two smaller cases of the same pattern:
- `src/app/(app)/change-orders/[id]/page.tsx:251-255` — the approval-decision `<textarea name="comment">` has only `placeholder="Comment (optional)…"`.
- `src/app/(app)/jobs/[id]/page.tsx:474-478` — the `<input name="reason">` attached to destructive workflow transitions has only `placeholder="Reason (recorded on the job)"`. This reason is written into the job history, so an unnamed field is recording auditable text.

Impact:
The field at `search/page.tsx:100` is announced as "edit, blank" with no indication of purpose — and it is the persistent search bar shown on every results page. WCAG 1.3.1, 3.3.2, 4.1.2.

Suggested fix:
Add `aria-label="Search"` to `search/page.tsx:26` and `:100`, `aria-label="Decision comment"` to `change-orders/[id]/page.tsx:251`, and `aria-label="Reason"` to `jobs/[id]/page.tsx:474`. Placeholders are hints, never names.

---

### [ARIA] — Repeated row-action buttons have no row context in their accessible name
Severity: Medium
Location: `src/app/(app)/approvals/page.tsx:144-156`; `src/app/(app)/change-orders/[id]/page.tsx:249-267`; `src/app/(app)/jobs/[id]/page.tsx:469-488`
Found by: accessibility

Description:
The Approvals Centre renders one form per pending approval, each with three buttons whose entire accessible name is "Approve", "Request Info" or "Reject" (`approvals/page.tsx:146,149,152`). With fifty pending approvals (`take: 50`, `approvals/page.tsx:60`) that is 150 buttons with three distinct names between them. The change-order number that identifies the row is in a different `<td>` (`approvals/page.tsx:120-127`).

Same shape at `change-orders/[id]/page.tsx:257-265` (one set per approval stage, all named "Approve"/"Request Info"/"Reject") and at `jobs/[id]/page.tsx:480-486`, where the button label comes from `action.label` and the destructive variant sits next to an unnamed reason input.

Impact:
Screen-reader users commonly navigate by pulling up a list of buttons. That list reads "Approve, Request Info, Reject, Approve, Request Info, Reject…" with nothing to distinguish them. Approving the wrong change order is an irreversible, financially material action — these are the buttons that commit money. WCAG 2.4.6, 4.1.2.

Suggested fix:
Add `aria-label={`Approve ${a.changeOrder.number} — ${a.changeOrder.title}`}` (and the equivalents for Request Info / Reject) at `approvals/page.tsx:146,149,152` and `change-orders/[id]/page.tsx:257,260,263`. The visible text stays "Approve", so there is no visible/accessible-name mismatch as long as the label *starts* with the visible string (required for speech-input users under WCAG 2.5.3).

---

### [SEMANTICS] — Risk-register column headers "L" and "I" carry their meaning only in a `title` attribute
Severity: Medium
Location: `src/app/(app)/risks/page.tsx:83,84,88`
Found by: accessibility

Description:
```tsx
<th className="w-10 text-center" title="Likelihood (1–5)">L</th>
<th className="w-10 text-center" title="Impact (1–5)">I</th>
…
<th className="w-16 text-right" title="Schedule impact (days)">Sched</th>
```
The accessible name of each header is the visible text — "L", "I", "Sched". The `title` attribute is used as the expansion, but `title` only surfaces on mouse hover: it is unreachable by keyboard, unavailable on touch, and inconsistently exposed by screen readers (and where it *is* exposed it usually replaces rather than supplements the name, creating a different problem).

Impact:
When a screen-reader user moves across a risk row, cells are announced as "L, 4" and "I, 5". The risk rating that drives escalation is unintelligible. Sighted keyboard and touch users have no way to discover what the abbreviations mean either. WCAG 1.3.1, and 3.3.2 for the undiscoverable hint.

Suggested fix:
Use `<th scope="col"><abbr title="Likelihood">L</abbr></th>` — which sighted users can at least hover — or, better, keep the narrow visual column and put the full name in a visually-hidden span: `<th scope="col">L<span class="sr-only"> Likelihood, 1 to 5</span></th>`.

---

### [FORMS] — `Field` errors are rendered inside the `<label>`, so they join the name instead of being announced
Severity: Medium
Location: `src/components/ui/Form.tsx:16-23` (`hint` at `:20`, `error` at `:21`)
Found by: accessibility

Description:
```tsx
<label className={cn("block", className)}>
  <span className="label-base">{label}</span>
  {children}
  {hint && !error && <span className="text-xs text-muted mt-1 block">{hint}</span>}
  {error && <span className="text-xs text-bad mt-1 block">{error}</span>}
</label>
```
Both the hint and the error are *inside* the `<label>`, so they are concatenated into the control's accessible name rather than exposed as a description or an error. There is no `aria-describedby`, no `aria-invalid`, and no `role="alert"` on the error span. Nothing in the codebase sets `aria-invalid` anywhere.

Consequences today:
- Every hint becomes part of the field name. The description field on `jobs/new/page.tsx:105-108` gets a 30-word accessible name; the "Valid for (days)" field on `jobs/[id]/quote/page.tsx:121` is announced as "Valid for (days) Blank means no expiry, edit".
- When `error` is populated, the name changes rather than an error being reported, and nothing is announced at all if the error appears without a page navigation.

Page-level errors are handled better — `login/page.tsx:74-87`, `jobs/[id]/accept/page.tsx:103-111`, `jobs/[id]/quote/page.tsx:71-79`, `jobs/new/page.tsx:70-78`, `admin/projects/page.tsx:66-75` and `reset/[token]/page.tsx:114-122` all use `role="alert"` — but they are all server-rendered after a redirect, and no focus is moved to them, so a screen-reader user who submits the login form and lands back on `/login?err=invalid` may simply hear the page re-read from the top.

Impact:
Field-level validation is not conveyed as validation. WCAG 3.3.1 Error Identification, 1.3.1, and 4.1.3 for the un-announced case.

Suggested fix:
Restructure `Field` to keep hint and error *outside* the `<label>`, generate ids with `useId`, and pass `aria-describedby={[hintId, errorId]}` and `aria-invalid={!!error}` down to the control (which means `Field` needs to clone its child or accept a render prop). Give the error span `role="alert"`. Separately, move focus to the page-level alert after a failed submit.

---

### [SEMANTICS] — Sidebar navigation landmark has no accessible name
Severity: Medium
Location: `src/components/layout/Sidebar.tsx:65`; `src/components/layout/TopBar.tsx:24`
Found by: accessibility

Description:
`Sidebar.tsx:65` renders `<nav className="py-3">` with 19 links and no `aria-label`. The app shell contains several navigation landmarks at once — the sidebar nav, `<nav aria-label="Views">` on the jobs list (`jobs/page.tsx:109`) and `<nav aria-label="Projects">` in admin (`admin/projects/page.tsx:78`) — so the unnamed one is announced simply as "navigation" alongside named siblings. The marketing side does this correctly (`Nav.tsx:35` `aria-label="Primary"`, `Footer.tsx:46` `aria-label={col.heading}`).

Related: `TopBar.tsx:24` renders a `<header>` inside the app shell while `(app)/layout.tsx` has no top-level `<header>`, so the top bar becomes a `banner` landmark — correct — but the `<aside>` at `Sidebar.tsx:53` becomes a `complementary` landmark wrapping the primary navigation, which is the wrong role for the app's main nav.

Impact:
Landmark navigation (a primary screen-reader strategy) is degraded: the user gets an unnamed "navigation" inside a "complementary" region and must explore it to find out it is the main menu. WCAG 1.3.1, 2.4.1.

Suggested fix:
`<nav aria-label="Main">` at `Sidebar.tsx:65`, and change the `<aside>` at `Sidebar.tsx:53` to a plain `<div>` so the `<nav>` is the landmark rather than being nested inside `complementary`.

---

### [SEMANTICS] — Brand panel `<h2>` precedes the page `<h1>` on all three auth pages
Severity: Low
Location: `src/components/auth/BrandPanel.tsx:49`; `src/app/login/page.tsx:41-43`, `src/app/forgot/page.tsx:78-80`, `src/app/reset/[token]/page.tsx:80-82`
Found by: accessibility

Description:
All three auth routes render `<BrandPanel />` as the first child of `<main>`, before the sign-in column. `BrandPanel.tsx:49` is an `<h2>` ("The operational command centre for refit & new build projects."). The page's `<h1>` ("Sign in", `login/page.tsx:59`; "Forgot password", `forgot/page.tsx:110`; "Set a new password", `reset/[token]/page.tsx:104`) comes after it in DOM order.

So the heading outline of every auth page is h2 -> h1. The panel is `hidden … lg:flex` (`BrandPanel.tsx:24`), which hides it visually below the `lg` breakpoint but `display:none` also removes it from the accessibility tree, so the problem only affects large viewports — where most desktop screen-reader users are.

Impact:
A user pressing `1` to jump to the page's main heading lands after the marketing copy; a user reading the outline sees the marketing statement presented as the document's most senior heading. WCAG 1.3.1 (heading order is an AAA criterion at 2.4.10, but the mis-levelling is a structure issue).

Suggested fix:
Demote `BrandPanel.tsx:49` to a `<p>` with the same typographic classes — it is marketing copy, not a section heading for anything.

---

### [KEYBOARD] — StepArea crosshair and Donut slice emphasis are mouse-only
Severity: Low
Location: `src/components/charts/StepArea.tsx:75-87,123-124,195-235`; `src/components/charts/Donut.tsx:74-75,103-104`
Found by: accessibility

Description:
`StepArea` reads values under the pointer via `onMouseMove` / `onMouseLeave` on the `<svg>` (`StepArea.tsx:123-124`) and renders a crosshair plus a readout panel (`:195-235`). There is no `onFocus`/`onBlur`, no `tabIndex`, no keyboard handler and no pointer/touch events, so the readout is unavailable to keyboard users and to touch users on tablets — a plausible device in a yard.

`Donut` dims non-hovered slices via `onMouseEnter`/`onMouseLeave` on both the `<path>`s (`Donut.tsx:74-75`) and the legend `<li>`s (`:103-104`), again with no keyboard equivalent.

This is rated Low rather than higher because both components provide a genuine non-hover route to the same information, which is more than most codebases manage:
- `StepArea` ships a `<details><summary>View as table</summary>` fallback (`StepArea.tsx:238-268`) containing every date and every series value, reachable by keyboard and correctly marked up as a `<table>` with a `<thead>`.
- `StepArea` and `Donut` both expose an `<svg role="img" aria-labelledby>` summary (`StepArea.tsx:121-130`, `Donut.tsx:57-63`), and `Donut`'s visible legend (`:99-120`) repeats every label, value and share as text.
- `Donut`'s hover only changes opacity; no information is conveyed by it.

Impact:
Sighted keyboard users cannot read a specific point off the step chart without opening the table; touch users get no crosshair at all. Since equivalent data is reachable, this is a parity and polish gap rather than a WCAG 2.1.1 failure.

Suggested fix:
Give the `StepArea` `<svg>` `tabIndex={0}`, mirror `onMouseMove` with `onFocus`/`onKeyDown` (left/right arrows stepping `hoverT` between the points in `allDates(held)`), and add `onPointerMove` so touch works. For `Donut`, drop the `<li>` mouse handlers or pair them with `onFocus`/`onBlur` on a focusable legend item.

---

### [SEMANTICS] — `<p>` rendered as a direct child of `<dl>`
Severity: Low
Location: `src/components/charts/ProgressRings.tsx:68-81` (the `<p>` at `:72-80`)
Found by: accessibility

Description:
```tsx
<dl className="w-full min-w-0 space-y-2.5 text-sm">
  <Row … />   {/* renders <div><span/><dt/><dd/></div> — valid */}
  <Row … />
  {delta !== null && (
    <p className={…}>{delta} points ahead of the clock</p>   {/* invalid */}
  )}
</dl>
```
The `<dl>` content model permits `<dt>`, `<dd>`, `<div>` wrappers and script-supporting elements only. A `<p>` child is invalid. The `Row` helper (`ProgressRings.tsx:86-93`) wrapping its `dt`/`dd` pair in a `<div>` is correct; the `<p>` is not.

Impact:
Browsers recover differently. Some AT report the list's item count incorrectly or drop the stray paragraph from the list's reading order — and that paragraph carries the single most important sentence in the widget ("12 points behind the clock"), which is also the only non-colour expression of whether the project is ahead or behind. WCAG 1.3.1.

Suggested fix:
Move the `<p>` out of the `<dl>` — render it as a sibling after the closing `</dl>` — or express it as a third `Row` with `dt`/`dd`.

---

### [ARIA] — `role="alert"` combined with `aria-live="polite"`
Severity: Low
Location: `src/app/login/page.tsx:74-77`
Found by: accessibility

Description:
```tsx
<div role="alert" aria-live="polite" className="…">
```
`role="alert"` carries an implicit `aria-live="assertive"`. Explicitly setting `aria-live="polite"` on the same element overrides it, producing a container that claims alert semantics but polite delivery. The other six error banners in the codebase (`jobs/[id]/accept/page.tsx:105`, `jobs/[id]/quote/page.tsx:73`, `jobs/new/page.tsx:72`, `admin/projects/page.tsx:68`, `reset/[token]/page.tsx:116`, and the change-order equivalents) correctly use `role="alert"` alone, so this one is an outlier.

Impact:
Inconsistent announcement of the "Invalid email or password" message — it may be queued behind other output rather than interrupting. Not a failure on its own; it makes the login error less reliable than the identical errors elsewhere.

Suggested fix:
Remove `aria-live="polite"` from `login/page.tsx:76` and keep `role="alert"`. If polite delivery is genuinely wanted, use `role="status"` instead — as the success banner two elements above already does (`login/page.tsx:65`).

---

### [SEMANTICS] — Table headers throughout the app omit `scope`
Severity: Low
Location: `src/app/(app)/change-orders/page.tsx:133-139`; `admin/page.tsx:76-78,185-189`; `jobs/[id]/page.tsx:184-188`; `jobs/[id]/accept/page.tsx:139-143`; `jobs/[id]/quote/page.tsx:136-139`; `jobs/page.tsx:234-237`; `approvals/page.tsx:105-111`; `financials/page.tsx:155-167`; `risks/page.tsx:80-88`; `components/charts/StepArea.tsx:245-252`
Found by: accessibility

Description:
Not one `<th>` in the codebase carries `scope="col"`, and no data table uses `scope="row"` or a `<th>` for the row's identifying cell. Browsers infer column scope for simple rectangular tables, so most of these read correctly in practice — but three tables are not simple:
- `jobs/page.tsx:231-316` has a header/body column-count mismatch (see the separate finding), which is exactly the case where inference breaks.
- `jobs/[id]/page.tsx:203-210` puts a `colSpan={4}` "Total" summary row inside `<tbody>` rather than a `<tfoot>`.
- `financials/page.tsx:153-212` has eleven columns, the last of which contains only an `aria-hidden` graphic.

Impact:
Cell-by-cell navigation degrades on the non-rectangular tables. Low, because the underlying data is also readable linearly.

Suggested fix:
Add `scope="col"` to every `<th>`, mark the first cell of each data row as `<th scope="row">` where it identifies the row (the change-order number, the job code, the risk title), and move the "Total" row at `jobs/[id]/page.tsx:203-210` into a `<tfoot>`.

---

### [SEMANTICS] — `row-hover` advertises clickable rows that are not clickable
Severity: Low
Location: `src/app/globals.css:108-110`; used at `jobs/page.tsx:245`, `financials/page.tsx:177`, `risks/page.tsx:95`
Found by: accessibility

Description:
```css
.table-base tr.row-hover:hover { @apply bg-ink-800/60 cursor-pointer; }
```
`cursor: pointer` on the whole row promises the row is activatable. It is not: in `jobs/page.tsx:245` only the inner `<Link>` at `:247-252` is clickable; in `financials/page.tsx:177` and `risks/page.tsx:95` the row contains no link at all, so the entire row is a dead pointer target.

Impact:
Mouse users click the row and nothing happens; users with motor impairments, who rely on large targets, are drawn to the largest apparent target and get no response. Not a WCAG failure (no information is lost) but a real interaction defect, and it also means the generous 44px row is *not* serving as the target that WCAG 2.5.8 would otherwise credit.

Suggested fix:
Either make the row genuinely activatable (a stretched-link pseudo-element over the row's primary `<Link>`, which keeps one keyboard tab stop and one accessible name), or drop `cursor-pointer` from `globals.css:109` on the rows that have no link.

---

### [ARIA] — `aria-label` on a bare `<svg>` and `role="img"` on an empty progress `<div>`
Severity: Low
Location: `src/app/(app)/jobs/page.tsx:264` and `:213-224`
Found by: accessibility

Description:
Two small role/name issues on the jobs list:

- `:264` — `<Star size={11} className="fill-warn text-warn" aria-label="Favourite" />`. Lucide renders a bare `<svg>` with no `role`. An `aria-label` on an element whose implicit role is `graphics-document` (or, in several AT, generic) is inconsistently exposed; the reliable form is `role="img"` plus the label, or a visually-hidden span. Every other decorative lucide icon in the file is correctly `aria-hidden` (`:161-163`), so this one is the only naming case.
- `:213-224` — a track `<div role="img" aria-label={`${group.progressPct} per cent complete`}>` containing only a fill `<div>`. `role="img"` is a presentational-children role, so the inner div is pruned — which is the intent — but `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax` is the correct role for a determinate meter, and the percentage is in any case already rendered as visible text immediately after (`:223`), which makes the label a duplicate announcement.

`ProgressRings.tsx:39-45` gets the equivalent case right — `role="img"` on an SVG with a complete sentence for a label.

Impact:
Minor duplication and one unreliably-announced icon. The favourite state is also conveyed by `aria-pressed` on the toggle in the detail page (`jobs/[id]/page.tsx:133`), so no information is lost.

Suggested fix:
`role="img"` alongside `aria-label` at `jobs/page.tsx:264`; at `:215-217` either switch to `role="progressbar"` with the value attributes, or drop the `role`/`label` entirely and mark the bar `aria-hidden` since `:223` already states the number.

---

### [ARIA] — Mobile menu toggle sets `aria-expanded` but no `aria-controls`
Severity: Cosmetic
Location: `src/components/marketing/Nav.tsx:57-65`, panel at `:68-95`
Found by: accessibility

Description:
The toggle correctly carries `aria-label={open ? "Close menu" : "Open menu"}` and `aria-expanded={open}`, but the panel it controls (`:68`) has no `id` and the button has no `aria-controls`. The panel is also rendered as a sibling *after* the `<nav>` rather than inside it, so a user who follows the disclosure has to hunt for the revealed content.

Impact:
Very minor — the panel immediately follows the button in DOM order, so most AT land on it naturally. Marketing page only.

Suggested fix:
`id="mobile-menu"` on the div at `Nav.tsx:69` and `aria-controls="mobile-menu"` on the button at `:57`.

---

### [ARIA] — Donut `<title>` restates the visible legend verbatim
Severity: Cosmetic
Location: `src/components/charts/Donut.tsx:61-63` vs the legend at `:99-120`
Found by: accessibility

Description:
The SVG's accessible name is `folded.map(s => `${s.label}: ${formatValue(s.value)}`).join(", ")` — the same label/value pairs the visible `<ul>` legend lists immediately beside it, item by item, with an added percentage. A screen-reader user therefore hears the full dataset twice in a row.

Impact:
Verbosity only; nothing is lost or wrong. Worth noting because the duplication grows with the slice count.

Suggested fix:
Shorten the `<title>` to a one-line summary ("Change orders by status, {total} total, largest group {label} at {share}%") and let the legend carry the detail, or mark the SVG `aria-hidden` and let the legend be the sole accessible representation — the legend already carries every number.

---

### [ARIA] — `BudgetBar` carries a `title` attribute it can never expose
Severity: Cosmetic
Location: `src/components/data/BudgetBar.tsx:26-30`
Found by: accessibility

Description:
The bar is correctly `aria-hidden` (`:29`) — the financials table already renders Actual, Forecast and Variance as text columns (`financials/page.tsx:184-203`), so the graphic is genuinely redundant and hiding it is the right call. But the same element also sets `title={`Actual: … | Forecast: … | Budget: …`}` (`:28`). A `title` on an `aria-hidden` element is unreachable by every assistive technology and by every keyboard user; it is dead code that reads as if it were an accessibility affordance.

Also worth noting for contrast: the bar's track is `bg-ink-800` at **1.11:1** against the surrounding `.surface`, and the baseline marker is a 1px `bg-white/60` hairline. Since the element is `aria-hidden` and the numbers are in adjacent text columns, this is not a 1.4.11 failure — but it does mean the graphic conveys almost nothing visually either.

Impact:
None functionally. Removing the misleading `title` prevents a future reader from assuming the data is exposed.

Suggested fix:
Delete the `title` attribute at `BudgetBar.tsx:28`, keep `aria-hidden`. Optionally raise the track to `bg-ink-700` so the bar is visible at all.

---

## Checked and found correct

Recorded so the next audit does not re-derive them:

- **`prefers-reduced-motion` is honoured.** `globals.css:263-271` clamps `animation-duration`, `animation-iteration-count`, `transition-duration` and `scroll-behavior` on `*`, `*::before` and `*::after` with `!important`. Because an `!important` author declaration outranks a non-important inline style, this also neutralises the inline `style={{ transition: "opacity 150ms" }}` in `Donut.tsx:72` and the inline `animationDelay` values used across `schedule/page.tsx`, `inventory/page.tsx` and `financials/page.tsx`. The infinite `pulse-glow` and `shimmer` animations are covered by the iteration-count clamp.
- **`muted` `#8294b3` passes AA everywhere it is used** — 4.99:1 at worst (`ink-700`), 6.28:1 on the standard card surface. No action needed.
- **Status colours pass on the card surface**: `ok` 8.46:1, `warn` 8.98:1, `bad` 5.12:1, `accent` 5.24:1, `accent-bright` 7.58:1, `marine` 9.00:1. The badge variants also pass with their tinted backgrounds: `badge-ok` 7.41:1, `badge-warn` 7.86:1, `badge-bad` 4.76:1, `badge-info` 6.44:1, `badge-muted` 5.64:1.
- **The global focus ring is well chosen** — `globals.css:43-47`, marine `#38bdf8` at 9.29:1 against `ink-950`, 2px, with `outline-offset: 2px`. Only the two overrides listed above spoil it.
- **`<html lang="en">`** is set (`src/app/layout.tsx:36`).
- **Colour is never the sole channel** in the charts: `Donut` and `StepArea` both ship text legends (`Donut.tsx:99-120`, `StepArea.tsx:100-111`), `ProgressRings` states direction in words ("12 points behind the clock", `ProgressRings.tsx:76-79`), and `palette.ts:1-29` documents a colour-vision check that rejected two proposed pairings.
- **Icon-only controls are named**: `TopBar.tsx:42` (`aria-label="Notifications"`), `Nav.tsx:60` (`aria-label={open ? "Close menu" : "Open menu"}`), `FileDrop.tsx:210` (`aria-label={`Remove ${item.file.name}`}`), `Logo.tsx:8`. Decorative lucide icons are consistently `aria-hidden`.
- **No `aria-label` contradicts its visible text** anywhere in the codebase; the only mismatch risk is the composite-label problem in `Field`/`FileDrop` above.
- **`aria-current`** is used correctly on all three navigations (`Sidebar.tsx:85`, `jobs/page.tsx:117`, `admin/projects/page.tsx:85`).
- **Lists are marked up as lists** — exclusions and notes as `<ol>` (`jobs/[id]/page.tsx:223,236`), history and legends as `<ul>`, approval stages as `<ol>` (`change-orders/[id]/page.tsx`). No `<div>`-as-list patterns found.
- **`ProjectSwitcher` degrades without JavaScript** (`ProjectSwitcher.tsx:63-65`) and collapses to a static label when there is only one project (`:28-38`).
- **No `<img>` elements exist**, so there are no missing `alt` attributes.
