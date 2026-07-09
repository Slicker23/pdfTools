import { PDFDocument } from "pdf-lib";
import { baseName, loadPdfDocument, savePdf } from "./core";
import { PdfToolError } from "./errors";

export interface MergeFileInfo {
  file: File;
  pageCount: number;
}

export async function inspectMergeFiles(files: File[]): Promise<MergeFileInfo[]> {
  if (files.length < 2) {
    throw new PdfToolError("Select at least 2 PDF files to merge.", "MIN_FILES");
  }

  const results: MergeFileInfo[] = [];
  for (const file of files) {
    const pdf = await loadPdfDocument(file);
    const pageCount = pdf.getPageCount();
    if (pageCount === 0) {
      throw new PdfToolError(`"${file.name}" has no pages.`, "EMPTY_PDF");
    }
    results.push({ file, pageCount });
  }
  return results;
}

export async function mergePdfs(files: File[]): Promise<{
  data: Uint8Array;
  totalPages: number;
  inputSize: number;
}> {
  const inspected = await inspectMergeFiles(files);
  const merged = await PDFDocument.create();
  let totalPages = 0;
  let inputSize = 0;

  for (const { file, pageCount } of inspected) {
    inputSize += file.size;
    totalPages += pageCount;
    const pdf = await loadPdfDocument(file);
    const pages = await merged.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  const data = await savePdf(merged);
  return { data, totalPages, inputSize };
}

export function defaultMergedFilename(files: File[]): string {
  if (files.length === 1) return `${baseName(files[0].name)}.pdf`;
  return `${baseName(files[0].name)}_merged.pdf`;
}
