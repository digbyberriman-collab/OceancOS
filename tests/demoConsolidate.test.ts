import { describe, it, expect } from "vitest";
import {
  DEMO_AREAS,
  DEMO_MILESTONES,
  DEMO_PRIMARY,
  DEMO_PROJECTS,
  DEMO_SECONDARY,
  DEMO_VESSEL_YARD_NUMBER,
  SEED_WINDOW_DAYS,
} from "@/lib/demo/data";
import { fictionalVesselBlocker, isNoChange, planDateShift } from "@/lib/demo/consolidate";

const DAY = 24 * 60 * 60 * 1000;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("planDateShift", () => {
  it("moves the seed's window by however far the arrival moved", () => {
    const shift = planDateShift(d("2026-03-01"), d("2026-07-06"));
    expect(shift?.deltaMs).toBe(127 * DAY);
    expect(shift?.from).toEqual(d("2026-03-01"));
    expect(shift?.to).toEqual(new Date(d("2026-03-01").getTime() + SEED_WINDOW_DAYS * DAY));
  });

  it("does nothing once the arrival is where it belongs, so a rerun changes nothing", () => {
    expect(planDateShift(d("2026-07-06"), d("2026-07-06"))).toBeNull();
  });

  it("does nothing for a project with no arrival to measure from", () => {
    expect(planDateShift(null, d("2026-07-06"))).toBeNull();
  });
});

describe("fictionalVesselBlocker", () => {
  it("lets an invented vessel holding only demo projects go", () => {
    expect(
      fictionalVesselBlocker({ name: "M/Y Solstice", projectIds: ["p1"], roleCount: 0 }),
    ).toBeNull();
  });

  it("refuses when it holds a project that is not demo data", () => {
    expect(
      fictionalVesselBlocker({ name: "M/Y Solstice", projectIds: ["p1", "real"], roleCount: 0 }),
    ).toMatch(/not demo data \(real\)/);
  });

  it("refuses when a role is scoped to it, since deleting it would widen that role", () => {
    expect(
      fictionalVesselBlocker({ name: "M/Y Northern Light", projectIds: [], roleCount: 1 }),
    ).toMatch(/unscoped roles that reach every project/);
  });
});

describe("isNoChange", () => {
  const zero = {
    projectsCreated: 0,
    projectsUpdated: 0,
    timestampsShifted: 0,
    milestonesSet: 0,
    areasSet: 0,
    titlesRenamed: 0,
    vesselsDeleted: 0,
  };
  it("is true only when every count is zero", () => {
    expect(isNoChange(zero)).toBe(true);
    expect(isNoChange({ ...zero, milestonesSet: 1 })).toBe(false);
  });
});

describe("the demo workspace's layout", () => {
  it("sits on Draak", () => {
    expect(DEMO_VESSEL_YARD_NUMBER).toBe("Y709");
  });

  it("keeps the ids tests and QA rely on", () => {
    expect(DEMO_PROJECTS.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("uses codes that say what it is, sort before the register's and never contain a yard number", () => {
    for (const p of DEMO_PROJECTS) {
      expect(p.code).toMatch(/^DEMO-/);
      expect(p.code.localeCompare("Y701")).toBeLessThan(0);
      expect(p.code).not.toMatch(/Y7\d\d/);
      expect(p.name).toMatch(/^Demo — /);
    }
  });

  it("does not overlap Draak's real rebuild, delivered June 2026", () => {
    for (const p of DEMO_PROJECTS)
      expect(p.arrivalDate.getTime()).toBeGreaterThanOrEqual(d("2026-07-01").getTime());
  });

  it("dates the seeded change orders (up to 76 days after arrival) before it was re-dated on 27 September 2026", () => {
    expect(DEMO_PRIMARY.arrivalDate.getTime() + 76 * DAY).toBeLessThanOrEqual(
      d("2026-09-27").getTime(),
    );
  });

  it("is in order within each yard period", () => {
    for (const p of DEMO_PROJECTS) {
      expect(p.haulOutDate.getTime()).toBeGreaterThanOrEqual(p.arrivalDate.getTime());
      if (p.seaTrialsDate)
        expect(p.seaTrialsDate.getTime()).toBeLessThanOrEqual(p.departureDate.getTime());
      expect(p.departureDate.getTime()).toBeGreaterThan(p.arrivalDate.getTime());
    }
  });

  it("books the second project after the first, within 2027", () => {
    expect(DEMO_SECONDARY.arrivalDate.getTime()).toBeGreaterThan(
      DEMO_PRIMARY.departureDate.getTime(),
    );
    expect(DEMO_SECONDARY.arrivalDate.getUTCFullYear()).toBe(2027);
    expect(DEMO_SECONDARY.departureDate.getUTCFullYear()).toBe(2027);
  });

  it("puts every milestone inside the primary yard period", () => {
    for (const m of DEMO_MILESTONES) {
      expect(m.date.getTime()).toBeGreaterThanOrEqual(DEMO_PRIMARY.arrivalDate.getTime());
      expect(m.date.getTime()).toBeLessThanOrEqual(DEMO_PRIMARY.departureDate.getTime());
    }
  });

  it("keeps a window wide enough for every date the seed derives from arrival", () => {
    // Change orders run to 76 days; quotes to about 70 (request, delivery,
    // acceptance, completion 20–24 days on, and expiry).
    expect(SEED_WINDOW_DAYS).toBeGreaterThan(76);
  });

  it("names its areas once each", () => {
    expect(new Set(DEMO_AREAS).size).toBe(DEMO_AREAS.length);
  });
});
