import { initPdfJs } from "./pdfjs-config";
import { PdfToolError } from "./errors";

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await initPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText) {
      parts.push(`--- Page ${i} ---\n${pageText}`);
    }
  }

  const text = parts.join("\n\n").trim();
  if (!text) {
    throw new PdfToolError(
      "No selectable text found. This PDF may be scanned — try the OCR tool instead.",
      "NO_TEXT"
    );
  }

  return text;
}

export async function extractPdfTextByPage(
  file: File
): Promise<{ page: number; text: string }[]> {
  const pdfjs = await initPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: { page: number; text: string }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push({ page: i, text: pageText });
  }

  if (pages.length === 0) {
    throw new PdfToolError(
      "No selectable text found. This PDF may be scanned — try the OCR tool instead.",
      "NO_TEXT"
    );
  }

  return pages;
}

export async function getPdfTextPreview(file: File): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await initPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) parts.push(pageText);
  }
  const text = parts.join("\n\n").trim();
  return {
    text: text.slice(0, 2000) + (text.length > 2000 ? "…" : ""),
    pageCount: pdf.numPages,
  };
}
