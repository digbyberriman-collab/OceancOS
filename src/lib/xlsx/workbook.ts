// Reading tables out of a researched workbook.
//
// The registers this application loads (the vessel register, the yard-period
// register) are Excel workbooks laid out as one table per sheet under a header
// row. This module holds what every such reader needs and nothing about any one
// register: opening the file, flattening exceljs' cell shapes, and finding a
// table's columns by header text rather than by letter, so a column moved in a
// later edition still parses and a column renamed or removed fails loudly
// instead of loading the wrong value into the wrong field.
//
// What counts as "no value" ("Not verified", "Unverified", "n/a") is a policy
// of each register, not of this module; cells come back as published.

import type { Workbook, Worksheet, CellValue } from "exceljs";

// ---------- Cells ----------

export type Plain = string | number | Date | null;

/** Flatten exceljs' cell shapes (rich text, hyperlinks, formulas) to a value. */
export function plain(value: CellValue): Plain {
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

/** A cell as trimmed text, exactly as published. Blank is null. */
export function rawText(value: Plain): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** Excel stores dates as days since 1899-12-30; some cells arrive that way. */
export function excelDate(value: Plain): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------- Tables ----------

function normaliseHeader(value: Plain): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type Row = { get(header: string): Plain; rowNumber: number };

export type TableOptions = {
  /** Names the workbook in error messages, e.g. "Vessel register". */
  label: string;
  /** Whether a row's first cell still belongs to the table. Defaults to "not blank". */
  isKey?: (value: Plain) => boolean;
};

/**
 * Rows of a sheet's table. The header row is the first whose first cell is
 * `firstHeader`; rows end at the first row whose key cell fails `isKey`.
 * Every header in `required` must be present.
 */
export function readTable(
  wb: Workbook,
  sheetName: string,
  firstHeader: string,
  required: string[],
  options: TableOptions,
): Row[] {
  const { label } = options;
  const isKey = options.isKey ?? ((value: Plain) => rawText(value) != null);
  const ws: Worksheet | undefined = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`${label}: sheet "${sheetName}" is missing.`);

  let headerRow = 0;
  const columns = new Map<string, number>();
  ws.eachRow((row, rowNumber) => {
    if (headerRow) return;
    if (normaliseHeader(plain(row.getCell(1).value)) === normaliseHeader(firstHeader)) {
      headerRow = rowNumber;
      row.eachCell((cell, col) => columns.set(normaliseHeader(plain(cell.value)), col));
    }
  });
  if (!headerRow) throw new Error(`${label}: no "${firstHeader}" header row on "${sheetName}".`);

  const missing = required.filter((h) => !columns.has(normaliseHeader(h)));
  if (missing.length) {
    throw new Error(`${label}: "${sheetName}" is missing column(s): ${missing.join(", ")}.`);
  }

  const rows: Row[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!isKey(plain(row.getCell(1).value))) break;
    rows.push({
      rowNumber: r,
      get(header: string) {
        const col = columns.get(normaliseHeader(header));
        if (!col) throw new Error(`${label}: "${sheetName}" has no column "${header}".`);
        return plain(row.getCell(col).value);
      },
    });
  }
  return rows;
}

// ---------- Files ----------

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
    const bound = new RegExp(
      `xmlns:([A-Za-z_][\\w.-]*)="${SPREADSHEETML.replace(/[./]/g, "\\$&")}"`,
    ).exec(xml);
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

/** Open a workbook from disk. exceljs is loaded only when needed. */
export async function openWorkbook(path: string): Promise<Workbook> {
  const { readFile } = await import("node:fs/promises");
  const ExcelJS = await import("exceljs");
  const Ctor = (ExcelJS as unknown as { default?: typeof ExcelJS }).default ?? ExcelJS;
  const wb = new Ctor.Workbook();
  const buffer = await normaliseOpenXml(await readFile(path));
  // exceljs is typed against an older Buffer declaration; the value is the same.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}
