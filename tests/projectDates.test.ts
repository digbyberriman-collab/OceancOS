import { describe, it, expect } from "vitest";
import {
  normaliseProjectCode,
  parseDateField,
  toDateInputValue,
  validateYardPeriod,
} from "@/lib/projectDates";

const arrival = new Date("2026-03-01T00:00:00Z");
const haulOut = new Date("2026-03-08T00:00:00Z");
const seaTrials = new Date("2026-09-12T00:00:00Z");
const departure = new Date("2026-09-30T00:00:00Z");

describe("validateYardPeriod", () => {
  it("accepts a period in order", () => {
    expect(
      validateYardPeriod({
        arrivalDate: arrival,
        haulOutDate: haulOut,
        seaTrialsDate: seaTrials,
        departureDate: departure,
      })
    ).toEqual([]);
  });

  it("accepts a period with nothing set", () => {
    expect(validateYardPeriod({})).toEqual([]);
  });

  it("accepts arrival alone, since detail may not be known yet", () => {
    expect(validateYardPeriod({ arrivalDate: arrival })).toEqual([]);
  });

  it("rejects departure before arrival", () => {
    const problems = validateYardPeriod({ arrivalDate: departure, departureDate: arrival });
    expect(problems.map((p) => p.field)).toContain("departureDate");
  });

  it("rejects departure equal to arrival, which is a zero-length period", () => {
    const problems = validateYardPeriod({ arrivalDate: arrival, departureDate: arrival });
    expect(problems).toHaveLength(1);
    expect(problems[0].field).toBe("departureDate");
  });

  it("rejects haul out before arrival", () => {
    const problems = validateYardPeriod({
      arrivalDate: haulOut,
      haulOutDate: arrival,
      departureDate: departure,
    });
    expect(problems.map((p) => p.field)).toContain("haulOutDate");
  });

  it("allows haul out on the day of arrival", () => {
    expect(
      validateYardPeriod({ arrivalDate: arrival, haulOutDate: arrival, departureDate: departure })
    ).toEqual([]);
  });

  it("rejects haul out after departure", () => {
    const problems = validateYardPeriod({
      arrivalDate: arrival,
      haulOutDate: new Date("2026-10-05T00:00:00Z"),
      departureDate: departure,
    });
    expect(problems.map((p) => p.field)).toContain("haulOutDate");
  });

  it("rejects sea trials before arrival", () => {
    const problems = validateYardPeriod({
      arrivalDate: arrival,
      seaTrialsDate: new Date("2026-02-01T00:00:00Z"),
    });
    expect(problems.map((p) => p.field)).toContain("seaTrialsDate");
  });

  it("points at departure when sea trials fall past it", () => {
    const problems = validateYardPeriod({
      arrivalDate: arrival,
      seaTrialsDate: new Date("2026-10-10T00:00:00Z"),
      departureDate: departure,
    });
    expect(problems[0].message).toMatch(/extend the departure date/i);
  });

  it("reports every problem rather than only the first", () => {
    const problems = validateYardPeriod({
      arrivalDate: departure,
      haulOutDate: arrival,
      departureDate: arrival,
    });
    expect(problems.length).toBeGreaterThan(1);
  });

  it("gives every problem a message", () => {
    const problems = validateYardPeriod({ arrivalDate: departure, departureDate: arrival });
    for (const problem of problems) expect(problem.message.length).toBeGreaterThan(0);
  });
});

describe("parseDateField", () => {
  it("reads a date input value", () => {
    expect(parseDateField("2026-03-01")?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("treats an empty field as clearing the date", () => {
    expect(parseDateField("")).toBeNull();
    expect(parseDateField("   ")).toBeNull();
    expect(parseDateField(null)).toBeNull();
  });

  it("returns null for nonsense rather than an invalid date", () => {
    expect(parseDateField("not-a-date")).toBeNull();
    expect(parseDateField("2026-13-45")).toBeNull();
  });

  it("round-trips through the input formatter", () => {
    const parsed = parseDateField("2026-09-30");
    expect(toDateInputValue(parsed)).toBe("2026-09-30");
  });
});

describe("toDateInputValue", () => {
  it("is empty for no date", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
  });

  it("formats as the input element expects", () => {
    expect(toDateInputValue(arrival)).toBe("2026-03-01");
  });
});

describe("normaliseProjectCode", () => {
  it("upper-cases and trims", () => {
    expect(normaliseProjectCode("  r-00721 ")).toBe("R-00721");
  });

  it("collapses inner whitespace, which would otherwise create near-duplicates", () => {
    expect(normaliseProjectCode("R 00721")).toBe("R-00721");
  });

  it("treats a blank code as absent", () => {
    expect(normaliseProjectCode("")).toBeNull();
    expect(normaliseProjectCode("   ")).toBeNull();
  });
});
