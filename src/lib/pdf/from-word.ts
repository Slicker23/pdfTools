import mammoth from "mammoth";
import { PdfToolError } from "./errors";
import { textToPdf } from "./text-to-pdf";

/** Convert a Word .docx file to PDF using extracted text (formatting not preserved). */
export async function wordToPdf(file: File): Promise<Uint8Array> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".docx") && !name.endsWith(".doc")) {
    throw new PdfToolError("Please upload a .docx Word file.", "INVALID_TYPE");
  }

  if (name.endsWith(".doc")) {
    throw new PdfToolError(
      "Legacy .doc files are not supported in-browser. Save as .docx first.",
      "INVALID_TYPE"
    );
  }

  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const text = result.value.trim();

  if (!text) {
    throw new PdfToolError("No text found in this Word document.", "NO_TEXT");
  }

  return textToPdf(text);
}
