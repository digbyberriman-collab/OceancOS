import { describe, it, expect } from "vitest";
import { ChangeOrderCreateSchema, CrewRequestCreateSchema } from "@/lib/validators";

// C13: Object.fromEntries(formData) hands every untouched optional field
// through as the empty string, never undefined. Before the blankToNull
// preprocessor, that crashed dueDate outright (z.coerce.date() on "" is
// Invalid Date) and let "" reach the database for the rest — including
// linkedChangeOrderId, whose real foreign key rejected a non-null "" outright
// on ordinary use (the default, untouched "— No linked change order" state).

const baseCrewRequest = {
  title: "Fix the thing",
  description: "The thing needs fixing.",
  category: "DEFECT",
};

const baseChangeOrder = {
  title: "Replace the thing",
  description: "The thing needs replacing.",
  reason: "Wear and tear.",
};

describe("CrewRequestCreateSchema — blank optional fields", () => {
  it("accepts a blank due date instead of failing coercion on Invalid Date", () => {
    const result = CrewRequestCreateSchema.safeParse({ ...baseCrewRequest, dueDate: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dueDate).toBeNull();
  });

  it("still parses a real due date correctly", () => {
    const result = CrewRequestCreateSchema.safeParse({ ...baseCrewRequest, dueDate: "2027-01-01" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dueDate).toEqual(new Date("2027-01-01"));
  });

  it("normalises every blank optional select/field to null, not empty string", () => {
    const result = CrewRequestCreateSchema.safeParse({
      ...baseCrewRequest,
      departmentCode: "",
      vesselAreaId: "",
      assignedToId: "",
      safetyImpact: "",
      linkedChangeOrderId: "",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.departmentCode).toBeNull();
    expect(result.data.vesselAreaId).toBeNull();
    expect(result.data.assignedToId).toBeNull();
    expect(result.data.safetyImpact).toBeNull();
    expect(result.data.linkedChangeOrderId).toBeNull();
  });

  it("still accepts a genuinely omitted (undefined) optional field", () => {
    const result = CrewRequestCreateSchema.safeParse(baseCrewRequest);
    expect(result.success).toBe(true);
  });

  it("passes a real, non-blank value straight through unchanged", () => {
    const result = CrewRequestCreateSchema.safeParse({
      ...baseCrewRequest,
      departmentCode: "DECK",
      linkedChangeOrderId: "co_real123",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.departmentCode).toBe("DECK");
    expect(result.data.linkedChangeOrderId).toBe("co_real123");
  });
});

describe("ChangeOrderCreateSchema — blank optional fields", () => {
  it("normalises every blank optional field to null", () => {
    const result = ChangeOrderCreateSchema.safeParse({
      ...baseChangeOrder,
      departmentCode: "",
      vesselAreaId: "",
      riskImpact: "",
      technicalImpact: "",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.departmentCode).toBeNull();
    expect(result.data.vesselAreaId).toBeNull();
    expect(result.data.riskImpact).toBeNull();
    expect(result.data.technicalImpact).toBeNull();
  });

  it("still rejects a genuinely invalid required field", () => {
    const result = ChangeOrderCreateSchema.safeParse({ ...baseChangeOrder, title: "ab" });
    expect(result.success).toBe(false);
  });
});
