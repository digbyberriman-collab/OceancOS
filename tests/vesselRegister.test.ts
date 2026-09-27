import { beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTER_PATH,
  gapVessels,
  missingYardNumbers,
  readVesselRegister,
  type VesselRegister,
} from "@/lib/vessels/workbook";
import { compareWithDatabase } from "@/lib/vessels/comparison";
import {
  buildVesselRecords,
  fillBlanks,
  gapFingerprint,
  observationFingerprint,
  valuesFromEvidence,
} from "@/lib/vessels/importRegister";
import { EVIDENCE_FIELD_MAP, isValidImo, isValidMmsi } from "@/lib/vessels/fields";

// These tests read the committed workbook, so a new edition that changes the
// structure — or the figures they pin — fails here before it reaches a database.

let register: VesselRegister;

beforeAll(async () => {
  register = await readVesselRegister(DEFAULT_REGISTER_PATH);
}, 30_000);

describe("vessel register workbook", () => {
  it("reads every sheet the register is made of", () => {
    expect(register.vessels).toHaveLength(22);
    expect(register.technical).toHaveLength(22);
    expect(register.comparison).toHaveLength(22);
    expect(register.buildSequence).toHaveLength(26);
    expect(register.observations).toHaveLength(444);
    expect(register.sources).toHaveLength(79);
    expect(register.gaps).toHaveLength(22);
  });

  it("reads a vessel's particulars into the right fields", () => {
    const draak = register.vessels.find((v) => v.yardNumber === "Y709")!;
    expect(draak).toMatchObject({
      name: "Draak",
      formerNames: "Equanimity; Tranquility",
      deliveredYear: 2014,
      imo: "1012086",
      mmsi: "319059800",
      callSign: "ZGDQ",
      flag: "Cayman Islands",
      loa: 92.9,
      beam: 14.5,
      grossTonnage: 2894,
    });
    // Excel's serial date 46290.
    expect(draak.checkedOn?.toISOString().slice(0, 10)).toBe("2026-09-25");

    const alfaNero = register.technical.find((t) => t.yardNumber === "Y702")!;
    expect(alfaNero).toMatchObject({
      draft: 3.9,
      hullMaterial: "Steel",
      exteriorDesigner: "Nuvolari Lenard",
      rangeNm: 5500,
      guests: 12,
      crew: 28,
      classSociety: "Lloyd's Register",
    });
  });

  it("treats 'Not verified' as no value rather than as text", () => {
    const vibrant = register.technical.find((t) => t.yardNumber === "Y704")!;
    expect(vibrant.hullMaterial).toBeNull();
    expect(vibrant.classSociety).toBeNull();
    expect(vibrant.exteriorDesigner).toBe("Nuvolari Lenard");
  });

  it("has a well-formed IMO and MMSI for every vessel, and no IMO twice", () => {
    for (const v of register.vessels) {
      expect(isValidImo(v.imo), `${v.yardNumber} IMO ${v.imo}`).toBe(true);
      expect(isValidMmsi(v.mmsi), `${v.yardNumber} MMSI ${v.mmsi}`).toBe(true);
    }
    expect(new Set(register.vessels.map((v) => v.imo)).size).toBe(22);
    expect(new Set(register.vessels.map((v) => v.yardNumber)).size).toBe(22);
  });

  it("maps every evidence label to a field, so no observation is orphaned", () => {
    const unmapped = [...new Set(register.observations.map((o) => o.fieldLabel))].filter(
      (label) => !(label in EVIDENCE_FIELD_MAP)
    );
    expect(unmapped).toEqual([]);
  });

  it("cites only sources that are in the source index", () => {
    const codes = new Set(register.sources.map((s) => s.code));
    const unknown = register.observations.filter((o) => o.sourceCode && !codes.has(o.sourceCode));
    expect(unknown).toEqual([]);
  });

  it("keeps the unmapped build slots as gaps, not vessels", () => {
    const unmapped = register.buildSequence.filter((b) => !b.vesselName).map((b) => b.yardNumber);
    expect(unmapped).toEqual(["Y713", "Y723", "Y724", "Y725"]);
    expect(missingYardNumbers(register.vessels.map((v) => v.yardNumber))).toEqual(unmapped);
  });
});

describe("source comparison", () => {
  it("reaches the workbook's own review flag for every vessel, from observations alone", () => {
    for (const row of register.comparison) {
      const vessel = register.vessels.find((v) => v.yardNumber === row.yardNumber)!;
      const observations = register.observations.filter((o) => o.imo === vessel.imo);
      const result = compareWithDatabase(vessel, observations);
      expect(result.flag, row.yardNumber).toBe(row.reviewFlag);
    }
  });

  it("uses the same database figures the workbook compared against", () => {
    for (const row of register.comparison) {
      const vessel = register.vessels.find((v) => v.yardNumber === row.yardNumber)!;
      const result = compareWithDatabase(
        vessel,
        register.observations.filter((o) => o.imo === vessel.imo)
      );
      const byKey = Object.fromEntries(result.rows.map((r) => [r.key, r]));
      expect(byKey.loa.database, row.yardNumber).toBe(row.databaseLoa);
      expect(byKey.beam.database, row.yardNumber).toBe(row.databaseBeam);
      expect(byKey.grossTonnage.database, row.yardNumber).toBe(row.databaseGt);
      expect(byKey.deliveredYear.database, row.yardNumber).toBe(row.databaseYear);
    }
  });

  it("computes the difference as preferred minus database", () => {
    const result = compareWithDatabase(
      { loa: 80, beam: 14.2, grossTonnage: 2310, deliveredYear: 2007 },
      [
        { fieldLabel: "Database static LOA", value: "80" },
        { fieldLabel: "Database static beam", value: "12" },
        { fieldLabel: "Database static GT", value: "2,310" },
      ]
    );
    expect(result.rows.map((r) => r.delta)).toEqual([0, 2.2, 0, null]);
    expect(result.flag).toBe("REVIEW");
  });

  it("has nothing to say without database figures", () => {
    expect(compareWithDatabase({ loa: 80 }, []).flag).toBe("NO_DATA");
  });
});

