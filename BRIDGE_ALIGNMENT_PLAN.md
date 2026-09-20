# OceancOS — Yard Portal Build Plan (aligned to "The Bridge by MB92")

**Reference:** *The Bridge by MB92 — User Manual, July 2026* (43 pages, MB92 client resource portal).
**Scope:** turn OceancOS's refit-project surface into a yard-interface module that matches The Bridge's
feature set and workflow, then go beyond it where OceancOS's owner-side governance gives us an edge.
**Status of this document:** Phase 0 is complete apart from one admin form; Phase 1 onwards is still
design. See §9 for the progress log.

---

## 1. What The Bridge actually is

The Bridge is MB92's client-facing refit portal. One login, one project code, one top nav. Everything hangs
off a single object: the **Job / Quote**, identified by a yard code (`D.0130.05`, `I.2200.20`, `P.1000.01`).
Every other tab is a different view onto that same object.

### 1.1 Navigation (as shipped)

| Tab | Sub-views | Purpose |
|---|---|---|
| Home | — | Project dashboard: dates, money, progress, recent feeds, two charts |
| Inbox | Comments · Actions · Attachments · Minutes | Unified notification feed with read state |
| Quotes | New Quotes (Requests) · New Purchases · Accepted · Pending · Cancelled Works · Cancelled Quotes · Worklist | The core object: request → quote → accept → complete |
| After Sales | Minor deficiencies · Warranty claims | Post-completion issue tracking |
| Invoices | Invoices · Payments · Account Statement | Yard billing with outstanding balance |
| Minutes | — | Meeting minutes, searchable, grouped by job |
| Locations | — | Pins on the General Arrangement, tagged by job code |
| Planning | one tab per plan (e.g. Dry Dock Works, Outstanding before departure, Schedule) | Gantt with tree grid |
| Favourites | — | Per-user starred jobs |
| Forms | — | Links to yard request forms |
| Key Contacts | — | Yard team cards for this project |
| Profile → Notification settings | — | Email/SMS, what, when, frequency, per-project |

Header: yard logo · **Project code selector** · username. Red dot on Inbox / Quotes / Invoices when unread.

### 1.2 The Job / Quote object

Fields visible in the manual:

