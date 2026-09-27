// Reading the yard-period register workbook.
//
// The Oceanco Y7xx Refit & Historical Yard-Period Register is a public-source
// compilation of every post-delivery refit, rebuild, repair, survey and
// significant yard stay found for the Y7xx vessels. This module turns it into
// typed records and nothing more — no database — so the parsing rules are
// testable against the committed file.
//
// Sheets read, by header text (lib/xlsx/workbook.ts):
//   Master Yard Periods   one row per yard period; the controlling record
//   Vessel Summary        per-vessel coverage, checked against the master
//   Evidence & Conflicts  where sources disagree, and claims excluded
//   Sources               the publications cited
//   Data Gaps             what is missing and how to close it
//   Read Me               the research cutoff, which dates this edition
//
// Sheets deliberately not read, because they are derived from the master and
// read from it instead:
//   Detailed Scope   the master's Scope split into disciplines by keyword. It
//                    files clauses wrongly (KAOS's "Largest Lürssen refit at
//                    the time" under Electrical/AV-IT), repeats them across
//                    disciplines and drops some (Draak's helideck removal);
//                    scope.ts classifies the master's Scope instead.
//   Cost Analysis    the master's cost columns, restated.
//   Yard & Location  counts of the master's yards.
//   Timeline         the master, sorted.
//
// Cells come back as published. "Unverified" in a yard column is a finding
// the register makes, kept as text; deciding it means "no yard identified" is
// the importer's job.

import type { Workbook } from "exceljs";
import { openWorkbook, plain, rawText, readTable, type Plain } from "../xlsx/workbook";
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from "../enums";

/** The committed register, relative to the repository root. */
export const DEFAULT_YARD_REGISTER_PATH =
  "prisma/data/Oceanco_Y7xx_Refit_Yard_Period_Register_2026-09-26.xlsx";

const LABEL = "Yard-period register";

export type RegisterPeriod = {
  rowNumber: number;
  yardNumber: string;
  currentVessel: string;
  nameAtPeriod: string | null;
  startLabel: string;
  endLabel: string;
  precisionLabel: string | null;
  yard: string | null;
  city: string | null;
  country: string | null;
  periodType: string;
  scope: string | null;
  contractors: string | null;
  reportedCost: string | null;
  costBand: string | null;
  estimateBasis: string | null;
  confidence: ConfidenceLevel | null;
  sourceUrl: string | null;
  sourceQuality: string | null;
  notes: string | null;
};

export type RegisterVesselSummary = {
  yardNumber: string;
  currentVessel: string;
  formerNames: string | null;
  deliveredYear: number | null;
  loa: number | null;
  periodsFound: number | null;
  latestPublicPeriod: string | null;
  coverageStatus: string | null;
  comment: string | null;
};

export type RegisterConflict = {
  rowNumber: number;
  yardNumber: string;
  vessel: string;
  issue: string;
  treatment: string | null;
  sourceUrl: string | null;
  confidence: ConfidenceLevel | null;
};

export type RegisterSource = {
  number: number | null;
  url: string;
  quality: string | null;
  accessed: string | null;
};

export type RegisterGap = {
  rowNumber: number;
  /** A yard number, or "ALL" for the whole fleet. */
  yardNumber: string;
  vessel: string | null;
  gap: string;
  priority: string;
  verificationRoute: string | null;
  status: string;
};

export type YardPeriodRegister = {
  /** The research cutoff as an ISO date, e.g. "2026-09-26". */
  edition: string | null;
  periods: RegisterPeriod[];
  summary: RegisterVesselSummary[];
  conflicts: RegisterConflict[];
  sources: RegisterSource[];
  gaps: RegisterGap[];
};

// ---------- Cells ----------

const text = rawText;

function required(value: Plain, what: string, rowNumber: number): string {
  const s = text(value);
  if (!s) throw new Error(`${LABEL}: row ${rowNumber} has no ${what}.`);
  return s;
}

function num(value: Plain): number | null {
  if (value == null || value instanceof Date) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(value.replace(/,/g, "").trim());
  return value.trim() && Number.isFinite(n) ? n : null;
}

function int(value: Plain): number | null {
  const n = num(value);
  return n == null ? null : Math.round(n);
}

function confidence(value: Plain, rowNumber: number): ConfidenceLevel | null {
  const s = text(value);
  if (!s) return null;
  const key = s.toUpperCase();
  if (!(CONFIDENCE_LEVELS as readonly string[]).includes(key)) {
    throw new Error(`${LABEL}: row ${rowNumber} has an unknown confidence "${s}".`);
  }
  return key as ConfidenceLevel;
}

