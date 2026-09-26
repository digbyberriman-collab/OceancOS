// Reading the vessel register workbook.
//
// The register is a researched, public-source compilation kept as an Excel
// workbook: one sheet of preferred particulars per IMO, and beside it the
// technical particulars, the sourced observations behind every figure, the
// source index and the open data gaps. This module turns a workbook into typed
// records and nothing more — no database — so the parsing rules are testable
// against the committed file.
//
// Columns are found by their header text, not their letter, so a column moved
// in a later edition still parses, and a column renamed or removed fails loudly
// instead of loading the wrong figure into the wrong field.

import type { Workbook, Worksheet, CellValue } from "exceljs";
import { isNoValueText } from "./fields";

/** The committed register, relative to the repository root. */
export const DEFAULT_REGISTER_PATH = "prisma/data/Oceanco_Y700_Vessel_Register_2026-09-25_v1.1.xlsx";

export type RegisterVessel = {
  yardNumber: string;
  name: string;
  formerNames: string | null;
  deliveredYear: number | null;
  vesselType: string | null;
  imo: string;
  mmsi: string | null;
  callSign: string | null;
  flag: string | null;
  loa: number | null;
  beam: number | null;
  grossTonnage: number | null;
  dimensionsBasis: string | null;
  tonnageBasis: string | null;
  identityNote: string | null;
  dimensionsNote: string | null;
  builderUrl: string | null;
  databaseUrl: string | null;
  identitySupplementUrl: string | null;
  checkedOn: Date | null;
};

export type RegisterTechnical = {
  yardNumber: string;
  draft: number | null;
  hullMaterial: string | null;
  superstructureMaterial: string | null;
  navalArchitect: string | null;
  exteriorDesigner: string | null;
  interiorDesigner: string | null;
  mainMachinery: string | null;
  propulsion: string | null;
  cruiseSpeed: number | null;
  maxSpeed: number | null;
  maxSailSpeed: number | null;
  rangeNm: number | null;
  guests: number | null;
  guestCabins: number | null;
  crew: number | null;
  classSociety: string | null;
  lastRefitYear: number | null;
  features: string | null;
  technicalNote: string | null;
};

export type RegisterComparison = {
  yardNumber: string;
  preferredLoa: number | null;
  databaseLoa: number | null;
  preferredBeam: number | null;
  databaseBeam: number | null;
  workingGt: number | null;
  databaseGt: number | null;
  builderYear: number | null;
  databaseYear: number | null;
  reviewFlag: string | null;
};

export type RegisterBuildSlot = {
  yardNumber: string;
  vesselName: string | null;
  imo: string | null;
  deliveredYear: number | null;
  scopeStatus: string | null;
  evidenceType: string | null;
  sourceCode: string | null;
  sourceUrl: string | null;
  qualification: string | null;
};

export type RegisterObservation = {
  yardNumber: string;
  imo: string;
  fieldLabel: string;
  value: string;
  unit: string | null;
  basis: string | null;
  qualification: string | null;
  sourceCode: string | null;
  sourceUrl: string | null;
  checkedOn: Date | null;
};

export type RegisterSource = {
  code: string;
  publisher: string | null;
  sourceType: string | null;
  scope: string | null;
  fieldsSupported: string | null;
  url: string | null;
  accessedOn: Date | null;
  limitations: string | null;
};

export type RegisterGap = {
  priority: string;
  scope: string;
  issue: string;
  treatment: string | null;
  evidenceNeeded: string | null;
  status: string;
  reference: string | null;
};

export type VesselRegister = {
  vessels: RegisterVessel[];
  technical: RegisterTechnical[];
  comparison: RegisterComparison[];
  buildSequence: RegisterBuildSlot[];
  observations: RegisterObservation[];
  sources: RegisterSource[];
  gaps: RegisterGap[];
};

// ---------- Cells ----------

type Plain = string | number | Date | null;