- **Code** (hierarchical: section letter → group `D.0100` → job `D.0100.01` → planning subtasks `01.`, `02.`)
- **Section** (Dry Dock, Interior, Engineering & Systems, Deck Works, Projects, Services) plus a **Client Reference** view
- **Client job reference number** (the yacht's own tracking number, optional)
- **Title**, **Description**
- **Contract type**: Contract · Variation Certificate · Services (also "New Purchases")
- **Pricing basis**: Fixed · Estimated · Time & Materials; **Type**: Fixed · Exception
- **Line items**: description, quantity, unit, unit price, total price → **Total**
- **Exclusions** (list), **Notes** (list)
- **Variation certificate details**: variation due to (e.g. Owner Request), variation affecting (e.g. Works
  Specification), adjustment to delivery date, adjustment to contract price, adjustment to invoicing terms
  (e.g. 50% on signature / 50% on completion with dates), **valid for N days** → **Expired** label
- **Designated authoriser** (chosen at request time from a list the yard PM maintains)
- **Price**, **Delivered** date (quote delivered), **Requested** date, **VC Delivered**, **Accepted / Cancelled** date
- **Progress %** (yard-reported), **Status**
- **Digital acceptance records**: "Quote Accepted" (client, date, name) and "MB92 Accepted" (yard countersign, date, name)
- **Comments** thread with file uploads (saved as **Media**), each comment can be posted as a message or tagged as a **minute**
- **Favourite** flag (per user)
- **Location pin(s)** on the GA (mini-map shown on the job)

### 1.3 Lifecycle (reconstructed from the manual)

```
Client request (form) ──► NEW REQUEST
        │  yard prices it
        ▼
   QUOTE SENT / PENDING ──► EXPIRED (validity days elapsed; still signable, PM decides on countersign)
        │  client Accept ─► 2nd confirmation ─► auth code to registered device
        ▼
   CLIENT ACCEPTED ──► yard PM countersigns ─► ACCEPTED (works in progress, progress %)
        │                                          │
        ├─► CANCELLED QUOTE                        ▼
        └─► CANCELLED WORKS                  MB92 COMPLETED
                                                   │  client inspects
                                       ┌───────────┴───────────┐
                                       ▼                       ▼
                               WORKS ACCEPTED           MINOR DEFICIENCY
                            (warranty starts now)     (after-sales ticket)
                                       │
                                       ▼
                               WARRANTY CLAIM (post-departure, "Reviewing Claim" …)
```

Pre-acceptance the client can Reject or post feedback comments to the PM.

### 1.4 Formulas shown on Home

- **Work progress %** = Σ(progress % × accepted value) ÷ Σ(accepted value)
- **Time progress %** = (today − arrival) ÷ (departure − arrival)
- **Started N days ago**, **Finish in N days**, **Onsite for N days** derived from arrival / departure
- **Quotation statuses** donut: counts by New Requests, Pending, Cancelled Works, Cancelled Quotes, Contract, Services, Variation Certificate
- **Total Accepted** split by Contract / Variation Certificate / Services; **Pending** with Cancelled Works / Cancelled Quotes
- **Quotation history**: cumulative € pending vs accepted over time
- **Invoices vs Payments**: cumulative € invoiced vs paid over time

### 1.5 Inbox

Tabs with `unread / total` counts (Comments, Actions, Attachments, Minutes). Left filters: Unread, Past 7 days,
Past 30 days, All. "Mark comments read". Columns: From, Subject (job code + title), Tags (e.g. Accepted Quote,
Pending Quote), Date. Sortable, searchable, inline preview, **Open** goes to the job.

### 1.6 Invoices

Tabs: Invoices (date, number, amount, VAT, description, Summary PDF / Detailed PDF / Spreadsheet),
Payments (received, amounts), Account Statement (reference, date, type Invoice/Payment, description, amount;
totals Invoices / Payments / **Outstanding**).

### 1.7 Notification settings (profile)

Mobile + email; How (Email / SMS); What (New comments, Quotation status changes); When (start/end time, days of
week, timezone); Frequency (as they happen ≤ every 15 min, hourly, daily digest); per-project on/off.

---

## 2. Where OceancOS stands today

Honest mapping. "Exists" means wired end to end; "Partial" means schema or list only; "Missing" means nothing.

| Bridge capability | OceancOS today | State |
|---|---|---|
| Project context switcher in header | Multi-project schema, no UI switcher; every page queries across all projects | Missing |
| Job / Quote object with yard code, contract type, pricing basis | `ChangeOrder` (title, description, reason, estimatedCost, 5-stage approval) — no code hierarchy, no line items, no contract type, no validity | Partial |
| Line items, exclusions, notes, VC details | None | Missing |
| Client request form → quote | `CrewRequest` (internal) and `ChangeOrder` create form; no "request to yard" concept | Partial |
| Accept with 2nd confirmation + auth code | `ChangeOrderApproval` stages with Approve / Info / Reject buttons; single click, no second factor | Partial |
| Yard countersign | None | Missing |
| Validity period / Expired | None | Missing |
| Progress % per job | `ScheduleTask.status` only | Missing |
| MB92 Completed → Works Accepted / Minor Deficiency | CO statuses go COMPLETED → CLOSED; no client acceptance, no deficiency | Missing |
| Warranty claims | `Document.type = WARRANTY` only | Missing |
| Comments on job | `Comment` (linked to CO / CrewRequest) | Exists |
| Comment tagged as minute | None (`Meeting.minutes` is a free-text field on a meeting record) | Missing |
| File uploads as Media | `Attachment` metadata only; no upload route, no storage | Partial |
| Favourites | None | Missing |
| Inbox with tabs / read state / filters | `Notification` list, newest first, mark all read on visit | Partial |
| Home: dates, money split, progress rings, feeds, two charts | Dashboard with CO counts, budget rollup, milestones, risks, audit feed | Partial |
| Invoices / Payments / Account statement | `Invoice` is supplier-side (owner pays suppliers); no yard invoice, no payments, no statement | Partial |
| Summary / Detailed PDF, spreadsheet export | None | Missing |
| Minutes tab (search, date range, grouped by job) | `Meeting` list with actions | Partial |
| Locations on GA | `VesselArea` names only; no GA image, no pins | Missing |
| Planning Gantt | `ScheduleTask` with single `dependsOnId`; list view only | Partial |
| Worklist flat table + Excel | CO list with filters | Partial |
| Forms page | None | Missing |
| Key Contacts | `Contractor` / `Supplier` directories; no per-project team cards | Partial |
| Notification settings | None; `notify()` writes in-app only, SMTP stubbed | Missing |
| Password reset by email | None | Missing |
| Mobile / tablet | Sidebar layout, not verified on small screens | Unknown |
| Audit trail | `recordAudit()` on every mutation | Exists |
| RBAC | 19 roles, permission matrix, server-side checks | Exists |

**Toolchain note:** the QA report says `npm install` and `tsc` were never run in the original build. They were run
during this planning pass and pass; see §8.

---

## 3. Design decisions

These are the calls that shape everything below. Each one is a recommendation; §7 lists the ones you need to confirm.

1. **OceancOS is the vessel-side system, not a yard product.** The Bridge is operated by the yard for one
   client. OceancOS is operated by the owner's team across yards and projects. We replicate The Bridge's
   *client-facing contract* (what the captain, owner's rep and PM see and do) and make it yard-agnostic.
   Yard users (`YARD_PM`, `YARD_TRADE_LEAD`) get a role-gated "issue quote" side so a yard without its own
   portal can work inside OceancOS, and so we can seed/import data from yards that do.

2. **One new aggregate: `Job`.** Not another status on `ChangeOrder`. A `ChangeOrder` is the owner-side
   governance record (why we are changing scope, who internally approves). A `Job` is the commercial record
   with the yard (code, price, lines, validity, signatures, progress). They link one-to-many (a CO can spawn
   jobs; a job can reference the CO that authorised it). This keeps the existing approval chain intact and
   lets it *gate* the client Accept action, which is the one thing The Bridge cannot do.

3. **Keep the OceancOS dark design system.** Same tokens (`ink`, `line`, `accent`, `marine`), same
   primitives (`SectionCard`, `DefGrid`, `StatCard`, `Panel`, `FilterBar`). The Bridge's light grey/tan
   look is not the target; its information architecture is.

4. **Add project context to the shell.** A project selector in the top bar (mirrors The Bridge's project
   code dropdown), persisted in the session cookie, applied as a `where: { projectId }` filter in every
   yard-module query. Existing modules keep their cross-project views until migrated.

5. **Sidebar gets a "Yard" section** rather than replacing the sidebar with a top nav:
   Yard Home · Inbox · Jobs & Quotes · After Sales · Yard Invoices · Minutes · Locations · Planning ·
   Favourites · Key Contacts. Existing sections (Project / Knowledge / Network / System) remain.

6. **Yard code system is configurable per project, MB92-style by default.** A `JobSection` table
   (letter, name, sort) per project; codes are strings validated against `^[A-Z]\.\d{4}(\.\d{2})?(-\d{2})?$`
   by default with a per-project override. Do not hard-code MB92's letters.

7. **Comments become the single conversation primitive.** One `Comment` row, polymorphic on `resource`
   already; add `isMinute`, `attachments`, and system-generated comments (`kind = SYSTEM`) for "Client
   Action – Accepted Quote" style events. Inbox, Minutes, Recent Messages and the job thread all read from it.

8. **Real file storage before any of this ships.** S3-compatible (Cloudflare R2 / MinIO / AWS) via signed
   upload URLs. Local disk stays for dev only.

9. **Second-factor on Accept.** Email one-time code by default (SMS optional later). Stored hashed with a
   10-minute expiry on an `AcceptanceChallenge` row. This is a signature, so the audit row must capture
   code-verified, IP, user agent, and the quote revision hash.

---

## 4. Target data model (Prisma additions)

New models. Every business table keeps the house convention: `id`, `createdAt`, `createdById`, `updatedAt`,
`updatedById`, `archivedAt`.

```prisma
// ---- Project context ----
model Project {
  // existing fields …
  code          String?   @unique      // "R-00721" — the project code shown in the header
  yardName      String?
  arrivalDate   DateTime?
  haulOutDate   DateTime?
  seaTrialsDate DateTime?
  departureDate DateTime?
  currency      String    @default("EUR")
  gaDecks       GaDeck[]
  jobs          Job[]
  sections      JobSection[]
  yardInvoices  YardInvoice[]
  payments      Payment[]
  keyContacts   KeyContact[]
  plans         Plan[]
}

model JobSection {          // D = Dry Dock, I = Interior, …
  id        String  @id @default(cuid())
  projectId String
  letter    String
  name      String
  sort      Int     @default(0)
  project   Project @relation(fields: [projectId], references: [id])
  jobs      Job[]
  @@unique([projectId, letter])
}

// ---- The core object ----
model Job {
  id                 String   @id @default(cuid())
  projectId          String
  sectionId          String?
  code               String                  // "D.0130.05"
  groupCode          String?                 // "D.0130" — derived, kept for grouping/sort
  clientRef          String?                 // yacht's own tracking number
  title              String
  description        String
  contractType       String   @default("VARIATION_CERTIFICATE") // CONTRACT|VARIATION_CERTIFICATE|SERVICES|PURCHASE
  pricingBasis       String   @default("FIXED")                 // FIXED|ESTIMATED|TIME_AND_MATERIALS
  exceptionFlag      Boolean  @default(false)                   // Bridge "Type: Exception"
  status             String   @default("NEW_REQUEST")
  // NEW_REQUEST|QUOTE_SENT|CLIENT_ACCEPTED|ACCEPTED|EXPIRED|CANCELLED_QUOTE|CANCELLED_WORKS|
  // YARD_COMPLETED|WORKS_ACCEPTED|MINOR_DEFICIENCY|CLOSED
  total              Float    @default(0)
  currency           String   @default("EUR")
  progressPct        Int      @default(0)
  requestedAt        DateTime?
  quoteDeliveredAt   DateTime?
  validityDays       Int?
  expiresAt          DateTime?               // quoteDeliveredAt + validityDays
  clientAcceptedAt   DateTime?
  clientAcceptedById String?
  yardAcceptedAt     DateTime?               // countersign
  yardAcceptedById   String?
  cancelledAt        DateTime?
  yardCompletedAt    DateTime?
  worksAcceptedAt    DateTime?               // warranty start
  warrantyMonths     Int?
  designatedAuthoriserId String?
  linkedChangeOrderId    String?
  createdAt          DateTime @default(now())
  createdById        String
  updatedAt          DateTime @updatedAt
  updatedById        String?
  archivedAt         DateTime?

  project     Project        @relation(fields: [projectId], references: [id])
  section     JobSection?    @relation(fields: [sectionId], references: [id])
  lines       JobLine[]
  exclusions  JobNote[]      @relation("Exclusions")
  notes       JobNote[]      @relation("Notes")
  variation   JobVariation?
  history     JobHistory[]
  comments    Comment[]
  attachments Attachment[]
  favourites  JobFavourite[]
  locations   GaPin[]
  tasks       ScheduleTask[]
  claims      AfterSalesCase[]
  invoiceLines YardInvoiceLine[]
  challenges  AcceptanceChallenge[]
  @@unique([projectId, code])
  @@index([projectId, status])
}

model JobLine {
  id          String @id @default(cuid())
  jobId       String
  sort        Int    @default(0)
  description String
  quantity    Float  @default(1)
  unit        String @default("UN")
  unitPrice   Float  @default(0)
  total       Float  @default(0)
  job         Job    @relation(fields: [jobId], references: [id], onDelete: Cascade)
}

model JobNote {                       // exclusions and notes share a shape
  id     String @id @default(cuid())
  jobId  String
  kind   String                       // EXCLUSION|NOTE
  sort   Int    @default(0)
  text   String
  jobExclusion Job? @relation("Exclusions", fields: [jobId], references: [id], onDelete: Cascade, map: "jobnote_excl")
  jobNote      Job? @relation("Notes",      fields: [jobId], references: [id], onDelete: Cascade, map: "jobnote_note")
}

model JobVariation {                  // Variation Certificate details
  id                    String  @id @default(cuid())
  jobId                 String  @unique
  dueTo                 String?          // OWNER_REQUEST|YARD_FINDING|CLASS_REQUIREMENT|…
  affecting             String?          // WORKS_SPECIFICATION|DELIVERY_DATE|CONTRACT_PRICE|…
  deliveryAdjustment    String?          // "Within contract period" | "+3 days"
  priceAdjustment       Float?
  invoicingTerms        String?          // JSON: [{pct:50, trigger:"SIGNATURE", date}, {pct:50, trigger:"COMPLETION", date}]
  job                   Job     @relation(fields: [jobId], references: [id], onDelete: Cascade)
}

model JobHistory {                    // mirrors ChangeOrderHistory
  id        String   @id @default(cuid())
  jobId     String
  actorId   String?
  event     String                      // CREATED|QUOTED|CLIENT_ACCEPTED|COUNTERSIGNED|EXPIRED|CANCELLED|PROGRESS|COMPLETED|WORKS_ACCEPTED|DEFICIENCY|…
  fromStatus String?
  toStatus   String?
  details    String?                    // JSON
  createdAt DateTime @default(now())
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
}

model AcceptanceChallenge {           // second-factor for Accept
  id         String   @id @default(cuid())
  jobId      String
  userId     String
  codeHash   String
  channel    String   @default("EMAIL")  // EMAIL|SMS
  quoteHash  String                       // hash of lines+total+variation at time of challenge
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())
  job        Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
}

model JobFavourite {
  userId String
  jobId  String
  createdAt DateTime @default(now())
  job    Job  @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@id([userId, jobId])
}

// ---- After sales ----
model AfterSalesCase {
  id          String   @id @default(cuid())
  projectId   String
  jobId       String?
  kind        String                       // MINOR_DEFICIENCY|WARRANTY_CLAIM
  code        String?                      // yard's claim code if issued
  title       String
  description String
  mitigation  String?                      // "action the crew has taken to restrict further damage"
  status      String   @default("SUBMITTED") // SUBMITTED|REVIEWING|ACCEPTED|REJECTED|IN_PROGRESS|RESOLVED|CLOSED
  submittedAt DateTime @default(now())
  latestUpdateAt DateTime @default(now())  // bumped on any change, per Bridge behaviour
  createdById String
  updatedById String?
  archivedAt  DateTime?
  job         Job?     @relation(fields: [jobId], references: [id])
  comments    Comment[]
  attachments Attachment[]
}

// ---- Yard billing ----
model YardInvoice {
  id          String   @id @default(cuid())
  projectId   String
  number      String
  issuedAt    DateTime
  dueAt       DateTime?
  amountNet   Float
  vatPct      Float    @default(0)
  amountGross Float
  description String?
  kind        String   @default("GLOBAL")   // CONTRACT|VC_SERVICES|GLOBAL|CREDIT_NOTE
  summaryPdfUrl  String?
  detailedPdfUrl String?
  status      String   @default("ISSUED")   // ISSUED|PART_PAID|PAID|DISPUTED|CANCELLED
  createdAt   DateTime @default(now())
  createdById String
  project     Project  @relation(fields: [projectId], references: [id])
  lines       YardInvoiceLine[]
  allocations PaymentAllocation[]
  @@unique([projectId, number])
}

model YardInvoiceLine {
  id        String  @id @default(cuid())
  invoiceId String
  jobId     String?
  description String
  amount    Float
  invoice   YardInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  job       Job?        @relation(fields: [jobId], references: [id])
}

model Payment {
  id          String   @id @default(cuid())
  projectId   String
  reference   String
  paidAt      DateTime
  amount      Float
  payer       String?
  method      String?
  notes       String?
  createdAt   DateTime @default(now())
  createdById String
  project     Project  @relation(fields: [projectId], references: [id])
  allocations PaymentAllocation[]
}

model PaymentAllocation {
  paymentId String
  invoiceId String
  amount    Float
  payment   Payment     @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  invoice   YardInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  @@id([paymentId, invoiceId])
}

// ---- Locations on the GA ----
model GaDeck {
  id        String  @id @default(cuid())
  projectId String
  name      String                         // "Lower Deck"
  imageUrl  String
  width     Int
  height    Int
  sort      Int     @default(0)
  project   Project @relation(fields: [projectId], references: [id])
  pins      GaPin[]
}

model GaPin {
  id        String   @id @default(cuid())
  deckId    String
  jobId     String?
  label     String?                          // free text when no job
  x         Float                            // 0..1 normalised
  y         Float
  colour    String   @default("accent")
  createdAt DateTime @default(now())
  createdById String
  deck      GaDeck   @relation(fields: [deckId], references: [id], onDelete: Cascade)
  job       Job?     @relation(fields: [jobId], references: [id])
}

// ---- Planning ----
model Plan {                          // one Gantt tab: "Dry Dock Works", "Outstanding before departure"
  id        String  @id @default(cuid())
  projectId String
  name      String
  sort      Int     @default(0)
  project   Project @relation(fields: [projectId], references: [id])
  tasks     ScheduleTask[]
}

model ScheduleTask {
  // existing fields, plus:
  planId      String?
  jobId       String?
  parentId    String?                        // tree for the grid
  code        String?                        // "01.", "D.0100.01"
  progressPct Int      @default(0)
  isMilestone Boolean  @default(false)
  sort        Int      @default(0)
  plan        Plan?    @relation(fields: [planId], references: [id])
  job         Job?     @relation(fields: [jobId], references: [id])
  parent      ScheduleTask?  @relation("Tree", fields: [parentId], references: [id])
  children    ScheduleTask[] @relation("Tree")
}

// ---- People & preferences ----
model KeyContact {
  id        String  @id @default(cuid())
  projectId String
  userId    String?                          // when the contact is an OceancOS user
  name      String
  jobTitle  String
  email     String?
  phone     String?
  org       String  @default("YARD")         // YARD|VESSEL|OWNER_OFFICE|CONTRACTOR
  sort      Int     @default(0)
  project   Project @relation(fields: [projectId], references: [id])
}

model NotificationPreference {
  userId         String  @id
  mobile         String?
  emailEnabled   Boolean @default(true)
  smsEnabled     Boolean @default(false)
  onComments     Boolean @default(true)
  onStatusChange Boolean @default(true)
  onAttachments  Boolean @default(false)
  onMinutes      Boolean @default(false)
  startTime      String  @default("08:00")
  endTime        String  @default("18:00")
  days           String  @default("1,2,3,4,5")   // ISO weekday numbers
  timezone       String  @default("Europe/Amsterdam")
  frequency      String  @default("HOURLY")      // IMMEDIATE|HOURLY|DAILY
  projectIds     String?                         // JSON array; null = all
}

model NotificationDelivery {        // outbox for email/SMS batching
  id         String   @id @default(cuid())
  userId     String
  channel    String                            // EMAIL|SMS
  payload    String                            // JSON
  scheduledFor DateTime
  sentAt     DateTime?
  error      String?
  createdAt  DateTime @default(now())
}

model PasswordReset {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
}

// ---- Existing models: changes ----
model Comment {
  // existing, plus:
  kind        String   @default("MESSAGE")   // MESSAGE|MINUTE|SYSTEM
  jobId       String?
  afterSalesCaseId String?
  readBy      CommentRead[]
  attachments Attachment[]
}

model CommentRead {                 // per-user read state feeding the Inbox
  userId    String
  commentId String
  readAt    DateTime @default(now())
  @@id([userId, commentId])
}

model Attachment {
  // existing, plus:
  jobId            String?
  commentId        String?
  afterSalesCaseId String?
  storageKey       String?                    // object key; url becomes derived/signed
}

model Session {
  // existing, plus:
  activeProjectId String?                     // header project selector
}
```

Enum additions in `src/lib/enums.ts`: `JOB_STATUSES`, `CONTRACT_TYPES`, `PRICING_BASES`, `AFTER_SALES_KINDS`,
`AFTER_SALES_STATUSES`, `YARD_INVOICE_KINDS`, `NOTIFY_FREQUENCIES`, and matching entries in `STATUS_TONE`.

Permission additions in `src/lib/rbac.ts`:

```
job.view · job.request · job.issue_quote (yard) · job.accept (client signatory) · job.countersign (yard)
job.cancel · job.progress (yard) · job.complete (yard) · job.works_accept · job.deficiency
after_sales.view · after_sales.create · after_sales.manage (yard)
yard_invoice.view · yard_invoice.manage (yard/finance) · payment.record (finance)
minutes.view · minutes.record · location.view · location.edit · plan.view · plan.edit
contact.manage · notification.prefs
```

Role matrix changes: `CAPTAIN`, `OWNERS_REP`, `PROJECT_MANAGER` get `job.accept` (designated authorisers);
`YARD_PM` gets issue/countersign/progress/complete/after_sales.manage/plan.edit; `FINANCE` gets yard invoice and
payment; `CREW` gets `job.view`, `job.request`, `minutes.view`; `OWNER` read-only across the module.

---

## 5. Job state machine (server-enforced, same pattern as `transitionChangeOrder`)

| From | To | Who | Side effects |
|---|---|---|---|
| — | NEW_REQUEST | `job.request` | history CREATED; notify yard PM |
| NEW_REQUEST | QUOTE_SENT | `job.issue_quote` | set quoteDeliveredAt, validityDays, expiresAt; SYSTEM comment "Quote delivered"; notify designated authoriser + followers |
| QUOTE_SENT | EXPIRED | cron | label only; Accept still allowed |
| QUOTE_SENT / EXPIRED | CLIENT_ACCEPTED | `job.accept` + challenge verified + (optional) linked CO fully APPROVED | store clientAcceptedAt/By, quoteHash; SYSTEM comment "Client Action – Accepted Quote"; notify yard PM to countersign |
| QUOTE_SENT / EXPIRED | CANCELLED_QUOTE | `job.cancel` (client) or `job.issue_quote` (yard) | reason required |
| CLIENT_ACCEPTED | ACCEPTED | `job.countersign` | yardAcceptedAt/By; push `total` into `Budget.approvedChanges` of linked category; notify authoriser |
| ACCEPTED | CANCELLED_WORKS | `job.cancel` | reason required; reverse budget effect |
| ACCEPTED | ACCEPTED (progress) | `job.progress` | progressPct update, history PROGRESS |
| ACCEPTED | YARD_COMPLETED | `job.complete` | yardCompletedAt; notify authoriser: "Works Accepted" / "Minor Deficiency" buttons appear |
| YARD_COMPLETED | WORKS_ACCEPTED | `job.works_accept` | worksAcceptedAt = warranty start; SYSTEM comment |
| YARD_COMPLETED | MINOR_DEFICIENCY | `job.deficiency` | creates `AfterSalesCase(kind=MINOR_DEFICIENCY)`; notify yard after-sales + PM |
| MINOR_DEFICIENCY | WORKS_ACCEPTED | `job.works_accept` | when the case resolves |
| WORKS_ACCEPTED | CLOSED | PM | invoiced and paid |

Illegal transitions throw, exactly like the CO action does today.

---

## 6. Phased build plan

Each phase ends with: schema migrated, seed extended, `npm run typecheck` clean, `npm run qa` extended, and a
short manual QA checklist in `QA_TEST_REPORT.md`. Sizes are relative (S ≈ a day, M ≈ 2–4 days, L ≈ a week+).

### Phase 0 — Foundation (must precede everything)  · size M

**Status: complete apart from 0.4's admin form.** Every other step is built and verified. See §9.

| # | Step | Files | Done when |
|---|---|---|---|
| 0.1 ✅ | Toolchain is verified (see §8). Add a CI workflow running `npm ci`, `prisma generate`, `tsc`, `next build`, `qa`; bump `next` to a patched 14.2.x. | `.github/workflows/ci.yml`, `package.json` | CI green on the branch |
| 0.2 ✅ | Add Vitest for server actions + Playwright for the two golden flows (login, accept a quote). | `vitest.config.ts`, `tests/` | `npm test` exists and runs in CI |
| 0.3 ✅ | Project context: `Session.activeProjectId`, `getActiveProject()` in `lib/auth.ts`, `<ProjectSwitcher>` in `TopBar`, `setActiveProject` server action. | `src/lib/auth.ts`, `src/components/layout/TopBar.tsx`, `src/app/(app)/_actions.ts` | Switching project changes what every yard-module page shows |
| 0.4 ◑ | Project dates and code on `Project` (arrival, haul out, sea trials, departure, currency, yard name). Admin form to edit. | `prisma/schema.prisma`, `src/app/(app)/admin/projects/` | Seeded project has all four dates |
| 0.5 ✅ | File storage: `lib/storage.ts` with S3-compatible driver + local driver; `POST /api/uploads/sign` returns a signed PUT URL; `Attachment.storageKey`; `<FileDrop>` client component (drag-and-drop, 10 MB cap, image/PDF/video). | `src/lib/storage.ts`, `src/app/api/uploads/`, `src/components/ui/FileDrop.tsx` | Upload from a form, download via signed GET |
| 0.6 ✅ | Email transport for real: nodemailer behind `lib/email.ts`; dev uses a console/Mailpit driver. Password reset flow (`/forgot`, `/reset/[token]`). | `src/lib/email.ts`, `src/app/(auth)/…` | Reset email arrives in Mailpit; login works with new password |
| 0.7 ✅ | Chart primitive: pick one lightweight library (Recharts is fine) and wrap `Donut`, `DoubleRing`, `StepArea` in `components/charts/` using the design tokens. | `src/components/charts/` | Three charts render with seeded data |
| 0.8 ✅ | Export primitives: `lib/export/pdf.ts` (React-PDF or Playwright print-to-PDF) and `lib/export/xlsx.ts` (SheetJS). | `src/lib/export/` | A trivial PDF and XLSX download route works |

### Phase 1 — Jobs & Quotes core  · size L

| # | Step | Done when |
|---|---|---|
| 1.1 | Schema: `JobSection`, `Job`, `JobLine`, `JobNote`, `JobVariation`, `JobHistory`, `JobFavourite`; `Comment`/`Attachment` job links. Seed 3 sections and ~15 jobs across all statuses using real-looking MB92 codes. | Migration applied, seed runs |
| 1.2 | Enums + permissions + role matrix (see §4). | `qa.ts` asserts new role-permission links |
| 1.3 | `/jobs` list with The Bridge's sub-views as URL filters: `?view=requests|purchases|accepted|pending|cancelled-works|cancelled-quotes`. Section tabs across the top (Dry Dock · Interior · … · Client Reference). Group rows by `groupCode` with a section total and a section progress bar. Sortable columns: Quote, Price, Delivered. Search box. Expand row → Details / Favourite buttons + comment thread inline (matches p16/p18). | Every sub-view renders the seeded jobs correctly |
| 1.4 | `/jobs/[id]` detail (also opened as a modal from the list): header with code, title, tags (contract type, pricing basis, status, progress), line-item table with total, Exclusions, Notes, Variation Certificate details block, validity badge (with "Expired" tone), digital-acceptance cards, Print button. Reuse `SectionCard` + `DefGrid`. | Matches p17/p19 content |
| 1.5 | "Create New Quote Request" form (modal): client job reference, title, description, designated authoriser (select from users holding `job.accept` on this project), attachments via `FileDrop`. Creates `Job(status=NEW_REQUEST)`. | Request appears under New Quotes; yard PM notified |
| 1.6 | Yard-side "Issue quote" form (role-gated): lines, exclusions, notes, VC details, validity days, contract type, pricing basis. Transitions to QUOTE_SENT. Also an "Import quotes from XLSX" action using the worklist column layout. | Yard user can price a request; import of 10 rows works |
| 1.7 | Comments on job: message vs **Record minutes** (Send dropdown, per p18), attachments saved as Media, SYSTEM comments for lifecycle events. Media strip on the job. | Thread shows messages, minutes badge, files |
| 1.8 | Favourites: star toggle on list and detail; `/favourites` page; star icon on rows. | Per-user, persisted |
| 1.9 | Link a job to a change order (optional select on request form; back-link on CO detail). | CO detail lists its jobs |

### Phase 2 — Acceptance workflow  · size M

| # | Step | Done when |
|---|---|---|
| 2.1 | `acceptJob` server action in three steps: (a) click Accept → confirmation modal summarising total, terms, validity; (b) confirm → create `AcceptanceChallenge`, email 6-digit code; (c) enter code → verify, transition to CLIENT_ACCEPTED, write audit with IP/UA/quoteHash. Reject path with reason. | Playwright golden flow passes |
| 2.2 | Optional governance gate: if `Job.linkedChangeOrderId` is set, Accept is disabled until the CO is APPROVED; shows which stage is outstanding. Project-level setting `requireInternalApprovalAbove` (amount). | Gate blocks and explains |
| 2.3 | Countersign action for `job.countersign`; digital-acceptance cards show both signatures. | Both cards render |
| 2.4 | Expiry: nightly cron (`scripts/cron.ts`, run by the host scheduler) flips QUOTE_SENT past `expiresAt` to EXPIRED; hover on the VC tag shows delivered date and valid days (p20). | Seeded expired job shows label |
| 2.5 | Cancel quote / cancel works with reason; budget reversal. | Both paths audited |
| 2.6 | Notifications for every transition using `notify()`; add `NotifyKind`s `QUOTE_SENT`, `ACCEPT_REQUIRED`, `COUNTERSIGN_REQUIRED`, `QUOTE_EXPIRING`, `WORKS_COMPLETED`. | Inbox shows them (Phase 3) |

### Phase 3 — Inbox  · size M

| # | Step | Done when |
|---|---|---|
| 3.1 | `CommentRead` table; `Notification` gets `category` (COMMENT|ACTION|ATTACHMENT|MINUTE). | Migration |
| 3.2 | `/inbox` replaces `/notifications`: four tabs with `unread / total` badges, left rail filters (Unread, 7 days, 30 days, All), search, sortable columns From / Subject / Tags / Date, unread in bold, inline preview with **Open**. "Mark comments read" button. | Matches p10 |
| 3.3 | Sidebar and TopBar badges: red dot on Inbox, Jobs and Yard Invoices when there is anything unread in that area. | Dots clear on read |

### Phase 4 — Yard Home  · size M

| # | Step | Done when |
|---|---|---|
| 4.1 | `/yard` page (default landing when a project is active). Top row: Arrival, Haul-out, Sea trials, Departure date cards. | Dates from `Project` |
| 4.2 | Money cards: Total Accepted (split Contract / VC / Services) and Pending (with Cancelled Works / Cancelled Quotes). | Sums match seed |
| 4.3 | Timing cards: Started N days ago · Finish in N days · Onsite for N days. | Correct on seed |
| 4.4 | Quotation Statuses donut; Project Progress double ring with **Work %** and **Time %** using the §1.4 formulas; a `lib/metrics/project.ts` with unit tests for both. | Tests pass |
| 4.5 | Feeds: Recent Media (files → job), Recent Messages, Recent Minutes, Recent Locations (mini-maps). | Each links through |
| 4.6 | Charts: Quotation History (cumulative pending vs accepted €, step-area), Invoices vs Payments (cumulative). | Render from history rows |
| 4.7 | Keep the existing `/dashboard` as the cross-project owner view; link the two. | Nav has both |

### Phase 5 — Completion and After Sales  · size M

| # | Step | Done when |
|---|---|---|
| 5.1 | Yard progress % and "Mark completed" actions; progress bar on rows and section header. | YARD_COMPLETED reachable |
| 5.2 | Client post-completion buttons on job detail: **Works Accepted** (warranty start, SYSTEM comment) and **Minor Deficiency** (opens case form). | p19 behaviour |
| 5.3 | `AfterSalesCase` schema; `/after-sales` with tabs Minor deficiencies · Warranty claims; table Status / Code / Title / Latest update / Created; expand for thread. "Create new warranty report" form: job code (validated), title, description, mitigation, attachments. `latestUpdateAt` bumps on any change. | p23 behaviour |
| 5.4 | Auto-notify yard after-sales contact (KeyContact with role AFTER_SALES) and PM on submission. | Notification rows exist |
| 5.5 | Warranty view on job: warranty start/end derived from `worksAcceptedAt + warrantyMonths`; expiring-warranty notification. | Shown on detail |

### Phase 6 — Yard Invoices, Payments, Account Statement  · size M

| # | Step | Done when |
|---|---|---|
| 6.1 | Schema `YardInvoice`, `YardInvoiceLine`, `Payment`, `PaymentAllocation`. Seed 6 invoices, 3 payments. | Migration |
| 6.2 | `/yard-invoices` tabs: Invoices (date, no., amount, VAT, description, Summary / Detailed / Spreadsheet buttons), Payments, Account Statement (reference, date, type, description, amount; totals card Invoices / Payments / **Outstanding**). | p25–p27 |
| 6.3 | Summary PDF and Detailed PDF generators (detailed = lines with job description, notes, exclusions); XLSX of the summary. | Downloads open |
| 6.4 | Finance role can record payments and allocate to invoices; status auto-updates (PART_PAID/PAID). | Outstanding recalculates |
| 6.5 | Reconcile with existing `Budget.actual` (accepted → committed; invoiced → actual). Keep the supplier-side `Invoice` model as is; rename its nav label to "Supplier invoices". | Financials page reflects yard billing |

### Phase 7 — Minutes  · size S

| # | Step | Done when |
|---|---|---|
| 7.1 | `/minutes`: search, date start/end, grouped by job (Job · Latest · Records), expand to entries (author, timestamp, text). Minutes filter on the job thread. Recent Minutes on Home. Three places, as the manual says. | p29 |
| 7.2 | Bridge existing `Meeting` records: "Publish minutes to jobs" action that fans a meeting's minutes out as MINUTE comments on the jobs it references. | Works on seed |

### Phase 8 — Locations on the GA  · size M

| # | Step | Done when |
|---|---|---|
| 8.1 | `GaDeck` (image per deck, admin upload) and `GaPin` schema. | Migration |
| 8.2 | `/locations`: deck images stacked, pan/zoom (CSS transform, no heavy lib), click to place a pin → popover "Enter job code" (typeahead on `Job.code`) → Create marker. Pins colour by job status; hover shows code + title; click opens job. | p31 |
| 8.3 | Mini-map on job detail and Recent Locations on Home (cropped around the pin). | Renders |

### Phase 9 — Planning (Gantt)  · size L

| # | Step | Done when |
|---|---|---|
| 9.1 | `Plan` + `ScheduleTask` tree fields; seed one plan with ~40 tasks under 4 job groups and 6 milestones. | Migration |
| 9.2 | `/planning`: tab per plan; toolbar (wide-screen toggle, zoom in/out, print, date start/end); left tree grid (Description, Start, Due, %) with collapse; right SVG Gantt with bars coloured by status, milestone diamonds, dependency arrows, today line, month/week header. Custom SVG, no external Gantt library (keeps bundle and theming under control). | p33 |
| 9.3 | Search box highlights matching rows and bars (p34). | Works |
| 9.4 | Yard users edit dates/progress inline; client read-only. Link a task to a job → job progress derives from its tasks when the yard hasn't set it directly. | Edits persist |

### Phase 10 — Worklist and exports  · size S

| # | Step | Done when |
|---|---|---|
| 10.1 | `/jobs/worklist`: flat table Job No · Yacht ref · Title · Status · % · Requested · VC Delivered · Accepted/Cancelled · Total · Contract · Type, grouped by groupCode. Job No opens the quote in a new tab. Hover on "Variation Certificate" shows delivered date + valid days. | p20 |
| 10.2 | **Print All** (one PDF of all quotes in the current view) and **Spreadsheet** (XLSX) using Phase 0.8 primitives. Per-quote Print from detail. | Files download |

### Phase 11 — Contacts, Forms, Profile & Notification settings  · size M

| # | Step | Done when |
|---|---|---|
| 11.1 | `/key-contacts`: cards (avatar, job title, name, tel, email) from `KeyContact`; admin edit; tag which contact is PM and After Sales (used by Phase 5.4). | p40 |
| 11.2 | `/forms`: configurable list of links per project (`Setting` rows or a small `ProjectLink` table) with a feedback mailto. | p38 |
| 11.3 | `/profile`: name, mobile, password change, and **Notifications** section exactly as p42: How (email/SMS), What, When (start/end, weekdays, timezone), Frequency, Projects. | Preferences persist |
| 11.4 | Delivery engine: `notify()` writes `NotificationDelivery` rows honouring preferences; `scripts/cron.ts` sends immediate/hourly/daily batches via email (SMS behind a `SMS_PROVIDER` env, Twilio-shaped). | Mailpit shows a digest |

### Phase 12 — Beyond The Bridge (OceancOS advantages)  · ongoing

Only after Phases 0–11. Ranked by value to the owner's team:

1. **Governance gate on Accept** (Phase 2.2) — The Bridge lets any authoriser sign; OceancOS can require the internal CO chain first, with a value threshold.
2. **Multi-yard, multi-project portfolio view** — the existing `/dashboard` becomes the fleet view; Yard Home is per project.
3. **Budget linkage** — accepted jobs move `pendingChanges → approvedChanges`; invoices move `committed → actual`. The Bridge has no budget concept at all.
4. **Crew request → client request pipeline** — a `CrewRequest` can be promoted to a `Job` request with one click, carrying attachments and the vessel area.
5. **Quote import** (XLSX/CSV, later yard API) so OceancOS works with yards that have their own portal.
6. **Variance and history analytics** — spend by section, VC count vs contract, expiry rate, time-to-accept per authoriser.
7. **Warranty register across projects** — every `worksAcceptedAt` feeds a fleet-wide warranty expiry list.
8. **Mobile-first pass** on the job thread and the accept flow (captains sign on a phone).

---

## 7. Decisions

**Still open — these gate Phase 1 design.**

1. **Positioning** — confirm §3.1: vessel-side system with a role-gated yard side. (Alternative: build it purely as a yard product; that changes who creates quotes and removes the CO gate.)
2. **Code system** — adopt the MB92-style `X.NNNN.NN` codes as the default, configurable per project? Or a simpler `SECTION-###` scheme?
3. **Second factor for Accept** — email code (no new vendor) or SMS from day one (needs Twilio or similar)?
4. **Storage provider** — ✅ **Cloudflare R2**, decided 2026-09-20. S3-compatible, no egress fees. The driver is provider-agnostic, so AWS S3 or MinIO need only different env values.
5. **PDF strategy** — ✅ **Playwright print-to-PDF**, decided 2026-09-20. The PDF renders the real quote page, so there is no second layout to drift. Playwright is already a dependency. The production image needs Chromium.
6. **Database** — move to Postgres in Phase 0 rather than later? Multi-tenant is out of scope here, but the JSON-in-string columns (`invoicingTerms`, `projectIds`) would be proper `Json` columns on Postgres.
7. **Design tokens** — ✅ **Keep the OceancOS `ink/line/accent/marine` system**, decided 2026-09-20. No restyling of what is already built; charts inherit today's palette. Aligning to STORM stays open as a later, separate piece of work.

---

## 8. Toolchain check performed during this planning pass

Run on 2026-09-18 from a clean clone of `claude/charming-bell-36iht1` (identical to `main` at `d208e79`):

| Step | Result |
|---|---|
| `npm ci` | OK — 122 packages. npm warns that `next@14.2.15` has a published security vulnerability; upgrade to a patched 14.2.x is a Phase 0 item. |
| `npx prisma generate` | OK — Prisma Client 5.22.0 |
| `npm run typecheck` (`tsc --noEmit`) | OK — no errors |
| `npm run build` (`next build`) | OK — 24 routes, 87 kB shared first-load JS |
| `npx prisma db push` + `npm run db:seed` | OK — SQLite dev DB created, seed completes |
| `npm run qa` | OK — 11 checks passed, 0 failed |

So the "toolchain never executed" caveat in `QA_TEST_REPORT.md` is now closed: the codebase compiles, builds, seeds and passes its scripted QA.
Phase 0.1 becomes "wire these four commands into CI and bump Next.js", not "find out whether it builds".

---

## 9. Progress log

### 2026-09-19 — Phase 0.1 to 0.3 complete, 0.4 partial

Built on branch `claude/charming-bell-36iht1`, after PR #2 (the plan itself) merged.

**0.1 Toolchain and CI**
- `next` upgraded 14.2.15 → 14.2.35, closing the published security advisory npm flagged.
- `.github/workflows/ci.yml` added: a `verify` job (install, Prisma generate, typecheck, unit
  tests, build, db push, seed, scripted QA) and an `e2e` job (Playwright against a built app,
  report uploaded on failure).

**0.2 Test harness**
- Vitest added with a `@` path alias. `npm test` runs it; `npm run test:watch` for development.
- Playwright added with `npm run test:e2e`. The config falls back to a provisioned Chromium via
  `PLAYWRIGHT_CHROMIUM_PATH` so sandboxes without a matching browser download still run.
- **49 unit tests** across three files, all passing:
  - `tests/changeOrderWorkflow.test.ts` — the state machine: every status mapped, no self-edges,
    terminal statuses sealed, the happy path legal, closed orders cannot reopen, review cannot be
    skipped, and the UI never offers a button for a transition the server would reject.
  - `tests/projectMetrics.test.ts` — the two Bridge formulas, including clamping after an overrun,
    nulls for missing dates, and value-weighting that a €0 job cannot distort.
  - `tests/rbac.test.ts` — the role matrix: no unknown or duplicate grants, crew cannot see money,
    the auditor is read-only, confidential documents reach only three roles, every approval stage
    has a holder, and no single role can rubber-stamp the whole chain.
- **6 end-to-end tests** in `e2e/shell.spec.ts`, all passing in a real browser: anonymous redirect,
  wrong password rejected, sign in and out, the project switcher, and financials hidden from crew
  but shown to a project manager.

**Refactor that came with the tests.** The change-order transition rules existed twice — in the
server action and again in the detail page — and the two copies disagreed: the server accepted
`SUBMITTED → CANCELLED` and `IN_PROGRESS → CANCELLED`, but the page offered no button for either.
Both now read `src/lib/workflow/changeOrder.ts`, which owns the legal-transition map, the
stage→permission map (previously duplicated a third time) and the buttons the UI offers. The
practical change for users: Cancel now appears wherever the server already allowed it. This module
is the template the Job state machine follows in Phase 1.

**0.3 Project context**
- `Session.activeProjectId` added, so the selection survives navigation and reloads without client
  state, and is scoped to the session rather than shared across a user's devices.
- `src/lib/project.ts`: `listProjectsForUser` (respects per-project and per-vessel role scoping, and
  returns nothing rather than everything for a scoped user with no assignment), `getActiveProject`
  (falls back when the stored project is no longer reachable) and `storeActiveProject` (refuses a
  project the user cannot reach).
- `<ProjectSwitcher>` in the top bar: a form posting to a server action, submitting on change, with
  a static label when the user has only one project.

**0.4 Project fields (partial)**
- `Project` gained `code`, `yardName`, `arrivalDate`, `haulOutDate`, `seaTrialsDate`,
  `departureDate` and `currency`. Seed sets a full yard period for `R-00721` and adds a second
  vessel and project, `R-00806`, so the switcher has something to switch between.
- **Outstanding:** the admin form to edit these. They are currently seed- or database-only.

**QA**: `npm run qa` grew from 11 to 17 checks, adding project-code uniqueness, presence of a yard
period, and ordering of arrival, haul out and departure.

**Verified before commit**: `tsc --noEmit` clean, 49 unit tests pass, `next build` succeeds across
24 routes, seed runs, 17 QA checks pass, 6 end-to-end tests pass.

**Still blocking Phase 1**: the seven decisions in §7. Storage provider (4) and PDF strategy (5)
block Phase 0.5 and 0.8 specifically; the rest block Phase 1 design choices.

### 2026-09-20 — Decisions taken, Phase 0.5 complete

**Decisions.** Storage is Cloudflare R2, PDFs are Playwright print-to-PDF, and the design system stays on
the existing OceancOS tokens. Recorded against §7 items 4, 5 and 7. Items 1, 2, 3 and 6 remain open and
gate Phase 1.

**0.5 File storage**
- `src/lib/storage/` with two drivers behind one interface: `s3` for any S3-compatible service (R2 is the
  configured provider; AWS S3 and MinIO differ only in env values) and `local`, which writes under
  `./uploads` so development and CI run with no cloud credentials.
- Uploads are presigned, so the browser sends files straight to storage and large drawings never pass
  through the Next.js server.
- `POST /api/uploads/sign` is where every authorisation decision lives: signed-in session, access to the
  named project, content-type allowlist and size ceiling. It refuses anonymous callers with 401, a
  disallowed type with 415, an oversized file with 413 and an unreachable project with 403.
- `src/lib/storage/keys.ts` holds the key rules as pure functions. Keys are namespaced
  `projects/<id>/<resource>/<id>/<random>-<safe-filename>` so a project's media can be listed or expired as
  a unit, and a random segment stops one upload overwriting another of the same name. Hostile filenames and
  identifiers cannot escape the prefix.
- `Attachment.storageKey` added; `url` becomes optional so externally hosted records still validate.
- `<FileDrop>` client component: drag-and-drop, per-file progress and errors, a size cap, and hidden inputs
  so a surrounding server-action form receives the uploaded keys without a client state library. It is
  wired into forms as Phase 1 builds them.
- `.env.example` documents every storage variable, including the R2 endpoint shape.

**Tests.** 18 new unit tests on the key rules (traversal, hostile filenames, long names, the type
allowlist) and 5 new end-to-end tests that round-trip a real file through sign, PUT and GET, plus the
401/415/403 refusals and a forged local-upload token. Totals are now **67 unit** and **11 end-to-end**.

**Verified**: `tsc --noEmit` clean, 67 unit tests pass, build succeeds with both new routes, 11 end-to-end
tests pass.

**Next**: 0.6 email and password reset, 0.7 charts, 0.8 PDF and XLSX export.

### 2026-09-20 — Phase 0.6 complete: email and password reset

The Bridge onboards every user through "Forgot password?", so this is a primary path rather than plumbing.

**Email transport** (`src/lib/email.ts`, replacing the stub)
- `smtp` via nodemailer when `SMTP_HOST` is set; otherwise `outbox`, which writes each message as JSON
  under `./.mail` and logs a line. Development, CI and the end-to-end tests therefore exercise the same
  code path as production without a mail server, and the tests can read what was actually sent.
- Every send is best-effort and returns `{ delivered, transport, error }`. A mail failure never rolls back
  the action that triggered it, which matters because `notify()` sends inside server actions.

**Password reset**
- `PasswordReset` model storing only a SHA-256 hash of the token, so a database leak yields no usable links.
  Single use, expires in an hour.
- `/forgot` returns the same confirmation whether or not the address is registered, so an anonymous visitor
  cannot enumerate the crew list. Requesting a new link supersedes any outstanding one.
- `/reset/[token]` validates the token, then on success updates the password, marks the token spent and
  **deletes every session for that user** in one transaction: if the password was reset because it leaked,
  the leaked session goes too.
- Password rule is length-based (10 characters minimum) rather than character classes. Crew set these on
  phones, and a passphrase beats a short complex string.
- Login gains the "Forgot password?" link where The Bridge puts it, and a confirmation banner after a reset.

**Tests.** 19 new unit tests covering token generation, hashing, expiry boundaries, single use, and the
password rules including the ordering of mismatch before length. 6 new end-to-end tests drive the real
journey: the identical answer for an unknown address with nothing sent, reachability from the sign-in
screen, a made-up token, a mismatch, a superseded link, and the full reset ending with the new password
working, the old one failing, and the link refusing a second use. Totals are now **86 unit** and
**17 end-to-end**.

Two failures were found while writing these and both were faults in the tests, not the app: an
over-broad `getByRole("alert")` that also matched the Next.js route announcer, and tests that depended on
each other's email. Each test now requests its own reset and polls for the message.

**Verified**: `tsc --noEmit` clean, 86 unit tests pass, build succeeds with both new routes, 17 end-to-end
tests pass.

**Next**: 0.7 charts on the existing tokens, 0.8 Playwright print-to-PDF and XLSX export.

### 2026-09-20 — Phase 0.7 complete: charts

Built as inline SVG rather than Recharts. These three forms are arcs and step paths, so a charting
library would add bundle weight and fight the mark specs (2px surface gaps, surface-ringed markers,
a crosshair that reports the *held* value) rather than help. The geometry lives in
`src/lib/charts/geometry.ts` as pure functions and is unit-tested on its own.

**The palette was computed, not chosen.** Running the colour validator against the OceancOS tokens
changed the design twice:

1. The obvious pairing of `warn` amber with `ok` green **fails** colour-vision separation at ΔE 5.7
   under protanopia. A red-green colourblind reader could not reliably tell pending from accepted.
   Stepping green down to a deep emerald clears it at ΔE 11.0.
2. Cyan `marine` against blue `accent` **fails** even the normal-vision floor, at ΔE 7.9. Work and
   time progress therefore use emphasis — work in the accent hue, time in a recessive neutral —
   which is also the more honest form, since time is the benchmark work is measured against rather
   than a peer series.

The UI tokens are also too light for chart fills on the dark surface (`warn` sits at OKLCH L 0.769,
`ok` at 0.723, both outside the 0.48–0.67 band), so each hue is held and stepped down for chart use.
Every verdict is recorded in `src/components/charts/palette.ts` with the command to re-run.

**Components** (`src/components/charts/`)
- `Donut` — part-to-whole with a centre figure. Slices past a cap fold into "Other" rather than
  taking new hues. Separation is a gap in the surface colour, never a stroke.
- `ProgressRings` — work against time as two concentric meters, plus a plain-language reading of
  whether the project is ahead of or behind the clock.
- `StepArea` — cumulative value over time. Steps rather than a smooth line, because cumulative money
  changes on the day it changes and holds flat between; a smooth line would invent movement. One
  shared y-axis, a crosshair reporting the held value, and a table view so nothing is gated behind
  hovering.

**Wired to real data** on the dashboard: change orders by status, progress against the yard period,
and cumulative change-order value split by whether the money is still a proposal. The value chart is
gated on the financial permission. The seed grew from one change order to eleven spread across the
yard period, which also gives the list filters and the approvals queue something realistic.

**Four defects were found by rendering it and looking**, which no type check would have caught:
- A function passed from a server component to a client component crashed the page at runtime.
  Formatting now travels as a serialisable descriptor.
- The approved series stopped mid-chart instead of holding flat to the right edge, reading as missing
  data rather than a plateau.
- The top gridline rendered off-canvas above the plot. The axis now ends on a labelled tick.
- A fixed pixel height with a viewBox made the plot scale to fit both axes and sit centred, leaving
  wide gutters. It now scales uniformly to the container width.

Two unit tests also caught real bugs in the tick algorithm: it skipped the natural 25-step, and the
axis could stop below the data.

**Tests**: 33 new unit tests on the chart geometry and 2 new end-to-end tests. Totals are now
**119 unit** and **19 end-to-end**.

**Verified**: `tsc --noEmit` clean, 119 unit tests pass, build succeeds, 19 end-to-end tests pass,
and the rendered dashboard was inspected as a screenshot.

**Next**: 0.8, Playwright print-to-PDF and XLSX export — the last Phase 0 item.

### 2026-09-20 — Phase 0.8 complete: exports. Phase 0 closed.

**PDF** (`src/lib/export/pdf.ts`). Per §7 item 5, the PDF is the real page printed rather than a second
layout, so a change order cannot drift between what the client reads on screen and what they file, and
there is one template to maintain. `/print/change-orders/[id]` is that page, deliberately ink-on-paper
rather than the app's dark theme: a dark page wastes toner and reads badly once filed.

- The renderer carries the caller's own session cookie, so it can never see more than the caller would.
- One browser per process, reused across requests, since launching Chromium costs about a second.
- A host with no browser gets a plain 503 naming the two environment variables that fix it, not a stack
  trace from inside Playwright.
- `playwright-core` and `exceljs` are marked as server-external in `next.config.js`. Webpack otherwise
  tries to bundle Playwright's optional native modules and the build fails.

**Spreadsheet** (`src/lib/export/xlsx.ts`, `src/lib/export/table.ts`). The Bridge offers a spreadsheet
beside every list because the client's finance team works in Excel. Values are written **typed**, with
number formats applied, so the recipient can sum and pivot them rather than receiving pre-formatted
strings Excel cannot add up. Header row frozen, auto-filter on, totals where they make sense.

The rows and columns of an export are decided in `table.ts` as pure data, so what a spreadsheet contains
is testable without building a workbook. CSV comes free from the same shape.

**Permissions hold through the export.** Cost columns are dropped for a user without financial access,
and a user who cannot view change orders is refused outright, so an export can never become a way around
the permission model. A test asserts both.

**Reachable from the UI**: a Spreadsheet button on the change-order list and a PDF button on the detail
page.

**Tests**: 20 new unit tests on the export shapes, escaping and filenames, and 5 new end-to-end tests
that download a real workbook (checked for the zip signature), verify the print view, and confirm the
PDF route returns a genuine `%PDF-` document — 40KB in practice — or says clearly that the host has no
browser. CI now resolves Chromium's path so the PDF branch is exercised there too.

Totals are now **139 unit** and **24 end-to-end**.

**Verified**: `tsc --noEmit` clean, 139 unit tests pass, build succeeds with all three new routes, 24
end-to-end tests pass, and a real PDF was produced and inspected.

---

## Phase 0 is closed

| Step | State |
|---|---|
| 0.1 CI and the Next.js security bump | Done |
| 0.2 Vitest and Playwright | Done |
| 0.3 Project context and switcher | Done |
| 0.4 Project yard-period fields | Schema, seed and metrics done; **admin form outstanding** |
| 0.5 File storage on R2 | Done |
| 0.6 Email and password reset | Done |
| 0.7 Charts | Done |
| 0.8 PDF and spreadsheet export | Done |

The project began this work with no tests, no CI, an unpatched security advisory and a toolchain that had
never been run. It now has 139 unit tests, 24 end-to-end tests and a green pipeline.

**Phase 1 is blocked on §7 items 1, 2, 3 and 6**: positioning, the job code scheme, the second factor on
Accept, and whether to move to Postgres now.
