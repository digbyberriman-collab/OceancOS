import { beforeAll, describe, expect, it } from "vitest";
import { formatPeriod, parsePeriodLabel, periodBounds, startYear } from "@/lib/yardPeriods/period";
import {
  DEFAULT_YARD_REGISTER_PATH,
  readYardPeriodRegister,
  type RegisterPeriod,
} from "@/lib/yardPeriods/workbook";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("parsePeriodLabel", () => {
  it("reads a year as the whole year", () => {
    expect(parsePeriodLabel("2019")).toEqual({
      start: day("2019-01-01"),
      end: day("2019-12-31"),
      approximate: false,
    });
  });

  it("reads a quarter", () => {
    expect(parsePeriodLabel("2012-Q2")).toEqual({
      start: day("2012-04-01"),
      end: day("2012-06-30"),
      approximate: false,
    });
    expect(parsePeriodLabel("2023-Q4")?.end).toEqual(day("2023-12-31"));
  });

  it("reads a month to its last day", () => {
    expect(parsePeriodLabel("2013-12")).toEqual({
      start: day("2013-12-01"),
      end: day("2013-12-31"),
      approximate: false,
    });
    expect(parsePeriodLabel("2024-02")?.end).toEqual(day("2024-02-29"));
  });

  it("reads a season, with winter running into the next year", () => {
    expect(parsePeriodLabel("2017-Spring")).toEqual({
      start: day("2017-03-01"),
      end: day("2017-05-31"),
      approximate: false,
    });
    expect(parsePeriodLabel("2022-Winter")).toEqual({
      start: day("2022-12-01"),
      end: day("2023-02-28"),
      approximate: false,
    });
  });

  it("keeps the published approximation", () => {
    expect(parsePeriodLabel("2023-06 approx.")).toEqual({
      start: day("2023-06-01"),
      end: day("2023-06-30"),
      approximate: true,
    });
    expect(parsePeriodLabel("2019 approx.")?.approximate).toBe(true);
  });

  it("has no dates for an unverified date", () => {
    expect(parsePeriodLabel("Date unverified")).toBeNull();
  });

  it("refuses a label it does not know rather than guessing", () => {
    expect(() => parsePeriodLabel("mid-2023")).toThrow(/cannot read the date "mid-2023"/);
    expect(() => parsePeriodLabel("2023-13")).toThrow(/not a month/);
  });
});

describe("periodBounds", () => {
  it("runs from the first day of the start to the last day of the end", () => {
    expect(periodBounds("2019-03", "2020-11")).toEqual({
      sortStart: day("2019-03-01"),
      sortEnd: day("2020-11-30"),
      approximate: false,
    });
  });

  it("is approximate when either end is", () => {
    expect(periodBounds("2024-10", "2025-Q1 approx.").approximate).toBe(true);
  });

  it("has no bounds for an undated period", () => {
    expect(periodBounds("Date unverified", "Date unverified")).toEqual({
      sortStart: null,
      sortEnd: null,
      approximate: false,
    });
  });

  it("refuses a period that ends before it starts", () => {
    expect(() => periodBounds("2024", "2023")).toThrow(/ends before it starts/);
  });
});

describe("formatPeriod", () => {
  it("shows one label when the period starts and ends in it", () => {
    expect(formatPeriod("2012-Q2", "2012-Q2")).toBe("2012-Q2");
  });

  it("shows both labels, as published, otherwise", () => {
    expect(formatPeriod("2023-06 approx.", "2026-06")).toBe("2023-06 approx. – 2026-06");
  });
});

describe("startYear", () => {
  it("is the year a period starts in, or null when undated", () => {
    expect(startYear("2022-Winter")).toBe(2022);
    expect(startYear("Date unverified")).toBeNull();
  });
});

describe("every date in the committed register", () => {
  let periods: RegisterPeriod[];
  beforeAll(async () => {
    periods = (await readYardPeriodRegister(DEFAULT_YARD_REGISTER_PATH)).periods;
  });

  it("parses, and runs forwards", () => {
    for (const p of periods) {
      expect(
        () => periodBounds(p.startLabel, p.endLabel),
        `${p.yardNumber} ${p.startLabel}`,
      ).not.toThrow();
    }
  });

  it("is undated only where the register says the date is unverified", () => {
    const undated = periods.filter(
      (p) => periodBounds(p.startLabel, p.endLabel).sortStart === null,
    );
    expect(undated.map((p) => `${p.yardNumber} ${p.startLabel}`)).toEqual(["Y711 Date unverified"]);
  });
});
