// Spreadsheet export.
//
// The Bridge offers a spreadsheet beside every list and invoice, because the
// client's finance team works in Excel. Values are written typed, with number
// formats applied, so the recipient can sum and pivot them — never as
// pre-formatted strings.

import type { Sheet } from "./table";
import { safeSheetName, toGrid } from "./table";

const NUMBER_FORMATS: Record<string, string> = {
  money: '#,##0;[Red]-#,##0',
  number: "#,##0",
  percent: "0%",
  date: "dd mmm yyyy",
};

export async function buildWorkbook(
  sheets: Sheet<any>[],
  meta?: { title?: string; creator?: string }
): Promise<Buffer> {
  // Imported lazily: exceljs is large and only needed on an export request.
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta?.creator ?? "OceancOS";
  workbook.created = new Date();
  if (meta?.title) workbook.title = meta.title;

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name), {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const { header, body, totals } = toGrid(sheet);

    worksheet.addRow(header);
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle" };

    for (const row of body) worksheet.addRow(row);

    if (totals) {
      const row = worksheet.addRow(totals);
      row.font = { bold: true };
    }

    sheet.columns.forEach((column, index) => {
      const worksheetColumn = worksheet.getColumn(index + 1);
      worksheetColumn.width = column.width ?? Math.max(12, column.header.length + 2);
      const format = NUMBER_FORMATS[column.type];
      if (format) worksheetColumn.numFmt = format;
      if (column.type !== "text") worksheetColumn.alignment = { horizontal: "right" };
    });

    // A filter on the header is what makes a list usable once it is open.
    if (body.length) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: header.length },
      };
    }
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
