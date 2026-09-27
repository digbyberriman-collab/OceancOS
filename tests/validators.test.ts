import { describe, it, expect } from "vitest";
import {
  ApprovalDecisionSchema,
  ChangeOrderCreateSchema,
  CrewRequestCreateSchema,
  ProjectStatusSchema,
  ScopeItemSchema,
  YardPeriodRecordSchema,
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

describe("ProjectStatusSchema", () => {
  it("admits the three project statuses only", () => {
    for (const s of ["ACTIVE", "PLANNED", "COMPLETED"]) expect(ProjectStatusSchema.safeParse(s).success).toBe(true);
    expect(ProjectStatusSchema.safeParse("ARCHIVED").success).toBe(false);
  });
});

describe("YardPeriodRecordSchema", () => {
  const record = { periodType: "Dry-dock / maintenance", startLabel: "2012-Q2", endLabel: "2012-Q2" };

  it("accepts a period with its dates as published and nothing else", () => {
    const parsed = YardPeriodRecordSchema.parse(record);
    expect(parsed.startLabel).toBe("2012-Q2");
    expect(parsed.yardText ?? null).toBeNull();
  });

  it("turns blank optional fields into null, not empty strings", () => {
    const parsed = YardPeriodRecordSchema.parse({ ...record, yardText: "  ", costBandLabel: "", confidence: "" });
    expect(parsed.yardText).toBeNull();
    expect(parsed.costBandLabel).toBeNull();
    expect(parsed.confidence).toBeNull();
  });

  it("refuses a date the source could not have published", () => {
    const result = YardPeriodRecordSchema.safeParse({ ...record, startLabel: "mid-2012" });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].message).toMatch(/as the source gives it/);
  });

  it("refuses a period that ends before it starts", () => {
    const result = YardPeriodRecordSchema.safeParse({ ...record, startLabel: "2014", endLabel: "2013" });
    expect(result.success).toBe(false);
    expect(result.error?.errors[0].message).toBe("The period ends before it starts.");
  });

  it("accepts a planning band only in the register's form", () => {
    expect(YardPeriodRecordSchema.safeParse({ ...record, costBandLabel: "€30m–€70m+" }).success).toBe(true);
    expect(YardPeriodRecordSchema.safeParse({ ...record, costBandLabel: "about 3 million" }).success).toBe(false);
  });

  it("admits an undated period", () => {
    expect(
      YardPeriodRecordSchema.safeParse({ ...record, startLabel: "Date unverified", endLabel: "Date unverified" }).success
    ).toBe(true);
  });
});

describe("ScopeItemSchema", () => {
  it("needs a known discipline and a description", () => {
    expect(ScopeItemSchema.safeParse({ discipline: "GENERAL", description: "Hull survey" }).success).toBe(true);
    expect(ScopeItemSchema.safeParse({ discipline: "PAINT", description: "Hull survey" }).success).toBe(false);
    expect(ScopeItemSchema.safeParse({ discipline: "GENERAL", description: " " }).success).toBe(false);
  });
});
