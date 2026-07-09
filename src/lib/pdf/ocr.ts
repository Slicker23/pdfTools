import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { initPdfJs } from "./pdfjs-config";
import { PdfToolError } from "./errors";
import { savePdf } from "./core";

export type OcrOutput = "text" | "searchable-pdf" | "both";

export interface OcrProgress {
  page: number;
  total: number;
  phase: "render" | "recognize" | "build";
}

export interface OcrResult {
  text: string;
  pdf?: Uint8Array;
  pageCount: number;
}

const OCR_SCALE = 2;

export async function runBrowserOcr(
  file: File,
  language: string,
  output: OcrOutput,
  onProgress?: (p: OcrProgress) => void
): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(language);

  try {
    const pdfjs = await initPdfJs();
    const src = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const total = src.numPages;
    const needPdf = output === "searchable-pdf" || output === "both";
    const outDoc = needPdf ? await PDFDocument.create() : null;
    const font = outDoc ? await outDoc.embedFont(StandardFonts.Helvetica) : null;

    const parts: string[] = [];

    for (let pageNum = 1; pageNum <= total; pageNum++) {
      onProgress?.({ page: pageNum, total, phase: "render" });
      const page = await src.getPage(pageNum);
      const viewport = page.getViewport({ scale: OCR_SCALE, rotation: page.rotate });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      onProgress?.({ page: pageNum, total, phase: "recognize" });
      const { data } = await worker.recognize(canvas);
      const pageText = data.text?.trim() ?? "";
      if (pageText) parts.push(`--- Page ${pageNum} ---\n${pageText}`);

      if (outDoc && font) {
        onProgress?.({ page: pageNum, total, phase: "build" });
        const vp1 = page.getViewport({ scale: 1, rotation: page.rotate });
        const outPage = outDoc.addPage([vp1.width, vp1.height]);

        const jpeg = await canvasToJpeg(canvas, 0.85);
        const img = await outDoc.embedJpg(jpeg);
        outPage.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });

        for (const word of extractOcrWords(data)) {
          const w = word.text?.trim();
          if (!w) continue;
          const bbox = word.bbox;
          const [pdfX, pdfY] = viewport.convertToPdfPoint(bbox.x0, bbox.y1) as [number, number];
          const fontSize = Math.max(
            4,
            Math.min(28, ((bbox.y1 - bbox.y0) / OCR_SCALE) * 0.9)
          );
          outPage.drawText(w, {
            x: pdfX,
            y: pdfY,
            size: fontSize,
            font,
            color: rgb(1, 1, 1),
            opacity: 0,
          });
        }
      }
    }

    const text = parts.join("\n\n").trim();
    if (!text && !needPdf) {
      throw new PdfToolError("OCR found no text in this document.", "OCR_EMPTY");
    }

    return {
      text,
      pdf: outDoc ? await savePdf(outDoc) : undefined,
      pageCount: total,
    };
  } finally {
    await worker.terminate();
  }
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode page"))), "image/jpeg", quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export const OCR_LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "deu", label: "German" },
  { code: "fra", label: "French" },
  { code: "spa", label: "Spanish" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "nld", label: "Dutch" },
  { code: "pol", label: "Polish" },
] as const;

type OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } };

function extractOcrWords(page: {
  blocks: Array<{
    paragraphs: Array<{ lines: Array<{ words: OcrWord[] }> }>;
  }> | null;
}): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          if (word.text?.trim()) words.push(word);
        }
      }
    }
  }
  return words;
}