/** "High" → "HIGH", "In progress" → "IN_PROGRESS". */
function key(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "26 September 2026" → "2026-09-26". */
export function isoFromLongDate(value: string): string | null {
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month === -1) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// ---------- Sheets ----------

const PERIOD_HEADERS = [
  "Yard ID",
  "Current Vessel",
  "Name at Period",
  "Start",
  "End",
  "Date Precision",
  "Yard / Facility",
  "City",
  "Country",
  "Period Type",
  "Scope",
  "Contractors / Designers",
  "Reported Cost",
  "Indicative Cost Band",
  "Estimate Basis",
  "Confidence",
  "Source URL",
  "Source Quality",
  "Notes",
];

const SUMMARY_HEADERS = [
  "Yard ID",
  "Current Vessel",
  "Former Names",
  "Delivered",
  "LOA m",
  "Public Yard Periods Found",
  "Latest Public Period",
  "Coverage Status",
  "Key Comment",
];

const CONFLICT_HEADERS = ["Yard ID", "Vessel", "Issue", "Treatment", "Source", "Confidence"];

const SOURCE_HEADERS = ["#", "Source URL", "Source Type / Quality", "Accessed"];

const GAP_HEADERS = [
  "Yard ID",
  "Vessel",
  "Gap / Missing Data",
  "Priority",
  "Recommended Verification Route",
  "Status",
];

const table = (wb: Workbook, sheet: string, first: string, headers: string[]) =>
  readTable(wb, sheet, first, headers, { label: LABEL });

function readEdition(wb: Workbook): string | null {
  const ws = wb.getWorksheet("Read Me");
  if (!ws) return null;
  let edition: string | null = null;
  ws.eachRow((row) => {
    if (edition) return;
    if (text(plain(row.getCell(1).value))?.toLowerCase() === "research cutoff") {
      const value = plain(row.getCell(2).value);
      edition =
        value instanceof Date
          ? value.toISOString().slice(0, 10)
          : isoFromLongDate(text(value) ?? "");
    }
  });
  return edition;
}

/** Parse an opened workbook. Throws on any structural problem. */
export function parseYardPeriodRegister(wb: Workbook): YardPeriodRegister {
  const periods = table(wb, "Master Yard Periods", "Yard ID", PERIOD_HEADERS).map((r) => ({
    rowNumber: r.rowNumber,
    yardNumber: required(r.get("Yard ID"), "yard number", r.rowNumber),
    currentVessel: required(r.get("Current Vessel"), "vessel", r.rowNumber),
    nameAtPeriod: text(r.get("Name at Period")),
    startLabel: required(r.get("Start"), "start date", r.rowNumber),
    endLabel: required(r.get("End"), "end date", r.rowNumber),
    precisionLabel: text(r.get("Date Precision")),
    yard: text(r.get("Yard / Facility")),
    city: text(r.get("City")),
    country: text(r.get("Country")),
    periodType: required(r.get("Period Type"), "period type", r.rowNumber),
    scope: text(r.get("Scope")),
    contractors: text(r.get("Contractors / Designers")),
    reportedCost: text(r.get("Reported Cost")),
    costBand: text(r.get("Indicative Cost Band")),
    estimateBasis: text(r.get("Estimate Basis")),
    confidence: confidence(r.get("Confidence"), r.rowNumber),
    sourceUrl: text(r.get("Source URL")),
    sourceQuality: text(r.get("Source Quality")),
    notes: text(r.get("Notes")),
  }));

  const summary = table(wb, "Vessel Summary", "Yard ID", SUMMARY_HEADERS).map((r) => ({
    yardNumber: required(r.get("Yard ID"), "yard number", r.rowNumber),
    currentVessel: required(r.get("Current Vessel"), "vessel", r.rowNumber),
    formerNames: text(r.get("Former Names")),
    deliveredYear: int(r.get("Delivered")),
    loa: num(r.get("LOA m")),
    periodsFound: int(r.get("Public Yard Periods Found")),
    latestPublicPeriod: text(r.get("Latest Public Period")),
    coverageStatus: text(r.get("Coverage Status")),
    comment: text(r.get("Key Comment")),
  }));

  const conflicts = table(wb, "Evidence & Conflicts", "Yard ID", CONFLICT_HEADERS).map((r) => ({
    rowNumber: r.rowNumber,
    yardNumber: required(r.get("Yard ID"), "yard number", r.rowNumber),
    vessel: required(r.get("Vessel"), "vessel", r.rowNumber),
    issue: required(r.get("Issue"), "issue", r.rowNumber),
    treatment: text(r.get("Treatment")),
    sourceUrl: text(r.get("Source")),
    confidence: confidence(r.get("Confidence"), r.rowNumber),
  }));

  const sources = table(wb, "Sources", "#", SOURCE_HEADERS).map((r) => ({
    number: int(r.get("#")),
    url: required(r.get("Source URL"), "source URL", r.rowNumber),
    quality: text(r.get("Source Type / Quality")),
    accessed: text(r.get("Accessed")),
  }));

  const gaps = table(wb, "Data Gaps", "Yard ID", GAP_HEADERS).map((r) => ({
    rowNumber: r.rowNumber,
    yardNumber: required(r.get("Yard ID"), "yard number", r.rowNumber),
    vessel: text(r.get("Vessel")),
    gap: required(r.get("Gap / Missing Data"), "gap", r.rowNumber),
    priority: key(text(r.get("Priority")) ?? "MEDIUM"),
    verificationRoute: text(r.get("Recommended Verification Route")),
    status: key(text(r.get("Status")) ?? "OPEN"),
  }));

  return { edition: readEdition(wb), periods, summary, conflicts, sources, gaps };
}

/** Open and parse a register from disk. */
export async function readYardPeriodRegister(path: string): Promise<YardPeriodRegister> {
  return parseYardPeriodRegister(await openWorkbook(path));
}
