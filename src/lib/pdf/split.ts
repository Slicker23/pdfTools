import { PDFDocument } from "pdf-lib";
import { baseName, loadPdfDocument, savePdf } from "./core";
import { parsePageRanges, splitEveryPage, type ParsedPageRange } from "./parse-pages";

export async function splitPdf(
  file: File,
  rangesInput: string,
  mode: "ranges" | "every-page" = "ranges"
): Promise<{ name: string; data: Uint8Array }[]> {
  const source = await loadPdfDocument(file);
  const totalPages = source.getPageCount();
  const name = baseName(file.name);

  const ranges: ParsedPageRange[] =
    mode === "every-page" ? splitEveryPage(totalPages) : parsePageRanges(rangesInput, totalPages);

  const results: { name: string; data: Uint8Array }[] = [];

  for (const range of ranges) {
    const doc = await PDFDocument.create();
    const indices = range.pages.map((p) => p - 1);
    const pages = await doc.copyPages(source, indices);
    pages.forEach((p) => doc.addPage(p));
    const data = await savePdf(doc);
    const suffix = range.label.includes("-")
      ? `pages_${range.label.replace("-", "to")}`
      : `page_${range.label}`;
    results.push({ name: `${name}_${suffix}.pdf`, data });
  }

  return results;
}

export async function getSplitPreview(file: File): Promise<number> {
  const pdf = await loadPdfDocument(file);
  return pdf.getPageCount();
}
