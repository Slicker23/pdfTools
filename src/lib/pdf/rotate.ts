import { degrees } from "pdf-lib";
import { loadPdfDocument, savePdf } from "./core";
import { parsePageList } from "./parse-pages";
import { PdfToolError } from "./errors";

export type RotationAngle = 90 | 180 | 270;
export type RotateScope = "all" | "selected";

export async function rotatePdf(
  file: File,
  rotation: RotationAngle,
  scope: RotateScope,
  selectedPagesInput?: string
): Promise<{ data: Uint8Array; rotatedCount: number }> {
  const pdf = await loadPdfDocument(file);
  const totalPages = pdf.getPageCount();
  const pages = pdf.getPages();

  let targetPages: number[];
  if (scope === "all") {
    targetPages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    if (!selectedPagesInput?.trim()) {
      throw new PdfToolError("Select pages to rotate or choose 'All pages'.", "NO_PAGES");
    }
    targetPages = parsePageList(selectedPagesInput, totalPages);
  }

  const targetSet = new Set(targetPages);

  pages.forEach((page, index) => {
    const pageNum = index + 1;
    if (targetSet.has(pageNum)) {
      const current = page.getRotation().angle;
      page.setRotation(degrees(current + rotation));
    }
  });

  const data = await savePdf(pdf);
  return { data, rotatedCount: targetPages.length };
}

export async function getRotatePreview(file: File): Promise<number> {
  const pdf = await loadPdfDocument(file);
  return pdf.getPageCount();
}
