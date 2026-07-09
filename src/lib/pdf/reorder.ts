import { PDFDocument } from "pdf-lib";
import { baseName, loadPdfDocument, savePdf } from "./core";
import { parsePageOrder } from "./parse-pages";

export async function reorderPdf(
  file: File,
  orderInput: string
): Promise<{ data: Uint8Array; pageCount: number }> {
  const source = await loadPdfDocument(file);
  const totalPages = source.getPageCount();
  const order = parsePageOrder(orderInput, totalPages);

  const doc = await PDFDocument.create();
  const indices = order.map((n) => n - 1);
  const pages = await doc.copyPages(source, indices);
  pages.forEach((p) => doc.addPage(p));

  const data = await savePdf(doc);
  return { data, pageCount: totalPages };
}

export async function getDefaultPageOrder(file: File): Promise<number[]> {
  const pdf = await loadPdfDocument(file);
  return Array.from({ length: pdf.getPageCount() }, (_, i) => i + 1);
}

export function reorderFilename(file: File): string {
  return `${baseName(file.name)}_reordered.pdf`;
}

export function orderToString(order: number[]): string {
  return order.join(", ");
}
