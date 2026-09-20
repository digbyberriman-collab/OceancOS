import { describe, it, expect } from "vitest";
import { daysBetween, projectTiming, workProgressPct } from "@/lib/metrics/project";

const arrival = new Date("2026-03-01T00:00:00Z");
const departure = new Date("2026-09-01T00:00:00Z"); // 184 days later

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween(arrival, departure)).toBe(184);
  });

  it("goes negative backwards", () => {
    expect(daysBetween(departure, arrival)).toBe(-184);
  });

  it("is zero for the same instant", () => {
    expect(daysBetween(arrival, arrival)).toBe(0);
  });
});

describe("projectTiming", () => {
  it("reports the yard period from the middle of it", () => {
    const now = new Date("2026-06-01T00:00:00Z"); // 92 days in
    const t = projectTiming({ arrivalDate: arrival, departureDate: departure, now });
    expect(t.startedDaysAgo).toBe(92);
    expect(t.finishInDays).toBe(92);
    expect(t.onsiteDays).toBe(184);
    expect(t.timePct).toBeCloseTo(50, 1);
  });

  it("is 0% on the day of arrival and 100% on departure", () => {
    expect(projectTiming({ arrivalDate: arrival, departureDate: departure, now: arrival }).timePct)
      .toBe(0);
    expect(projectTiming({ arrivalDate: arrival, departureDate: departure, now: departure }).timePct)
      .toBe(100);
  });

  it("clamps rather than exceeding 100% after an overrun", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    const t = projectTiming({ arrivalDate: arrival, departureDate: departure, now });
    expect(t.timePct).toBe(100);
    expect(t.finishInDays).toBeLessThan(0);
  });

  it("clamps to 0% before arrival", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(projectTiming({ arrivalDate: arrival, departureDate: departure, now }).timePct).toBe(0);
  });

  it("returns nulls when dates are missing", () => {
    expect(projectTiming({ now: arrival })).toEqual({
      startedDaysAgo: null,
      finishInDays: null,
      onsiteDays: null,
      timePct: null,
    });
  });

  it("gives no percentage for a zero-length yard period", () => {
    const t = projectTiming({ arrivalDate: arrival, departureDate: arrival, now: arrival });
    expect(t.onsiteDays).toBe(0);
    expect(t.timePct).toBeNull();
  });

  it("still reports elapsed days when only arrival is known", () => {
    const now = new Date("2026-03-11T00:00:00Z");
    const t = projectTiming({ arrivalDate: arrival, now });
    expect(t.startedDaysAgo).toBe(10);
    expect(t.finishInDays).toBeNull();
    expect(t.timePct).toBeNull();
  });
});

describe("workProgressPct", () => {
  it("weights by accepted value, not by job count", () => {
    // A large job barely started outweighs a small finished one.
    const pct = workProgressPct([
      { progressPct: 100, acceptedValue: 1_000 },
      { progressPct: 0, acceptedValue: 9_000 },
    ]);
    expect(pct).toBeCloseTo(10, 5);
  });

  it("returns 100 when everything is complete", () => {
    expect(
      workProgressPct([
        { progressPct: 100, acceptedValue: 500 },
        { progressPct: 100, acceptedValue: 1_500 },
      ])
    ).toBe(100);
  });

  it("ignores zero-value jobs entirely", () => {
    const pct = workProgressPct([
      { progressPct: 100, acceptedValue: 0 },
      { progressPct: 25, acceptedValue: 1_000 },
    ]);
    expect(pct).toBeCloseTo(25, 5);
  });

  it("returns null when nothing is accepted", () => {
    expect(workProgressPct([])).toBeNull();
    expect(workProgressPct([{ progressPct: 100, acceptedValue: 0 }])).toBeNull();
  });

  it("clamps out-of-range inputs", () => {
    expect(workProgressPct([{ progressPct: 140, acceptedValue: 100 }])).toBe(100);
    expect(workProgressPct([{ progressPct: -20, acceptedValue: 100 }])).toBe(0);
  });

  it("never returns a negative weight for a credit-note style value", () => {
    const pct = workProgressPct([
      { progressPct: 50, acceptedValue: 1_000 },
      { progressPct: 50, acceptedValue: -500 },
    ]);
    expect(pct).toBeCloseTo(50, 5);
  });
});
