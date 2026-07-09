import { PDFDocument } from "pdf-lib";
import { baseName, loadPdfDocument, savePdf } from "./core";
import { parsePageList } from "./parse-pages";

export async function extractPages(
  file: File,
  pagesInput: string
): Promise<{ data: Uint8Array; pageCount: number }> {
  const source = await loadPdfDocument(file);
  const totalPages = source.getPageCount();
  const pages = parsePageList(pagesInput, totalPages);

  const doc = await PDFDocument.create();
  const indices = pages.map((p) => p - 1);
  const copied = await doc.copyPages(source, indices);
  copied.forEach((p) => doc.addPage(p));

  const data = await savePdf(doc);
  return { data, pageCount: pages.length };
}

export function extractFilename(file: File, pageCount: number): string {
  return `${baseName(file.name)}_extracted_${pageCount}pages.pdf`;
}

export async function getExtractPreview(file: File): Promise<number> {
  const pdf = await loadPdfDocument(file);
  return pdf.getPageCount();
}
