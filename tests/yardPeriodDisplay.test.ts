import { describe, it, expect } from "vitest";
import {
  byMostRecent,
  contractorList,
  groupScope,
  locationLine,
  nameAtTime,
  planningBand,
} from "@/lib/yardPeriods/display";

describe("locationLine", () => {
  it("names the city and country", () => {
    expect(locationLine("Cartagena", "Spain")).toBe("Cartagena, Spain");
  });

  it("names a place once when city and country are the same", () => {
    expect(locationLine("Malta", "Malta")).toBe("Malta");
  });

  it("drops what the register did not verify", () => {
    expect(locationLine("Unverified", "USA")).toBe("USA");
    expect(locationLine("Unverified", "Unverified")).toBeNull();
    expect(locationLine("Multiple", "Netherlands / Sint Maarten / France")).toBe(
      "Netherlands / Sint Maarten / France",
    );
  });
});

describe("nameAtTime", () => {
  it("gives the name the vessel went by then", () => {
    expect(nameAtTime("Equanimity", "Draak")).toBe("as Equanimity");
  });

  it("drops today's name from a period that spans a renaming", () => {
    expect(nameAtTime("Tranquility / Draak", "Draak")).toBe("as Tranquility");
    expect(nameAtTime("Jubilee / KAOS", "KAOS")).toBe("as Jubilee");
    expect(nameAtTime("Dar / LUNA", "LUNA")).toBe("as Dar");
  });

  it("says nothing when the name has not changed", () => {
    expect(nameAtTime("Draak", "Draak")).toBeNull();
    expect(nameAtTime("SUNRAYS", "Sunrays")).toBeNull();
    expect(nameAtTime(null, "Draak")).toBeNull();
  });
});

describe("planningBand", () => {
  it("shows a band as published", () => {
    expect(planningBand({ costBandLabel: "€30m–€70m+", costBandOpenEnded: true })).toEqual({
      label: "€30m–€70m+",
      estimated: true,
    });
  });

  it("says when no band was estimated rather than showing nothing", () => {
    expect(planningBand({ costBandLabel: null, costBandOpenEnded: false }).estimated).toBe(false);
  });
});

describe("groupScope", () => {
  it("groups by discipline in the disciplines' order, keeping each group's order", () => {
    const groups = groupScope([
      { discipline: "INTERIOR_GUEST", sortOrder: 2, d: "saloon" },
      { discipline: "STRUCTURE_HULL_PAINT", sortOrder: 1, d: "platform" },
      { discipline: "STRUCTURE_HULL_PAINT", sortOrder: 0, d: "helideck" },
    ]);
    expect(groups.map((g) => g.discipline)).toEqual(["STRUCTURE_HULL_PAINT", "INTERIOR_GUEST"]);
    expect(groups[0].items.map((i) => i.d)).toEqual(["helideck", "platform"]);
    expect(groups[0].label).toBe("Structure, hull & paint");
  });

  it("has no groups for a period with no itemised work", () => {
    expect(groupScope([])).toEqual([]);
  });
});

describe("contractorList", () => {
  it("splits the published list", () => {
    expect(contractorList("Oceanco LCS; YTMC; Inkfish")).toEqual([
      "Oceanco LCS",
      "YTMC",
      "Inkfish",
    ]);
    expect(contractorList(null)).toEqual([]);
  });
});

describe("byMostRecent", () => {
  const p = (end: string | null, start: string | null = end) => ({
    sortEnd: end ? new Date(end) : null,
    sortStart: start ? new Date(start) : null,
  });

  it("puts the latest-ending period first and undated ones last", () => {
    const sorted = [p("2019-12-31"), p(null, null), p("2026-06-30"), p("2023-12-31")].sort(
      byMostRecent,
    );
    expect(sorted.map((x) => x.sortEnd?.toISOString().slice(0, 4) ?? "undated")).toEqual([
      "2026",
      "2023",
      "2019",
      "undated",
    ]);
  });
});
