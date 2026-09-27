import { describe, it, expect } from "vitest";
import { projectEyebrow } from "@/lib/projectLabel";

describe("projectEyebrow", () => {
  it("names the code and the yard", () => {
    expect(projectEyebrow({ code: "R-00721", yardName: "MB92 La Ciotat" })).toBe(
      "R-00721 · MB92 La Ciotat",
    );
  });

  it("drops the separator when no yard is recorded", () => {
    expect(projectEyebrow({ code: "Y701", yardName: null })).toBe("Y701");
    expect(projectEyebrow({ code: "Y701", yardName: "  " })).toBe("Y701");
  });

  it("names the yard alone when the project has no code", () => {
    expect(projectEyebrow({ code: null, yardName: "Amico & Co" })).toBe("Amico & Co");
  });

  it("falls back to a generic label with neither", () => {
    expect(projectEyebrow({ code: null, yardName: null })).toBe("Yard");
  });
});
