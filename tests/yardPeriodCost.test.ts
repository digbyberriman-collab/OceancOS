import { beforeAll, describe, expect, it } from "vitest";
import { parseCostBand } from "@/lib/yardPeriods/cost";
import {
  DEFAULT_YARD_REGISTER_PATH,
  readYardPeriodRegister,
  type RegisterPeriod,
} from "@/lib/yardPeriods/workbook";

describe("parseCostBand", () => {
  it("reads a band in millions of euros, exactly", () => {
    const band = parseCostBand("€0.5m–€2m")!;
    expect(band.low.toString()).toBe("500000");
    expect(band.high.toString()).toBe("2000000");
    expect(band.openEnded).toBe(false);
    expect(band.currency).toBe("EUR");
    expect(band.label).toBe("€0.5m–€2m");
  });

  it("keeps an open upper end as a floor", () => {
    const band = parseCostBand("€30m–€70m+")!;
    expect(band.high.toString()).toBe("70000000");
    expect(band.openEnded).toBe(true);
  });

  it("has no band when none was estimated", () => {
    expect(parseCostBand(null)).toBeNull();
    expect(parseCostBand("")).toBeNull();
    expect(parseCostBand("Not estimated")).toBeNull();
  });

  it("refuses an unfamiliar figure rather than storing it wrongly", () => {
    expect(() => parseCostBand("$2m–$5m")).toThrow(/cannot read the cost band/);
    expect(() => parseCostBand("€5m–€2m")).toThrow(/runs backwards/);
  });
});

describe("every band in the committed register", () => {
  let periods: RegisterPeriod[];
  beforeAll(async () => {
    periods = (await readYardPeriodRegister(DEFAULT_YARD_REGISTER_PATH)).periods;
  });

  it("parses", () => {
    for (const p of periods)
      expect(() => parseCostBand(p.costBand), `${p.yardNumber} ${p.startLabel}`).not.toThrow();
  });

  it("sits beside an undisclosed reported cost, never a figure", () => {
    expect(periods.every((p) => p.reportedCost === "Undisclosed")).toBe(true);
  });
});
