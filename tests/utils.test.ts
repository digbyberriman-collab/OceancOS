import { describe, it, expect } from "vitest";
import { aggregateCurrency } from "@/lib/utils";

describe("aggregateCurrency", () => {
  it("returns the shared currency when every entry agrees", () => {
    expect(aggregateCurrency(["EUR", "EUR", "EUR"])).toBe("EUR");
  });

  it("returns null when currencies differ — summing them would be wrong, not just mislabelled", () => {
    expect(aggregateCurrency(["EUR", "GBP"])).toBeNull();
  });

  it("returns null for an empty list — nothing to agree on", () => {
    expect(aggregateCurrency([])).toBeNull();
  });

  it("ignores null/undefined entries rather than treating them as a distinct currency", () => {
    expect(aggregateCurrency(["EUR", null, undefined, "EUR"])).toBe("EUR");
  });

  it("returns null when only null/undefined entries are present", () => {
    expect(aggregateCurrency([null, undefined])).toBeNull();
  });
});
