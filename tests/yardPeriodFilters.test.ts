import { describe, it, expect } from "vitest";
import { cleanFilters, isFiltered, projectRegisterWhere } from "@/lib/yardPeriods/filters";

describe("cleanFilters", () => {
  it("keeps real choices", () => {
    expect(
      cleanFilters({
        vessel: "Y709",
        status: "COMPLETED",
        year: "2019",
        confidence: "HIGH",
        yard: " Navantia ",
      }),
    ).toEqual({
      vessel: "Y709",
      status: "COMPLETED",
      year: "2019",
      confidence: "HIGH",
      yard: "Navantia",
    });
  });

  it("drops anything that is not one", () => {
    expect(
      cleanFilters({ status: "ARCHIVED", year: "twenty", confidence: "SURE", vessel: " " }),
    ).toEqual({
      vessel: undefined,
      status: undefined,
      yard: undefined,
      year: undefined,
      confidence: undefined,
    });
  });
});

describe("isFiltered", () => {
  it("is true only when a filter is set", () => {
    expect(isFiltered(cleanFilters({}))).toBe(false);
    expect(isFiltered(cleanFilters({ year: "2020" }))).toBe(true);
  });
});

describe("projectRegisterWhere", () => {
  it("always scopes to reachable, real, unarchived projects", () => {
    expect(projectRegisterWhere(["a", "b"], {})).toEqual({
      AND: [{ id: { in: ["a", "b"] } }, { isDemo: false }, { archivedAt: null }],
    });
  });

  it("matches a year a period touches, not only the one it started in", () => {
    const where = projectRegisterWhere([], { year: "2020" });
    const clause = (where.AND as object[]).at(-1);
    expect(clause).toEqual({
      OR: [
        {
          yardPeriod: {
            sortStart: { lte: new Date("2020-12-31T00:00:00.000Z") },
            sortEnd: { gte: new Date("2020-01-01T00:00:00.000Z") },
          },
        },
        {
          arrivalDate: { lte: new Date("2020-12-31T00:00:00.000Z") },
          departureDate: { gte: new Date("2020-01-01T00:00:00.000Z") },
        },
      ],
    });
  });

  it("finds a yard by its published name or place", () => {
    const where = projectRegisterWhere([], { yard: "Cartagena" });
    expect(JSON.stringify(where)).toContain(
      '"cityText":{"contains":"Cartagena","mode":"insensitive"}',
    );
  });
});