/** Flatten exceljs' cell shapes (rich text, hyperlinks, formulas) to a value. */
function plain(value: CellValue): Plain {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) return value;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("result" in value) return plain((value.result ?? null) as CellValue);
    if ("text" in value) return plain(value.text as CellValue);
    if ("error" in value) return null;
  }
  return null;
}

function text(value: Plain): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  return isNoValueText(s) ? null : s;
}

function num(value: Plain): number | null {
  if (value == null || value instanceof Date) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = value.replace(/,/g, "").trim();
  if (isNoValueText(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function int(value: Plain): number | null {
  const n = num(value);
  return n == null ? null : Math.round(n);
}

/** Excel stores dates as days since 1899-12-30; some cells arrive that way. */
export function excelDate(value: Plain): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An identifier kept as text even when Excel stored it as a number. */
function ident(value: Plain): string | null {
  if (typeof value === "number") return String(Math.trunc(value));
  return text(value);
}

// ---------- Tables ----------

function normaliseHeader(value: Plain): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type Row = { get(header: string): Plain; rowNumber: number };

/**
 * Rows of a sheet's table. The header row is the first whose first cell is
 * `firstHeader`; rows end at the first blank key cell. Every header in
 * `required` must be present.
 */
function readTable(wb: Workbook, sheetName: string, firstHeader: string, required: string[]): Row[] {
  const ws: Worksheet | undefined = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Vessel register: sheet "${sheetName}" is missing.`);

  let headerRow = 0;
  const columns = new Map<string, number>();
  ws.eachRow((row, rowNumber) => {
    if (headerRow) return;
    if (normaliseHeader(plain(row.getCell(1).value)) === normaliseHeader(firstHeader)) {
      headerRow = rowNumber;
      row.eachCell((cell, col) => columns.set(normaliseHeader(plain(cell.value)), col));
    }
  });
  if (!headerRow) throw new Error(`Vessel register: no "${firstHeader}" header row on "${sheetName}".`);

  const missing = required.filter((h) => !columns.has(normaliseHeader(h)));
  if (missing.length) {
    throw new Error(`Vessel register: "${sheetName}" is missing column(s): ${missing.join(", ")}.`);
  }

  const rows: Row[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const key = text(plain(row.getCell(1).value));
    if (!key) break;
    rows.push({
      rowNumber: r,
      get(header: string) {
        const col = columns.get(normaliseHeader(header));
        if (!col) throw new Error(`Vessel register: "${sheetName}" has no column "${header}".`);
        return plain(row.getCell(col).value);
      },
    });
  }
  return rows;
}

// ---------- Sheets ----------

const VESSEL_HEADERS = [
  "Yard ID", "Published vessel name", "Former names / aliases", "Delivered (year)", "Vessel type",
  "IMO", "MMSI", "Call sign", "Published flag", "Preferred LOA (m)", "Preferred beam (m)", "Working GT",
  "LOA / beam basis", "GT basis / qualification", "Identity qualification", "Dimensions / name notes",
  "Builder URL", "Database URL", "Identity supplement URL", "Checked on",
];

const TECHNICAL_HEADERS = [
  "Yard ID", "Vessel", "Draft (m) [published]", "Hull", "Superstructure",
  "Naval architecture / engineering", "Exterior design", "Interior design", "Main machinery",
  "Propulsion / energy", "Cruise (kn)", "Max motor (kn)", "Max sail (kn)", "Range (nm)",
  "Guests [published]", "Guest cabins", "Crew [published]", "Class society [published]",
  "Refit/rebuild identified", "Selected features", "Qualification",
];

// The sheet's delta columns are formulas, and exceljs drops a cached result of
// 0, so a zero difference would read as "unknown". The deltas are derived in
// comparison.ts from the two values instead.
const COMPARISON_HEADERS = [
  "Yard ID", "Preferred LOA (m)", "VF static LOA (m)", "Preferred beam (m)", "VF static beam (m)",
  "Working GT", "VF static GT", "Builder delivery year", "VF build year [checked]", "Review flag",
];

const BUILD_HEADERS = [
  "Build code", "Mapped vessel", "IMO", "Delivered (year)", "Scope status", "Mapping evidence type",
  "Mapping source ID", "Mapping source URL", "Qualification",
];

const EVIDENCE_HEADERS = [
  "Yard ID", "IMO", "Field", "Observed value", "Unit", "Observation basis", "Qualification",
  "Source ID", "Source URL", "Checked on",
];

const SOURCE_HEADERS = [
  "Source ID", "Publisher", "Source type", "Vessel / scope", "Fields supported", "Source URL",
  "Access date", "Limitations / context",
];

const GAP_HEADERS = [
  "Priority", "Scope / vessel", "Field or issue", "Treatment in this release", "Evidence needed to close",
  "Status", "Source / reference",
];

/** Parse an opened workbook. Throws on any structural problem. */
export function parseVesselRegister(wb: Workbook): VesselRegister {
  const vessels = readTable(wb, "Vessel Register", "Yard ID", VESSEL_HEADERS).map((r) => {
    const imo = ident(r.get("IMO"));
    if (!imo) throw new Error(`Vessel register: row ${r.rowNumber} has no IMO.`);
    return {
      yardNumber: text(r.get("Yard ID"))!,
      name: text(r.get("Published vessel name")) ?? "",
      formerNames: text(r.get("Former names / aliases")),
      deliveredYear: int(r.get("Delivered (year)")),
      vesselType: text(r.get("Vessel type")),
      imo,
      mmsi: ident(r.get("MMSI")),
      callSign: text(r.get("Call sign")),
      flag: text(r.get("Published flag")),
      loa: num(r.get("Preferred LOA (m)")),
      beam: num(r.get("Preferred beam (m)")),
      grossTonnage: int(r.get("Working GT")),
      dimensionsBasis: text(r.get("LOA / beam basis")),
      tonnageBasis: text(r.get("GT basis / qualification")),
      identityNote: text(r.get("Identity qualification")),
      dimensionsNote: text(r.get("Dimensions / name notes")),
      builderUrl: text(r.get("Builder URL")),
      databaseUrl: text(r.get("Database URL")),
      identitySupplementUrl: text(r.get("Identity supplement URL")),
      checkedOn: excelDate(r.get("Checked on")),
    };
  });

  const technical = readTable(wb, "Technical Particulars", "Yard ID", TECHNICAL_HEADERS).map((r) => ({
    yardNumber: text(r.get("Yard ID"))!,
    draft: num(r.get("Draft (m) [published]")),
    hullMaterial: text(r.get("Hull")),
    superstructureMaterial: text(r.get("Superstructure")),
    navalArchitect: text(r.get("Naval architecture / engineering")),
    exteriorDesigner: text(r.get("Exterior design")),
    interiorDesigner: text(r.get("Interior design")),
    mainMachinery: text(r.get("Main machinery")),
    propulsion: text(r.get("Propulsion / energy")),
    cruiseSpeed: num(r.get("Cruise (kn)")),
    maxSpeed: num(r.get("Max motor (kn)")),
    maxSailSpeed: num(r.get("Max sail (kn)")),
    rangeNm: int(r.get("Range (nm)")),
    guests: int(r.get("Guests [published]")),
    guestCabins: int(r.get("Guest cabins")),
    crew: int(r.get("Crew [published]")),
    classSociety: text(r.get("Class society [published]")),
    lastRefitYear: int(r.get("Refit/rebuild identified")),
    features: text(r.get("Selected features")),
    technicalNote: text(r.get("Qualification")),
  }));

  const comparison = readTable(wb, "Source Comparison", "Yard ID", COMPARISON_HEADERS).map((r) => ({
    yardNumber: text(r.get("Yard ID"))!,
    preferredLoa: num(r.get("Preferred LOA (m)")),
    databaseLoa: num(r.get("VF static LOA (m)")),
    preferredBeam: num(r.get("Preferred beam (m)")),
    databaseBeam: num(r.get("VF static beam (m)")),
    workingGt: num(r.get("Working GT")),
    databaseGt: num(r.get("VF static GT")),
    builderYear: int(r.get("Builder delivery year")),
    databaseYear: int(r.get("VF build year [checked]")),
    reviewFlag: text(r.get("Review flag")),
  }));

  const buildSequence = readTable(wb, "Build Sequence", "Build code", BUILD_HEADERS).map((r) => {
    const name = text(r.get("Mapped vessel"));
    return {
      yardNumber: text(r.get("Build code"))!,
      vesselName: name && name.toLowerCase() !== "unmapped" ? name : null,
      imo: ident(r.get("IMO")),
      deliveredYear: int(r.get("Delivered (year)")),
      scopeStatus: text(r.get("Scope status")),
      evidenceType: text(r.get("Mapping evidence type")),
      sourceCode: text(r.get("Mapping source ID")),
      sourceUrl: text(r.get("Mapping source URL")),
      qualification: text(r.get("Qualification")),
    };
  });

  const observations = readTable(wb, "Field Evidence", "Yard ID", EVIDENCE_HEADERS).map((r) => {
    const imo = ident(r.get("IMO"));
    const fieldLabel = text(r.get("Field"));
    if (!imo || !fieldLabel) throw new Error(`Vessel register: evidence row ${r.rowNumber} has no IMO or field.`);
    // A value the source genuinely published as "Not verified" is still an
    // observation; keep the literal text rather than dropping the row.
    const raw = r.get("Observed value");
    const value = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? "").trim();
    return {
      yardNumber: text(r.get("Yard ID"))!,
      imo,
      fieldLabel,
      value,
      unit: text(r.get("Unit")),
      basis: text(r.get("Observation basis")),
      qualification: text(r.get("Qualification")),
      sourceCode: text(r.get("Source ID")),
      sourceUrl: text(r.get("Source URL")),
      checkedOn: excelDate(r.get("Checked on")),
    };
  });

  const sources = readTable(wb, "Sources", "Source ID", SOURCE_HEADERS).map((r) => ({
    code: text(r.get("Source ID"))!,
    publisher: text(r.get("Publisher")),
    sourceType: text(r.get("Source type")),
    scope: text(r.get("Vessel / scope")),
    fieldsSupported: text(r.get("Fields supported")),
    url: text(r.get("Source URL")),
    accessedOn: excelDate(r.get("Access date")),
    limitations: text(r.get("Limitations / context")),
  }));

  const gaps = readTable(wb, "Data Gaps", "Priority", GAP_HEADERS).map((r) => ({
    priority: normaliseKey(text(r.get("Priority")) ?? "MEDIUM"),
    scope: text(r.get("Scope / vessel")) ?? "",
    issue: text(r.get("Field or issue")) ?? "",
    treatment: text(r.get("Treatment in this release")),
    evidenceNeeded: text(r.get("Evidence needed to close")),
    status: normaliseKey(text(r.get("Status")) ?? "OPEN"),
    reference: text(r.get("Source / reference")),
  }));

  return { vessels, technical, comparison, buildSequence, observations, sources, gaps };
}

/** "In progress" → "IN_PROGRESS", matching the status keys used elsewhere. */
function normaliseKey(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

const SPREADSHEETML = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/**
 * Rewrite a package so exceljs can read it.
 *
 * Files written by the OpenXML SDK (and tools built on it) qualify every
 * element with a namespace prefix — `<x:worksheet>`, `<x:c>` — open each part
 * with a byte-order mark, and address parts by absolute path. All three are
 * valid, but exceljs matches element names literally and resolves parts
 * relative to their folder, so it finds no workbook at all. Rewriting them
 * yields the same document in the form exceljs expects; files that never had
 * any of these pass through unchanged.
 */
export async function normaliseOpenXml(buffer: Buffer): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const { posix } = await import("node:path");
  const zip = await JSZip.loadAsync(buffer);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.(xml|rels)$/i.test(entry.name)) continue;
    let xml = await entry.async("string");
    xml = xml.replace(/^﻿/, "");
    if (entry.name.endsWith(".rels")) {
      // "xl/worksheets/_rels/sheet2.xml.rels" describes parts of "xl/worksheets/".
      const base = posix.dirname(posix.dirname(entry.name.replace(/^\//, "")));
      xml = xml.replace(/Target="\/([^"]+)"/g, (_, target: string) => {
        const relative = posix.relative(base === "." ? "" : base, target);
        return `Target="${relative}"`;
      });
    }
    const bound = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)="${SPREADSHEETML.replace(/[./]/g, "\\$&")}"`).exec(xml);
    if (bound) {
      const prefix = bound[1];
      xml = xml
        .replace(new RegExp(`<(/?)${prefix}:`, "g"), "<$1")
        .replace(bound[0], `xmlns="${SPREADSHEETML}"`);
    }
    zip.file(entry.name, xml);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Open and parse a workbook from disk. exceljs is loaded only when needed. */
export async function readVesselRegister(path: string): Promise<VesselRegister> {
  const { readFile } = await import("node:fs/promises");
  const ExcelJS = await import("exceljs");
  const Ctor = (ExcelJS as unknown as { default?: typeof ExcelJS }).default ?? ExcelJS;
  const wb = new Ctor.Workbook();
  const buffer = await normaliseOpenXml(await readFile(path));
  // exceljs is typed against an older Buffer declaration; the value is the same.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return parseVesselRegister(wb);
}

// ---------- Derived ----------

/**
 * Which vessels a data gap is about. "All vessels" means each of them — every
 * vessel's certificates are chased separately, so each gets its own row.
 * A scope naming vessels or yard numbers ("Draak / Y709", "Nirvana / Amore
 * Vero") resolves to those. Anything that names no known vessel — unmapped
 * build slots, the scope of the register itself — is a fleet-level gap and
 * returns an empty list.
 */
export function gapVessels(scope: string, vessels: Pick<RegisterVessel, "yardNumber" | "name">[]): string[] {
  if (/^all vessels$/i.test(scope.trim())) return vessels.map((v) => v.yardNumber);

  const byKey = new Map<string, string>();
  for (const v of vessels) {
    byKey.set(v.yardNumber.toLowerCase(), v.yardNumber);
    byKey.set(v.name.toLowerCase(), v.yardNumber);
  }

  const matched = new Set<string>();
  for (const token of scope.split("/")) {
    const hit = byKey.get(token.trim().toLowerCase());
    if (hit) matched.add(hit);
  }
  return [...matched];
}

/**
 * Numbers missing from each yard-number series, e.g. Y713 between Y712 and
 * Y714. A gap in the numbering is reported as unmapped, never as a vessel.
 */
export function missingYardNumbers(yardNumbers: (string | null | undefined)[]): string[] {
  const series = new Map<string, { width: number; numbers: Set<number> }>();
  for (const code of yardNumbers) {
    const m = /^([A-Za-z]*)(\d+)$/.exec(String(code ?? "").trim());
    if (!m) continue;
    const entry = series.get(m[1]) ?? { width: m[2].length, numbers: new Set<number>() };
    entry.numbers.add(Number(m[2]));
    series.set(m[1], entry);
  }

  const missing: string[] = [];
  for (const [prefix, { width, numbers }] of series) {
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let n = sorted[0]; n <= sorted[sorted.length - 1]; n++) {
      if (!numbers.has(n)) missing.push(`${prefix}${String(n).padStart(width, "0")}`);
    }
  }
  return missing;
}
