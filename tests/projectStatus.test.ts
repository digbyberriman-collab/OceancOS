import { describe, it, expect } from "vitest";
import { assertProjectWritable, isProjectWritable } from "@/lib/projectStatus";
import { ActionError } from "@/lib/errors";

describe("isProjectWritable", () => {
  it("takes new work on an active or planned project", () => {
    expect(isProjectWritable({ status: "ACTIVE" })).toBe(true);
    expect(isProjectWritable({ status: "PLANNED" })).toBe(true);
  });

  it("takes none on a completed yard period", () => {
    expect(isProjectWritable({ status: "COMPLETED" })).toBe(false);
  });
});

describe("assertProjectWritable", () => {
  it("lets work onto an active project", () => {
    expect(() =>
      assertProjectWritable({ status: "ACTIVE", code: "DEMO-01", name: "Demo" }),
    ).not.toThrow();
  });

  it("refuses a completed one as a conflict, naming it", () => {
    let caught: unknown;
    try {
      assertProjectWritable({
        status: "COMPLETED",
        code: "Y714-2019",
        name: "Major transformational refit",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ActionError);
    expect((caught as ActionError).kind).toBe("conflict");
    expect((caught as ActionError).message).toMatch(/^Y714-2019 is a completed yard period/);
  });
});
