// The demo workspace: fictional walkthrough data, parked on Draak.
//
// The seed has always shipped a worked example — a yard period with change
// orders, crew requests, quotes, budgets, milestones, risks and inventory —
// so every screen has something to show. It used to sit on two invented
// vessels, M/Y Solstice and M/Y Northern Light, indistinguishable from real
// records. It now sits on Draak (Y709), the one vessel whose real history the
// walkthrough can sit beside without being mistaken for it, and every project
// in it carries `isDemo`. projectScope() keeps it out of real vessels' lists
// and totals; the banner and badges say what it is wherever it is shown.
//
// The dates keep the walkthrough live: p1 arrives after Draak's real
// rebuild was delivered (June 2026) and is in progress through the winter;
// p2 is booked for 2027. p1's arrival also bounds the seeded change orders and
// quotes, which are dated up to ~80 days after it, so they stay in the past.

export const DEMO_VESSEL_YARD_NUMBER = "Y709";

/** The invented vessels the demo used to sit on, removed once it has moved. */
export const FICTIONAL_VESSELS = [
  { id: "v1", name: "M/Y Solstice" },
  { id: "v2", name: "M/Y Northern Light" },
] as const;

export type DemoProject = {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "PLANNED";
  yardName: string;
  arrivalDate: Date;
  haulOutDate: Date;
  seaTrialsDate: Date | null;
  departureDate: Date;
};

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The main walkthrough project, in progress. Its id is fixed: tests and QA use it. */
export const DEMO_PRIMARY: DemoProject = {
  id: "p1",
  code: "DEMO-01",
  name: "Demo — Draak winter refit 2026/27",
  status: "ACTIVE",
  yardName: "MB92 La Ciotat",
  arrivalDate: d("2026-07-06"),
  haulOutDate: d("2026-07-13"),
  seaTrialsDate: d("2027-02-08"),
  departureDate: d("2027-02-26"),
};

/** A second, booked project, so the switcher and project scoping have two to tell apart. */
export const DEMO_SECONDARY: DemoProject = {
  id: "p2",
  code: "DEMO-02",
  name: "Demo — 2027 maintenance period",
  status: "PLANNED",
  yardName: "Amico & Co",
  arrivalDate: d("2027-05-03"),
  haulOutDate: d("2027-05-10"),
  seaTrialsDate: null,
  departureDate: d("2027-07-30"),
};

export const DEMO_PROJECTS = [DEMO_PRIMARY, DEMO_SECONDARY] as const;

/** The primary project's milestones, matched by name. */
export const DEMO_MILESTONES: { name: string; type: string; date: Date }[] = [
  { name: "Yard arrival", type: "YARD_PERIOD", date: DEMO_PRIMARY.arrivalDate },
  { name: "Class inspection", type: "CLASS_INSPECTION", date: d("2026-11-16") },
  { name: "Sea trials", type: "SEA_TRIAL", date: d("2027-02-08") },
  { name: "Delivery", type: "DELIVERY", date: DEMO_PRIMARY.departureDate },
];

/** The primary project's vessel areas. */
export const DEMO_AREAS = [
  "Owner's Suite",
  "Bridge",
  "Engine Room",
  "Tender Garage",
  "Galley",
  "Sundeck",
];

/**
 * How far after arrival the seed dates anything. Change orders go up to 76
 * days and quotes (request, delivery, acceptance, completion, expiry) up to
 * about 70; a timestamp inside [arrival, arrival + this) on a demo record was
 * written by the seed, because anything a person did happened at the real
 * time they did it, after the seed ran.
 */
export const SEED_WINDOW_DAYS = 120;

/**
 * Seeded titles that named the invented vessels, and what they read now.
 * Matched on the whole title, so an edited title is left alone.
 */
export const RENAMED_TITLES: { from: string; to: string }[] = [
  {
    from: "Northern Light galley refrigeration replacement",
    to: "Crew galley refrigeration replacement",
  },
];
