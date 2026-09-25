import { describe, it, expect } from "vitest";
import {
  ApprovalDecisionSchema,
  ChangeOrderCreateSchema,
  CrewRequestCreateSchema,
} from "@/lib/validators";

// G2.8 (AUDIT_REPORT.md C13/C14): a blank optional form control posts "",
// never an absent key, so every optional field must treat "" the same as
// not-provided rather than storing the literal empty string.

const CHANGE_ORDER_REQUIRED = {
  title: "Sundeck teak caulking",
  description: "Replace worn caulking on the sundeck.",
  reason: "Owner request.",
};

const CREW_REQUEST_REQUIRED = {
  title: "Fix the thing",
  description: "It needs fixing.",
  category: "DEFECT",
};

describe("ChangeOrderCreateSchema", () => {
  it("treats a blank optional field as absent, not as a stored empty string", () => {
    const parsed = ChangeOrderCreateSchema.parse({
      ...CHANGE_ORDER_REQUIRED,
      departmentCode: "",
      vesselAreaId: "",
      riskImpact: "",
      technicalImpact: "",
    });
    expect(parsed.departmentCode).toBeNull();
    expect(parsed.vesselAreaId).toBeNull();
    expect(parsed.riskImpact).toBeNull();
    expect(parsed.technicalImpact).toBeNull();
  });

  it("still accepts a real value on the same fields", () => {
    const parsed = ChangeOrderCreateSchema.parse({
      ...CHANGE_ORDER_REQUIRED,
      departmentCode: "DECK",
      riskImpact: "Low",
    });
    expect(parsed.departmentCode).toBe("DECK");
    expect(parsed.riskImpact).toBe("Low");
  });
});

describe("CrewRequestCreateSchema", () => {
  it("treats a blank optional field as absent, not as a stored empty string", () => {
    const parsed = CrewRequestCreateSchema.parse({
      ...CREW_REQUEST_REQUIRED,
      departmentCode: "",
      vesselAreaId: "",
      assignedToId: "",
      dueDate: "",
      safetyImpact: "",
      linkedChangeOrderId: "",
    });
    expect(parsed.departmentCode).toBeNull();
    expect(parsed.vesselAreaId).toBeNull();
    expect(parsed.assignedToId).toBeNull();
    expect(parsed.dueDate).toBeNull();
    expect(parsed.safetyImpact).toBeNull();
    expect(parsed.linkedChangeOrderId).toBeNull();
  });

  it("a blank due date no longer fails validation (C13)", () => {
    const parsed = ChangeOrderCreateSchema.safeParse(CHANGE_ORDER_REQUIRED);
    expect(parsed.success).toBe(true);
    const cr = CrewRequestCreateSchema.safeParse({ ...CREW_REQUEST_REQUIRED, dueDate: "" });
    expect(cr.success).toBe(true);
  });

  it("a blank linked-change-order select parses to null instead of an id the database will reject (C14)", () => {
    const parsed = CrewRequestCreateSchema.parse({
      ...CREW_REQUEST_REQUIRED,
      linkedChangeOrderId: "",
    });
    expect(parsed.linkedChangeOrderId).toBeNull();
  });

  it("still accepts a real value on the same fields", () => {
    const parsed = CrewRequestCreateSchema.parse({
      ...CREW_REQUEST_REQUIRED,
      assignedToId: "u1",
      linkedChangeOrderId: "co1",
    });
    expect(parsed.assignedToId).toBe("u1");
    expect(parsed.linkedChangeOrderId).toBe("co1");
  });
});

describe("ApprovalDecisionSchema", () => {
  it("an untouched comment textarea parses to null, not an empty string", () => {
    const parsed = ApprovalDecisionSchema.parse({
      approvalId: "a1",
      decision: "APPROVED",
      comment: "",
    });
    expect(parsed.comment).toBeNull();
  });

  it("still accepts a real comment", () => {
    const parsed = ApprovalDecisionSchema.parse({
      approvalId: "a1",
      decision: "REJECTED",
      comment: "Needs more detail.",
    });
    expect(parsed.comment).toBe("Needs more detail.");
  });
});
