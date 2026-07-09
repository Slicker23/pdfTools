import ExcelJS from "exceljs";
import {
  extractPdfPageLayouts,
  type LayoutLine,
  type LayoutSpan,
} from "./layout-extract";

function lineToCells(line: LayoutLine): string[] {
  const sorted = [...line.spans].sort((a, b) => a.x - b.x);
  const cells: string[] = [];
  let buffer = "";
  let lastEndX = 0;

  for (const span of sorted) {
    const text = span.text.trim();
    if (!text || text === "•") continue;

    const gap = span.x - lastEndX;
    const columnBreak =
      cells.length > 0 && buffer && gap > span.fontSize * 1.1;

    if (columnBreak) {
      cells.push(buffer.trim());
      buffer = span.text;
    } else {
      buffer += buffer && !buffer.endsWith(" ") ? " " : "";
      buffer += span.text;
    }

    lastEndX = span.x + span.width;
  }

  if (buffer.trim()) cells.push(buffer.trim());
  return cells;
}

function applyLineToSheet(sheet: ExcelJS.Worksheet, rowNum: number, line: LayoutLine): number {
  const cells = lineToCells(line);
  if (cells.length === 0) return rowNum;

  cells.forEach((value, colIndex) => {
    const cell = sheet.getCell(rowNum, colIndex + 1);
    cell.value = value;
    const firstSpan = line.spans[colIndex] ?? line.spans[0];
    if (firstSpan?.bold || firstSpan.fontSize > 12) {
      cell.font = { bold: true, size: Math.min(14, Math.round(firstSpan.fontSize)) };
    }
  });

  return rowNum + 1;
}

/**
 * Build an Excel workbook with editable cells from PDF text positions.
 * Two-column rows become multiple columns; each page is a worksheet.
 */
export async function pdfToExcel(file: File): Promise<Blob> {
  const { layouts } = await extractPdfPageLayouts(file, { textOnly: true });
  const workbook = new ExcelJS.Workbook();

  for (const page of layouts) {
    const sheet = workbook.addWorksheet(`Page ${page.page}`);
    let rowNum = 1;

    const lines = page.lines.sort((a, b) => b.top - a.top);
    for (const line of lines) {
      rowNum = applyLineToSheet(sheet, rowNum, line);
    }

    sheet.columns.forEach((col) => {
      col.width = 22;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** @deprecated Use pdfToExcel — kept for CSV text export if needed */
export { pdfToCsv } from "./to-spreadsheet-csv";
