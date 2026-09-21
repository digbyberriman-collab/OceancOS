import { describe, it, expect } from "vitest";
import {
  DEFAULT_JOB_CODE_PATTERN,
  compareJobCodes,
  groupCodeOf,
  isValidJobCode,
  nextCodeInGroup,
  normaliseJobCode,
  sectionLetterOf,
} from "@/lib/jobs/codes";

describe("normaliseJobCode", () => {
  it("upper-cases and strips whitespace", () => {
    expect(normaliseJobCode("  d.0130.05 ")).toBe("D.0130.05");
    expect(normaliseJobCode("D. 0130 .05")).toBe("D.0130.05");
  });
});

describe("isValidJobCode", () => {
  it("accepts the shapes yards actually issue", () => {
    for (const code of ["D.0130", "D.0130.05", "I.2200.20", "P.1000.01", "D.0130.05-01"]) {
      expect(isValidJobCode(code), code).toBe(true);
    }
  });

  it("accepts a lower-case code, since it is normalised first", () => {
    expect(isValidJobCode("d.0130.05")).toBe(true);
  });

  it("rejects malformed codes", () => {
    for (const code of ["", "D", "D.130", "D.01300", "0130.05", "DD.0130", "D-0130-05"]) {
      expect(isValidJobCode(code), code).toBe(false);
    }
  });

  it("honours a per-project override", () => {
    const rules = { pattern: "^JOB-\\d{4}$" };
    expect(isValidJobCode("JOB-0001", rules)).toBe(true);
    expect(isValidJobCode("D.0130.05", rules)).toBe(false);
  });

  it("falls back to the default when an override is not a valid expression", () => {
    const broken = { pattern: "^[unclosed" };
    expect(isValidJobCode("D.0130.05", broken)).toBe(true);
    expect(isValidJobCode("nonsense", broken)).toBe(false);
  });

  it("has a default pattern that compiles", () => {
    expect(() => new RegExp(DEFAULT_JOB_CODE_PATTERN)).not.toThrow();
  });
});

describe("groupCodeOf", () => {
  it("takes the section and group", () => {
    expect(groupCodeOf("D.0130.05")).toBe("D.0130");
    expect(groupCodeOf("I.2200.20")).toBe("I.2200");
  });

  it("returns the group itself when given one", () => {
    expect(groupCodeOf("D.0130")).toBe("D.0130");
  });

  it("ignores a revision suffix", () => {
    expect(groupCodeOf("D.0130.05-01")).toBe("D.0130");
  });

  it("still groups an unrecognised scheme rather than giving up", () => {
    expect(groupCodeOf("CUSTOM.SECTION.01")).toBe("CUSTOM.SECTION");
  });

  it("returns null when there is nothing to group on", () => {
    expect(groupCodeOf("SINGLE")).toBeNull();
  });
});

describe("sectionLetterOf", () => {
  it("reads the leading letter", () => {
    expect(sectionLetterOf("D.0130.05")).toBe("D");
    expect(sectionLetterOf("i.2200.20")).toBe("I");
  });

  it("is null when the code does not start with one", () => {
    expect(sectionLetterOf("0130.05")).toBeNull();
    expect(sectionLetterOf("JOB-0001")).toBeNull();
  });
});

describe("compareJobCodes", () => {
  it("orders numerically, not as strings", () => {
    // The string order would put .10 before .5, which reads as wrong to a user.
    const sorted = ["D.0130.10", "D.0130.05", "D.0130.02"].sort(compareJobCodes);
    expect(sorted).toEqual(["D.0130.02", "D.0130.05", "D.0130.10"]);
  });

  it("orders by section first", () => {
    const sorted = ["I.1000.10", "D.9000.10", "P.0100.10"].sort(compareJobCodes);
    expect(sorted).toEqual(["D.9000.10", "I.1000.10", "P.0100.10"]);
  });

  it("orders by group before job number", () => {
    const sorted = ["D.0200.01", "D.0130.99"].sort(compareJobCodes);
    expect(sorted).toEqual(["D.0130.99", "D.0200.01"]);
  });

  it("puts a group heading before its jobs", () => {
    const sorted = ["D.0130.05", "D.0130"].sort(compareJobCodes);
    expect(sorted).toEqual(["D.0130", "D.0130.05"]);
  });

  it("is stable for equal codes", () => {
    expect(compareJobCodes("D.0130.05", "D.0130.05")).toBe(0);
  });
});

describe("nextCodeInGroup", () => {
  it("starts at ten, leaving room to insert", () => {
    expect(nextCodeInGroup("D.0130", [])).toBe("D.0130.10");
  });

  it("steps in tens", () => {
    expect(nextCodeInGroup("D.0130", ["D.0130.10"])).toBe("D.0130.20");
    expect(nextCodeInGroup("D.0130", ["D.0130.10", "D.0130.20"])).toBe("D.0130.30");
  });

  it("ignores codes from other groups", () => {
    expect(nextCodeInGroup("D.0130", ["I.2200.10", "D.0200.10"])).toBe("D.0130.10");
  });

  it("fills a gap left by an earlier deletion", () => {
    expect(nextCodeInGroup("D.0130", ["D.0130.20", "D.0130.30"])).toBe("D.0130.10");
  });

  it("falls back to single steps once the tens are used", () => {
    const tens = Array.from({ length: 9 }, (_, i) => `D.0130.${String((i + 1) * 10).padStart(2, "0")}`);
    expect(nextCodeInGroup("D.0130", tens)).toBe("D.0130.01");
  });

  it("always suggests a code that validates", () => {
    expect(isValidJobCode(nextCodeInGroup("D.0130", ["D.0130.10"]))).toBe(true);
  });
});