describe("data gaps", () => {
  const vessels = [
    { yardNumber: "Y707", name: "Nirvana" },
    { yardNumber: "Y708", name: "Amore Vero" },
    { yardNumber: "Y709", name: "Draak" },
  ];

  it("gives every vessel its own row for a fleet-wide gap", () => {
    expect(gapVessels("All vessels", vessels)).toEqual(["Y707", "Y708", "Y709"]);
  });

  it("resolves a scope by name or yard number", () => {
    expect(gapVessels("Draak / Y709", vessels)).toEqual(["Y709"]);
    expect(gapVessels("Nirvana / Amore Vero", vessels)).toEqual(["Y707", "Y708"]);
  });

  it("leaves a gap about no known vessel at fleet level", () => {
    expect(gapVessels("Y713 / Y723 / Y724 / Y725", vessels)).toEqual([]);
    expect(gapVessels("Scope extension", vessels)).toEqual([]);
  });

  it("expands the committed register to one row per vessel concerned", () => {
    const rows = register.gaps.flatMap((g) => {
      const hits = gapVessels(g.scope, register.vessels);
      return hits.length ? hits : [null];
    });
    // 6 fleet-wide gaps x 22 vessels, 13 single-vessel, 1 pair, 2 fleet-level.
    expect(rows).toHaveLength(6 * 22 + 13 + 2 + 2);
  });
});

describe("import", () => {
  it("joins register, technical and build-sequence rows into one record per vessel", () => {
    const records = buildVesselRecords(register);
    expect(records).toHaveLength(22);
    const black = records.find((r) => r.yardNumber === "Y712")!;
    expect(black).toMatchObject({
      name: "Black Pearl",
      builder: "Oceanco",
      loa: 106.7,
      maxSailSpeed: 30,
      navalArchitect: "Lateral / BMT; Oceanco",
      yardNumberBasis: "AIS database / historical",
      verification: "PUBLIC_SOURCE",
    });
  });

  it("fills fields only the evidence answers", () => {
    const records = new Map(buildVesselRecords(register).map((r) => [r.yardNumber, r]));
    expect(records.get("Y701")?.deadweight).toBe(395);
    expect(records.get("Y702")?.generators).toBe("3 x MTU 332 kW");
    expect(records.get("Y712")?.sailArea).toBe(2877);
  });

  it("leaves a field empty when the evidence is ambiguous or disagrees", () => {
    // AQuiJo's 17 kn is published without saying whether under sail or power.
    const aquijo = buildVesselRecords(register).find((r) => r.yardNumber === "Y711")!;
    expect(aquijo.maxSpeed).toBeNull();

    expect(
      valuesFromEvidence({ deadweight: null }, [
        { fieldLabel: "Database deadweight", value: "395" },
        { fieldLabel: "Database deadweight", value: "401" },
      ])
    ).toEqual({});
  });

  it("does not take a source's placeholder for a value", () => {
    // Alone, a placeholder fills nothing; beside a real figure, it does not block it.
    expect(valuesFromEvidence({ deadweight: null }, [{ fieldLabel: "Database deadweight", value: "Not verified" }])).toEqual({});
    expect(
      valuesFromEvidence({ deadweight: null }, [
        { fieldLabel: "Database deadweight", value: "395" },
        { fieldLabel: "Database deadweight", value: "n/a" },
        { fieldLabel: "Database deadweight", value: "—" },
      ])
    ).toEqual({ deadweight: 395 });
  });

  it("never replaces a value the register sheets already give", () => {
    // Builder beam 14.2 m is preferred over the database's 12 m.
    const batello = buildVesselRecords(register).find((r) => r.yardNumber === "Y701")!;
    expect(batello.beam).toBe(14.2);
    expect(valuesFromEvidence({ beam: 14.2 }, [{ fieldLabel: "Database static beam", value: "12" }])).toEqual({});
  });

  it("fills blanks and leaves held values alone", () => {
    const existing = { name: "Draak", flag: "Malta", beam: null, crew: 0 };
    const incoming = { name: "DRAAK", flag: "Cayman Islands", beam: 14.5, crew: 30 };
    expect(fillBlanks(existing, incoming)).toEqual({ beam: 14.5 });
    expect(fillBlanks(existing, incoming, true)).toEqual({
      name: "DRAAK",
      flag: "Cayman Islands",
      beam: 14.5,
      crew: 30,
    });
  });

  it("never blanks a value the workbook has none for", () => {
    expect(fillBlanks({ flag: "Malta" }, { flag: null }, true)).toEqual({});
  });

  it("fingerprints observations and gaps stably, and distinctly per vessel", () => {
    const o = register.observations[0];
    expect(observationFingerprint(o)).toBe(observationFingerprint({ ...o }));
    expect(observationFingerprint(o)).not.toBe(observationFingerprint({ ...o, value: "other" }));
    const fingerprints = new Set(register.observations.map(observationFingerprint));
    expect(fingerprints.size).toBe(register.observations.length);

    const gap = register.gaps[0];
    expect(gapFingerprint(gap, "Y701")).not.toBe(gapFingerprint(gap, "Y702"));
    expect(gapFingerprint(gap, null)).toBe(gapFingerprint({ ...gap }, null));
  });
});
