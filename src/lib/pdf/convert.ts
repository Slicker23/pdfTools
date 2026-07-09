import { PDFDocument } from "pdf-lib";
import { initPdfJs } from "./pdfjs-config";
import { baseName, savePdf } from "./core";
import { loadPdfBytes, PdfToolError } from "./errors";

export async function pdfToJpg(
  file: File,
  options: { scale?: number; quality?: number; pages?: number[] } = {}
): Promise<{ blobs: Blob[]; names: string[] }> {
  const { scale = 2, quality = 0.92, pages } = options;
  const pdfjs = await initPdfJs();
  const bytes = await loadPdfBytes(file);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const name = baseName(file.name);
  const blobs: Blob[] = [];
  const names: string[] = [];

  const pageNumbers = pages?.length
    ? pages.filter((p) => p >= 1 && p <= pdf.numPages)
    : Array.from({ length: pdf.numPages }, (_, i) => i + 1);

  if (pageNumbers.length === 0) {
    throw new PdfToolError("No valid pages selected for conversion.", "NO_PAGES");
  }

  for (const pageNum of pageNumbers) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new PdfToolError("JPG conversion failed.", "CONVERT_FAILED"))),
        "image/jpeg",
        quality
      );
    });

    blobs.push(blob);
    names.push(`${name}_page_${pageNum}.jpg`);
  }

  return { blobs, names };
}

export async function pdfToPng(
  file: File,
  scale = 2
): Promise<{ blobs: Blob[]; names: string[] }> {
  const pdfjs = await initPdfJs();
  const bytes = await loadPdfBytes(file);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const name = baseName(file.name);
  const blobs: Blob[] = [];
  const names: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new PdfToolError("PNG conversion failed.", "CONVERT_FAILED"))),
        "image/png"
      );
    });

    blobs.push(blob);
    names.push(`${name}_page_${i}.png`);
  }

  return { blobs, names };
}

export async function jpgToPdf(files: File[]): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new PdfToolError("Select at least one image.", "NO_FILES");
  }

  const pdf = await PDFDocument.create();

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    let image;
    try {
      image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      throw new PdfToolError(`"${file.name}" is not a valid JPG/PNG image.`, "INVALID_IMAGE");
    }

    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }

  return savePdf(pdf);
}

export async function getPdfPageCount(file: File): Promise<number> {
  const pdfjs = await initPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  return pdf.numPages;
}
