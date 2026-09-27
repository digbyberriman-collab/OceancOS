import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_YARD_REGISTER_PATH,
  readYardPeriodRegister,
  type YardPeriodRegister,
} from "@/lib/yardPeriods/workbook";
import {
  identifiedPlace,
  latestRefits,
  normaliseUrl,
  planYardPeriods,
  plannedCodes,
  type YardPeriodPlan,
} from "@/lib/yardPeriods/importRegister";

let register: YardPeriodRegister;
let plan: YardPeriodPlan;
beforeAll(async () => {
  register = await readYardPeriodRegister(DEFAULT_YARD_REGISTER_PATH);
  plan = planYardPeriods(register);
});

const byKey = (key: string) => plan.periods.find((p) => p.importKey === key)!;
const REBUILD = "Y709|2023-06 approx.|2026-06|Comprehensive rebuild / role conversion";

describe("planYardPeriods", () => {
  it("makes 44 yard periods of the register's 45 rows, with no warnings", () => {
    expect(plan.periods).toHaveLength(44);
    expect(plan.warnings).toEqual([]);
  });

  it("gives Draak two periods: the 2017 works and the rebuild, which absorbs Proyacht's hours", () => {
    const draak = plan.periods.filter((p) => p.yardNumber === "Y709");
    expect(draak.map((p) => p.record.startLabel)).toEqual(["2017", "2023-06 approx."]);
    const rebuild = byKey(REBUILD);
    expect(rebuild.mergedFrom).toEqual(["Y709|2023|2026|Contractor work package within rebuild"]);
    expect(rebuild.scope.at(-1)).toEqual({
      discipline: "GENERAL",
      description:
        "Proyacht records 1,420 hours of outfit and construction work on Y709 since 2023",
    });
    const sources = rebuild.evidence.filter((e) => e.kind === "SOURCE");
    expect(sources).toHaveLength(2);
    expect(sources[1].qualification).toMatch(/^The register lists Proyacht's 1,420 hours on Y709 as a row of its own/);
    expect(rebuild.record.contractorsText?.split("; ")).toContain("Proyacht");
  });

  it("types the Draak rebuild as a conversion and everything else as a refit", () => {
    expect(plan.periods.filter((p) => p.type === "CONVERSION").map((p) => p.importKey)).toEqual([
      REBUILD,
    ]);
  });

  it("codes periods by yard number and start year, numbering a clash and marking the undated", () => {
    const codes = plannedCodes(plan.periods);
    expect(new Set(codes).size).toBe(44);
    expect(codes).toContain("Y709-2023");
    expect(codes).toContain("Y702-2024");
    expect(codes).toContain("Y702-2024-2");
    expect(codes).toContain("Y711-UNDATED");
  });

  it("names a yard only where the register identifies one", () => {
    expect(byKey("Y708|2022|2022|Refit").yardName).toBeNull();
    expect(byKey("Y708|2022|2022|Refit").record.yardText).toBe("Unverified");
    expect(byKey("Y706|2021|2021|Interior refit").yardName).toBeNull();
    expect(byKey("Y706|2021|2021|Interior refit").record.countryText).toBe("USA");
    expect(byKey("Y714|2019-03|2020-11|Major transformational refit").yardName).toBe(
      "Lürssen / Blohm+Voss",
    );
  });

  it("keeps dates at the precision published, with bounds for ordering only", () => {
    const kaos = byKey("Y714|2019-03|2020-11|Major transformational refit").record;
    expect(kaos.startLabel).toBe("2019-03");
    expect(kaos.sortStart?.toISOString().slice(0, 10)).toBe("2019-03-01");
    expect(kaos.sortEnd?.toISOString().slice(0, 10)).toBe("2020-11-30");
    const undated = byKey("Y711|Date unverified|Date unverified|Maintenance & upgrades").record;
    expect(undated.sortStart).toBeNull();
  });

  it("stores planning bands as a label with Decimal bounds, and reported cost as published", () => {
    const rebuild = byKey(REBUILD).record;
    expect(rebuild.costBandLabel).toBe("€30m–€70m+");
    expect(rebuild.costBandLow?.toString()).toBe("30000000");
    expect(rebuild.costBandOpenEnded).toBe(true);
    expect(rebuild.reportedCostText).toBe("Undisclosed");
    const unestimated = byKey("Y701|2019|2019|Repair / maintenance").record;
    expect(unestimated.costBandLabel).toBeNull();
    expect(unestimated.costBandLow).toBeNull();
  });

  it("puts conflicts on their periods and excluded claims on their vessels", () => {
    expect(
      byKey(REBUILD).evidence.some(
        (e) => e.kind === "CONFLICT" && e.issue === "Refit duration wording",
      ),
    ).toBe(true);
    expect(byKey("Y701|2025|2025|Refit / outfitting").evidence.map((e) => e.kind)).toContain(
      "CONFLICT",
    );
    expect(plan.vesselEvidence.map((e) => `${e.kind} ${e.yardNumber}`).sort()).toEqual([
      "EXCLUDED Y720",
      "EXCLUDED Y721",
      "EXCLUDED Y722",
      "EXCLUDED Y726",
    ]);
  });

  it("pins period gaps to their periods and the fleet gap to no vessel", () => {
    expect(plan.gaps).toHaveLength(18);
    expect(plan.gaps.filter((g) => g.importKey).map((g) => g.importKey)).toEqual([
      "Y701|2025|2025|Refit / outfitting",
      REBUILD,
      "Y714|2019-03|2020-11|Major transformational refit",
    ]);
    expect(plan.gaps.filter((g) => g.yardNumber === null)).toHaveLength(1);
  });

  it("writes no scope line from a narrative clause", () => {
    const navantia = byKey("Y704|2018|2018|Repair / maintenance");
    expect(navantia.scope).toEqual([]);
    expect(navantia.record.scopeSummary).toMatch(/^Navantia lists the yacht/);
  });
});

describe("latestRefits", () => {
  it("is each vessel's latest refit or rebuild, not its latest repair", () => {
    const years = Object.fromEntries(
      [...latestRefits(plan.periods)].map(([yard, r]) => [yard, r.year]),
    );
    expect(years).toEqual({
      Y701: 2025,
      Y702: 2024,
      Y703: 2024,
      Y705: 2026,
      Y706: 2023,
      Y707: 2017,
      Y708: 2022,
      Y709: 2026,
      Y710: 2025,
      Y711: 2021,
      Y712: 2024,
      Y714: 2020,
      Y715: 2025,
      Y717: 2024,
    });
  });
});

describe("the latest yard period", () => {
  it("is Vibrant Curiosity's 2023 visit, although the register's summary sheet says 2019", () => {
    const y704 = plan.periods.filter((p) => p.yardNumber === "Y704" && p.record.sortEnd);
    const latest = y704.reduce((a, b) => (a.record.sortEnd! > b.record.sortEnd! ? a : b));
    expect(latest.record.startLabel).toBe("2023");
    expect(register.summary.find((s) => s.yardNumber === "Y704")?.latestPublicPeriod).toBe("2019");
  });
});

describe("identifiedPlace", () => {
  it("is null where the source named no place", () => {
    for (const t of [
      null,
      "",
      "Unverified",
      "Unspecified USA yard",
      "Unspecified Italian yard",
      "Multiple",
    ]) {
      expect(identifiedPlace(t)).toBeNull();
    }
  });

  it("keeps a named place as published", () => {
    expect(identifiedPlace("Multiple: Oceanco; St. Maarten; La Ciotat")).toBe(
      "Multiple: Oceanco; St. Maarten; La Ciotat",
    );
    expect(identifiedPlace(" Amico & Co ")).toBe("Amico & Co");
  });
});

describe("normaliseUrl", () => {
  it("treats www, case and a trailing slash as the same source", () => {
    expect(normaliseUrl("https://www.Proyacht.nl/custom-yacht-refit-portfolio/")).toBe(
      normaliseUrl("https://proyacht.nl/custom-yacht-refit-portfolio"),
    );
  });

  it("keeps different pages apart", () => {
    expect(normaliseUrl("https://y.co/yacht/luna")).not.toBe(
      normaliseUrl("https://y.co/services/build-and-refit"),
    );
  });
});
