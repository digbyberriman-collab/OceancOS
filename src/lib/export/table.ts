// Export table shapes.
//
// The rows and columns of an export are decided here, as pure data, so what a
// spreadsheet contains is unit-testable without building a workbook. The XLSX
// and CSV writers consume these.

export type ColumnType = "text" | "number" | "money" | "date" | "percent";

export type Column<Row> = {
  header: string;
  type: ColumnType;
  /** Pull the raw value out of a row. Formatting belongs to the writer. */
  value: (row: Row) => string | number | Date | null;
  /** Column width in characters. */
  width?: number;
};

export type Sheet<Row> = {
  name: string;
  columns: Column<Row>[];
  rows: Row[];
  /** Columns to total in a final row, by header. */
  totals?: string[];
};

/** Excel forbids these in a sheet name, and caps it at 31 characters. */
export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s{2,}/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

/**
 * Resolve a sheet to a plain grid: a header row, body rows, and an optional
 * totals row. Cell values stay typed so the writer can apply number formats
 * rather than shipping pre-formatted strings that Excel cannot sum.
 */
export function toGrid<Row>(sheet: Sheet<Row>): {
  header: string[];
  body: (string | number | Date | null)[][];
  totals: (string | number | null)[] | null;
} {
  const header = sheet.columns.map((c) => c.header);
  const body = sheet.rows.map((row) => sheet.columns.map((c) => c.value(row)));

  if (!sheet.totals?.length) return { header, body, totals: null };

  const totals = sheet.columns.map((column, index) => {
    if (!sheet.totals!.includes(column.header)) return index === 0 ? "Total" : null;
    const sum = body.reduce((acc, row) => {
      const cell = row[index];
      return acc + (typeof cell === "number" && Number.isFinite(cell) ? cell : 0);
    }, 0);
    return sum;
  });

  return { header, body, totals };
}

/** Escape a cell for CSV: quote when it contains a delimiter, quote or newline. */
export function csvCell(value: string | number | Date | null): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<Row>(sheet: Sheet<Row>): string {
  const { header, body, totals } = toGrid(sheet);
  const lines = [header.map(csvCell).join(",")];
  for (const row of body) lines.push(row.map(csvCell).join(","));
  if (totals) lines.push(totals.map(csvCell).join(","));
  return lines.join("\r\n");
}

/** A filename safe on every platform, with the date so downloads do not collide. */
export function exportFilename(base: string, extension: string, now = new Date()): string {
  const slug = base
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  const date = now.toISOString().slice(0, 10);
  return `${slug || "export"}-${date}.${extension}`;
}
