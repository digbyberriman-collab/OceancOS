import { describe, it, expect } from "vitest";
import {
  csvCell,
  exportFilename,
  safeSheetName,
  toCsv,
  toGrid,
  type Sheet,
} from "@/lib/export/table";

type Job = { code: string; title: string; cost: number; approved: number | null; raised: Date };

const sheet: Sheet<Job> = {
  name: "Change orders",
  rows: [
    { code: "CO-0001", title: "Carpet", cost: 1000, approved: 900, raised: new Date("2026-03-01") },
    { code: "CO-0002", title: "Teak", cost: 2500, approved: null, raised: new Date("2026-03-04") },
  ],
  totals: ["Cost"],
  columns: [
    { header: "Code", type: "text", value: (r) => r.code },
    { header: "Title", type: "text", value: (r) => r.title },
    { header: "Cost", type: "money", value: (r) => r.cost },
    { header: "Approved", type: "money", value: (r) => r.approved },
    { header: "Raised", type: "date", value: (r) => r.raised },
  ],
};

describe("toGrid", () => {
  it("emits a header and one row per record", () => {
    const grid = toGrid(sheet);
    expect(grid.header).toEqual(["Code", "Title", "Cost", "Approved", "Raised"]);
    expect(grid.body).toHaveLength(2);
    expect(grid.body[0][0]).toBe("CO-0001");
  });

  it("keeps values typed so a spreadsheet can sum them", () => {
    const grid = toGrid(sheet);
    expect(typeof grid.body[0][2]).toBe("number");
    expect(grid.body[0][4]).toBeInstanceOf(Date);
  });

  it("totals only the named columns", () => {
    const grid = toGrid(sheet);
    expect(grid.totals).toEqual(["Total", null, 3500, null, null]);
  });

  it("treats a null as zero when totalling", () => {
    const grid = toGrid({ ...sheet, totals: ["Approved"] });
    expect(grid.totals?.[3]).toBe(900);
  });

  it("omits the totals row when none is asked for", () => {
    expect(toGrid({ ...sheet, totals: undefined }).totals).toBeNull();
  });

  it("handles an empty sheet", () => {
    const grid = toGrid({ ...sheet, rows: [] });
    expect(grid.body).toEqual([]);
    expect(grid.totals?.[2]).toBe(0);
  });
});

describe("safeSheetName", () => {
  it("keeps an ordinary name", () => {
    expect(safeSheetName("Change orders")).toBe("Change orders");
  });

  it("strips the characters Excel refuses", () => {
    expect(safeSheetName("R-00721: Q1/Q2 [draft]?*")).toBe("R-00721 Q1 Q2 draft");
  });

  it("caps at the 31-character limit", () => {
    expect(safeSheetName("a".repeat(60))).toHaveLength(31);
  });

  it("never returns an empty name", () => {
    expect(safeSheetName("")).toBe("Sheet");
    expect(safeSheetName("///")).toBe("Sheet");
  });
});

describe("csvCell", () => {
  it("passes plain values through", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(42)).toBe("42");
  });

  it("is empty for null", () => {
    expect(csvCell(null)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("writes a date as an ISO day", () => {
    expect(csvCell(new Date("2026-03-01T12:00:00Z"))).toBe("2026-03-01");
  });
});

describe("toCsv", () => {
  it("writes a header, the rows and the totals", () => {
    const lines = toCsv(sheet).split("\r\n");
    expect(lines[0]).toBe("Code,Title,Cost,Approved,Raised");
    expect(lines[1]).toBe("CO-0001,Carpet,1000,900,2026-03-01");
    expect(lines[2]).toBe("CO-0002,Teak,2500,,2026-03-04");
    expect(lines[3]).toBe("Total,,3500,,");
  });

  it("escapes a title containing a comma", () => {
    const withComma: Sheet<Job> = {
      ...sheet,
      rows: [{ ...sheet.rows[0], title: "Carpet, bespoke" }],
      totals: undefined,
    };
    expect(toCsv(withComma)).toContain('"Carpet, bespoke"');
  });
});

describe("exportFilename", () => {
  const when = new Date("2026-09-20T10:00:00Z");

  it("slugs the base and stamps the date", () => {
    expect(exportFilename("Change Orders", "xlsx", when)).toBe("change-orders-2026-09-20.xlsx");
  });

  it("collapses punctuation rather than emitting it", () => {
    expect(exportFilename("CO-0001 / rev 2", "pdf", when)).toBe("co-0001-rev-2-2026-09-20.pdf");
  });

  it("falls back when the base reduces to nothing", () => {
    expect(exportFilename("///", "csv", when)).toBe("export-2026-09-20.csv");
  });

  it("produces a name with no characters that need escaping", () => {
    expect(exportFilename("A b/c:d", "xlsx", when)).toMatch(/^[a-z0-9.\-]+$/);
  });
});
