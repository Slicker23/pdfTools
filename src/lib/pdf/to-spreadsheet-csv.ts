import { extractPdfTextByPage } from "./text-extract";

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Plain-text CSV export (editable cells, no layout). */
export async function pdfToCsv(file: File): Promise<string> {
  const pages = await extractPdfTextByPage(file);
  const rows = ["Page,Content", ...pages.map((p) => `${p.page},${escapeCsv(p.text)}`)];
  return rows.join("\n");
}
