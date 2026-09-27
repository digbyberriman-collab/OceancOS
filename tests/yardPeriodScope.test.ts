import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_YARD_REGISTER_PATH,
  readYardPeriodRegister,
  type YardPeriodRegister,
} from "@/lib/yardPeriods/workbook";
import {
  SCOPE_CLASSIFICATION,
  checkScopeCoverage,
  scopeLine,
  scopeLines,
} from "@/lib/yardPeriods/scope";
import { CONFLICT_TARGETS, GAP_TARGETS, MERGES } from "@/lib/yardPeriods/merges";
import { periodKey } from "@/lib/yardPeriods/workbook";

let register: YardPeriodRegister;
beforeAll(async () => {
  register = await readYardPeriodRegister(DEFAULT_YARD_REGISTER_PATH);
});

describe("the scope classification", () => {
  it("covers every period in the register", () => {
    const missing = register.periods.map(periodKey).filter((k) => !SCOPE_CLASSIFICATION[k]);
    expect(missing).toEqual([]);
  });

  it("names no period the register does not have", () => {
    const keys = new Set(register.periods.map(periodKey));
    expect(Object.keys(SCOPE_CLASSIFICATION).filter((k) => !keys.has(k))).toEqual([]);
  });

  it("accounts for every word of every published scope, once and in order", () => {
    for (const p of register.periods) {
      const result = checkScopeCoverage(p.scope ?? "", SCOPE_CLASSIFICATION[periodKey(p)]);
      expect(result, periodKey(p)).toEqual({ ok: true });
    }
  });

  it("files KAOS's work by what it is, and leaves the yard's boast as narrative", () => {
    const kaos = SCOPE_CLASSIFICATION["Y714|2019-03|2020-11|Major transformational refit"];
    expect(kaos).toContainEqual(["Largest Lürssen refit at the time", "NARRATIVE"]);
    expect(kaos.filter(([, c]) => c === "ELECTRICAL_AVIT_NAV")).toEqual([]);
    expect(kaos).toContainEqual([
      "approximately 1,500m² of interior renewed and reconfigured",
      "INTERIOR_GUEST",
    ]);
  });

  it("keeps the Draak clauses the register's own Detailed Scope sheet dropped", () => {
    const lines = scopeLines(
      SCOPE_CLASSIFICATION["Y709|2023-06 approx.|2026-06|Comprehensive rebuild / role conversion"],
    ).map((l) => l.description);
    expect(lines).toContain("Upper-deck aft helideck removed");
    expect(lines).toContain("Added crew/staff/guest capacity");
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe("checkScopeCoverage", () => {
  const scope = "Paint; new floors. About 10 people worked.";

  it("accepts entries that account for the whole text", () => {
    expect(
      checkScopeCoverage(scope, [
        ["Paint", "STRUCTURE_HULL_PAINT"],
        ["new floors", "INTERIOR_GUEST"],
        ["About 10 people worked", "NARRATIVE"],
      ]),
    ).toEqual({ ok: true });
  });

  it("refuses a dropped clause", () => {
    const result = checkScopeCoverage(scope, [
      ["Paint", "STRUCTURE_HULL_PAINT"],
      ["new floors", "INTERIOR_GUEST"],
    ]);
    expect(result.ok).toBe(false);
  });

  it("refuses an invented or out-of-order clause", () => {
    expect(
      checkScopeCoverage(scope, [
        ["new floors", "INTERIOR_GUEST"],
        ["Paint", "STRUCTURE_HULL_PAINT"],
      ]).ok,
    ).toBe(false);
    expect(checkScopeCoverage(scope, [["Varnish", "STRUCTURE_HULL_PAINT"]]).ok).toBe(false);
  });

  it("allows the joining word between two clauses of different disciplines", () => {
    expect(
      checkScopeCoverage("Replace seals and paint the hull.", [
        ["Replace seals", "MECHANICAL_PROPULSION"],
        ["paint the hull", "STRUCTURE_HULL_PAINT"],
      ]),
    ).toEqual({ ok: true });
  });
});

describe("scopeLine", () => {
  it("capitalises and drops a trailing full stop, rewording nothing", () => {
    expect(scopeLine("stabiliser servicing.")).toBe("Stabiliser servicing");
    expect(scopeLine("more than 58km of cabling replaced")).toBe(
      "More than 58km of cabling replaced",
    );
  });
});

describe("the merge and attribution tables", () => {
  it("name only rows the register has", () => {
    const keys = new Set(register.periods.map(periodKey));
    for (const m of MERGES) {
      expect(keys.has(m.from), m.from).toBe(true);
      expect(keys.has(m.into), m.into).toBe(true);
    }
    for (const target of [...Object.values(CONFLICT_TARGETS), ...Object.values(GAP_TARGETS)]) {
      if (target) expect(keys.has(target), target).toBe(true);
    }
  });

  it("attribute every conflict in the register", () => {
    for (const c of register.conflicts) {
      expect(`${c.yardNumber}|${c.issue}` in CONFLICT_TARGETS, `${c.yardNumber}|${c.issue}`).toBe(
        true,
      );
    }
  });

  it("name only gaps the register has", () => {
    const gaps = new Set(register.gaps.map((g) => `${g.yardNumber}|${g.gap}`));
    for (const key of Object.keys(GAP_TARGETS)) expect(gaps.has(key), key).toBe(true);
  });
});
