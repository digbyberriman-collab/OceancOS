import { describe, expect, it } from "vitest";
import { changedFields, observationText, parseVesselForm } from "@/lib/vessels/edit";

describe("parseVesselForm", () => {
  it("reads each field by its kind", () => {
    const { data, problems } = parseVesselForm({
      name: " Draak ",
      yardNumber: "y 709",
      imo: "IMO 1012086",
      callSign: "zgdq",
      loa: "92.9",
      grossTonnage: "2,894",
      deliveredYear: "2014",
      particularsCheckedOn: "2026-09-25",
      builderUrl: "https://www.oceancoyacht.com/fleet/draak/",
      portOfRegistry: "",
    });
    expect(problems).toEqual([]);
    expect(data).toEqual({
      name: "Draak",
      yardNumber: "Y709",
      imo: "1012086",
      callSign: "ZGDQ",
      loa: 92.9,
      grossTonnage: 2894,
      deliveredYear: 2014,
      particularsCheckedOn: new Date("2026-09-25T00:00:00.000Z"),
      builderUrl: "https://www.oceancoyacht.com/fleet/draak/",
      portOfRegistry: null,
    });
  });

  it("leaves out fields that were not submitted, so a partial form blanks nothing", () => {
    const { data } = parseVesselForm({ flag: "Malta" });
    expect(Object.keys(data)).toEqual(["flag"]);
  });

  it("refuses values that cannot be true", () => {
    const { problems } = parseVesselForm({
      name: "",
      imo: "1012087",
      mmsi: "31905980",
      beam: "-1",
      guests: "12.5",
      deliveredYear: "207",
      builderUrl: "javascript:alert(1)",
      particularsCheckedOn: "25/09/2026",
    });
    expect(problems.map((p) => p.field).sort()).toEqual(
      ["beam", "builderUrl", "deliveredYear", "guests", "imo", "mmsi", "name", "particularsCheckedOn"].sort()
    );
  });
});

describe("changedFields", () => {
  it("reports only real changes, treating blank and null alike", () => {
    const existing = {
      flag: "Malta",
      loa: 92.9,
      portOfRegistry: null,
      particularsCheckedOn: new Date("2026-09-25T00:00:00Z"),
    };
    const incoming = {
      flag: "Cayman Islands",
      loa: 92.9,
      portOfRegistry: null,
      particularsCheckedOn: new Date("2026-09-25T00:00:00Z"),
    };
    expect(changedFields(existing, incoming)).toEqual(["flag"]);
  });

  it("counts clearing a value as a change", () => {
    expect(changedFields({ flag: "Malta" }, { flag: null })).toEqual(["flag"]);
  });
});

describe("observationText", () => {
  it("stores dates as ISO days and numbers plainly", () => {
    expect(observationText(new Date("2026-09-25T00:00:00Z"))).toBe("2026-09-25");
    expect(observationText(4550)).toBe("4550");
    expect(observationText(null)).toBeNull();
  });
});
