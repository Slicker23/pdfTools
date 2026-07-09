import { PDFDocument } from "pdf-lib";
import { loadPdfBytes, PdfToolError } from "./errors";

export async function loadPdfDocument(file: File) {
  const bytes = await loadPdfBytes(file);
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new PdfToolError(
      `"${file.name}" could not be opened. It may be corrupted or password-protected.`,
      "LOAD_FAILED"
    );
  }
}

export async function getPageCount(file: File): Promise<number> {
  const pdf = await loadPdfDocument(file);
  return pdf.getPageCount();
}

export async function savePdf(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true });
}

export function baseName(filename: string): string {
  return filename.replace(/\.pdf$/i, "") || "document";
}
