import { initPdfJs } from "./pdfjs-config";
import { loadPdfBytes } from "./errors";

export interface RenderedPdfPage {
  page: number;
  png: Uint8Array;
  width: number;
  height: number;
}

/** Render each PDF page to a high-resolution PNG (preserves layout, fonts, colors, images). */
export async function renderPdfPagesToPng(
  file: File,
  scale = 2
): Promise<RenderedPdfPage[]> {
  const pdfjs = await initPdfJs();
  const bytes = await loadPdfBytes(file);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: RenderedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale, rotation: page.rotate });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to render page image"))),
        "image/png",
        1
      );
    });

    pages.push({
      page: pageNum,
      png: new Uint8Array(await blob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    });
  }

  return pages;
}

/** Word content area width in pixels (~6.5in at 96 DPI). */
export const WORD_PAGE_CONTENT_WIDTH_PX = 624;

export function scaleToWidth(
  width: number,
  height: number,
  targetWidth: number
): { width: number; height: number } {
  const ratio = targetWidth / width;
  return {
    width: targetWidth,
    height: Math.round(height * ratio),
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
