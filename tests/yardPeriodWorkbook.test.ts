import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_YARD_REGISTER_PATH,
  isoFromLongDate,
  readYardPeriodRegister,
  type YardPeriodRegister,
} from "@/lib/yardPeriods/workbook";

let register: YardPeriodRegister;
beforeAll(async () => {
  register = await readYardPeriodRegister(DEFAULT_YARD_REGISTER_PATH);
});

describe("the committed yard-period register", () => {
  it("is dated by its research cutoff", () => {
    expect(register.edition).toBe("2026-09-26");
  });

  it("holds 45 yard periods across 17 vessels", () => {
    expect(register.periods).toHaveLength(45);
    expect(new Set(register.periods.map((p) => p.yardNumber)).size).toBe(17);
  });

  it("summarises all 22 vessels, five with no period located", () => {
    expect(register.summary).toHaveLength(22);
    const none = register.summary.filter((s) => s.periodsFound === 0).map((s) => s.yardNumber);
    expect(none).toEqual(["Y716", "Y720", "Y721", "Y722", "Y726"]);
  });

  it("counts the same periods per vessel in the summary as in the master", () => {
    for (const s of register.summary) {
      const inMaster = register.periods.filter((p) => p.yardNumber === s.yardNumber).length;
      expect(inMaster, s.yardNumber).toBe(s.periodsFound);
    }
  });

  it("reads the conflicts, sources and gaps", () => {
    expect(register.conflicts).toHaveLength(7);
    expect(register.sources).toHaveLength(25);
    expect(register.gaps).toHaveLength(18);
    expect(register.gaps.filter((g) => g.yardNumber === "ALL")).toHaveLength(1);
    expect(register.gaps.every((g) => g.status === "OPEN")).toBe(true);
  });

  it("keeps a row's cells as published", () => {
    const rebuild = register.periods.find(
      (p) => p.yardNumber === "Y709" && p.startLabel === "2023-06 approx.",
    )!;
    expect(rebuild.endLabel).toBe("2026-06");
    expect(rebuild.nameAtPeriod).toBe("Tranquility / Draak");
    expect(rebuild.periodType).toBe("Comprehensive rebuild / role conversion");
    expect(rebuild.yard).toBe("Oceanco Life Cycle Support");
    expect(rebuild.costBand).toBe("€30m–€70m+");
    expect(rebuild.reportedCost).toBe("Undisclosed");
    expect(rebuild.confidence).toBe("HIGH");

    const unverified = register.periods.find((p) => p.yardNumber === "Y708")!;
    expect(unverified.yard).toBe("Unverified");
  });

  it("carries a confidence on every period", () => {
    expect(register.periods.every((p) => p.confidence != null)).toBe(true);
  });
});

describe("isoFromLongDate", () => {
  it("reads the Read Me's cutoff", () => {
    expect(isoFromLongDate("26 September 2026")).toBe("2026-09-26");
    expect(isoFromLongDate("1 March 2027")).toBe("2027-03-01");
  });

  it("refuses anything else", () => {
    expect(isoFromLongDate("September 2026")).toBeNull();
    expect(isoFromLongDate("26 Septembre 2026")).toBeNull();
  });
});
