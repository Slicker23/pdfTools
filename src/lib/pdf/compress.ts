import { PDFDocument } from "pdf-lib";
import { initPdfJs } from "./pdfjs-config";
import { loadPdfBytes, PdfToolError } from "./errors";
import { savePdf } from "./core";

export async function compressPdf(
  file: File,
  quality: number
): Promise<{ data: Uint8Array; inputSize: number }> {
  const inputSize = file.size;
  const bytes = await loadPdfBytes(file);

  // Try image re-encoding for image-heavy PDFs via pdfjs render + rebuild
  try {
    const reencoded = await compressViaRender(file, quality);
    if (reencoded.length < inputSize * 0.98) {
      return { data: reencoded, inputSize };
    }
  } catch {
    // Fall back to pdf-lib object stream compression
  }

  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const data = await savePdf(pdf);
  return { data, inputSize };
}

async function compressViaRender(file: File, quality: number): Promise<Uint8Array> {
  const pdfjs = await initPdfJs();
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const out = await PDFDocument.create();
  const jpegQuality = Math.max(0.1, Math.min(1, quality / 100));
  const scale = quality >= 80 ? 2 : quality >= 50 ? 1.5 : 1.2;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const jpegBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) return reject(new PdfToolError("Failed to compress page image.", "COMPRESS_FAILED"));
          resolve(await blob.arrayBuffer());
        },
        "image/jpeg",
        jpegQuality
      );
    });

    const image = await out.embedJpg(jpegBytes);
    const pageOut = out.addPage([viewport.width, viewport.height]);
    pageOut.drawImage(image, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return savePdf(out);
}
