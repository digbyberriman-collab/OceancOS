import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  EVIDENCE_FIELD_MAP,
  VESSEL_FIELDS,
  VESSEL_SECTIONS,
  conflictingObservations,
  formatVesselValue,
  isValidImo,
  isValidMmsi,
  isWebUrl,
  vesselCompleteness,
  vesselField,
} from "@/lib/vessels/fields";

describe("vessel field catalogue", () => {
  it("describes only columns that exist on Vessel", () => {
    const columns = new Set(Object.values(Prisma.VesselScalarFieldEnum));
    const unknown = VESSEL_FIELDS.map((f) => f.key).filter((key) => !columns.has(key));
    expect(unknown).toEqual([]);
  });

  it("lists each field once", () => {
    const keys = VESSEL_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("maps evidence only onto catalogue fields", () => {
    const keys = new Set(VESSEL_FIELDS.map((f) => f.key));
    for (const [label, key] of Object.entries(EVIDENCE_FIELD_MAP)) {
      expect(keys.has(key), label).toBe(true);
    }
  });

  it("gives every numeric measurement a unit", () => {
    const counts = new Set(["guests", "guestCabins", "crew", "maxPersonsOnBoard"]);
    for (const f of VESSEL_FIELDS) {
      if ((f.kind === "decimal" || f.kind === "int") && !counts.has(f.key)) {
        expect(f.unit, f.key).toBeTruthy();
      }
    }
  });
});

describe("formatVesselValue", () => {
  it("returns null for a blank so the caller shows its placeholder", () => {
    expect(formatVesselValue(vesselField("beam"), null)).toBeNull();
    expect(formatVesselValue(vesselField("flag"), "  ")).toBeNull();
  });

  it("adds the unit and groups thousands for measurements", () => {
    expect(formatVesselValue(vesselField("loa"), 92.9)).toBe("92.9 m");
    expect(formatVesselValue(vesselField("grossTonnage"), 4978)).toBe("4,978 GT");
    expect(formatVesselValue(vesselField("rangeNm"), 5500)).toBe("5,500 nm");
    expect(formatVesselValue(vesselField("guests"), 12)).toBe("12");
  });

  it("does not group years", () => {
    expect(formatVesselValue(vesselField("deliveredYear"), 2014)).toBe("2014");
  });

  it("formats a date without shifting it by time zone", () => {
    // "Sep" or "Sept" depending on the ICU data Node ships with.
    expect(formatVesselValue(vesselField("particularsCheckedOn"), new Date("2026-09-25T00:00:00Z"))).toMatch(
      /^25 Sept? 2026$/
    );
  });
});

describe("vesselCompleteness", () => {
  const particulars = VESSEL_SECTIONS.filter((s) => !s.reference).flatMap((s) => s.fields);

  it("counts particulars, not notes and links", () => {
    const result = vesselCompleteness({ name: "Draak", notes: "a note", builderUrl: "https://example.com" });
    expect(result.total).toBe(particulars.length);
    expect(result.filled).toBe(1);
    expect(result.missing).not.toContain("name");
  });

  it("reaches 100% only when every particular is recorded", () => {
    const full = Object.fromEntries(particulars.map((f) => [f.key, f.kind === "text" ? "x" : 1]));
    expect(vesselCompleteness(full).pct).toBe(100);
  });
});

describe("identifiers", () => {
  it("accepts IMO numbers whose check digit is right", () => {
    expect(isValidImo("9074729")).toBe(true); // the IMO's own worked example
    expect(isValidImo("IMO 1012086")).toBe(true);
  });

  it("rejects malformed IMO numbers", () => {
    expect(isValidImo("9074728")).toBe(false);
    expect(isValidImo("123456")).toBe(false);
    expect(isValidImo(null)).toBe(false);
  });

  it("links only web addresses", () => {
    expect(isWebUrl("https://www.oceancoyacht.com/fleet/draak/")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("see broker listing")).toBe(false);
    expect(isWebUrl(null)).toBe(false);
  });

  it("wants nine digits for an MMSI", () => {
    expect(isValidMmsi("319059800")).toBe(true);
    expect(isValidMmsi("31905980")).toBe(false);
  });
});

describe("conflictingObservations", () => {
  const obs = (fieldKey: string, value: string) => ({ fieldKey, value });

  it("flags a figure that differs from the preferred one", () => {
    const found = conflictingObservations(vesselField("beam"), 14.2, [
      obs("beam", "14.2"),
      obs("beam", "12"),
      obs("loa", "80"),
    ]);
    expect(found.map((o) => o.value)).toEqual(["12"]);
  });

  it("allows for rounding in published figures", () => {
    expect(conflictingObservations(vesselField("loa"), 90.13, [obs("loa", "90.13")])).toEqual([]);
    expect(conflictingObservations(vesselField("grossTonnage"), 4550, [obs("grossTonnage", "4,550")])).toEqual([]);
  });

  it("compares identifiers as text", () => {
    expect(conflictingObservations(vesselField("callSign"), "ZGDQ", [obs("callSign", "zgdq ")])).toEqual([]);
    expect(conflictingObservations(vesselField("callSign"), "ZGDQ", [obs("callSign", "ZGDX")])).toHaveLength(1);
  });

  it("does not call differently worded descriptions a conflict", () => {
    expect(
      conflictingObservations(vesselField("exteriorDesigner"), "Nuvolari Lenard", [
        obs("exteriorDesigner", "Nuvolari-Lenard"),
      ])
    ).toEqual([]);
  });

  it("has nothing to conflict with when no value is preferred yet", () => {
    expect(conflictingObservations(vesselField("deadweight"), null, [obs("deadweight", "395")])).toEqual([]);
  });
});
