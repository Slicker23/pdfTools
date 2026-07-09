import { rgb, StandardFonts } from "pdf-lib";
import { loadPdfDocument, savePdf } from "./core";

export type AnnotationType = "highlight" | "underline" | "strikethrough" | "comment";

/** Canvas-space coords for preview + PDF-space coords for export */
export interface Annotation {
  id: string;
  type: AnnotationType;
  page: number;
  /** Canvas top-left (preview) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** PDF user space bottom-left (export) */
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
  text?: string;
  color?: string;
}

export function canvasRectToPdf(
  convertToPdfPoint: (x: number, y: number) => [number, number],
  x: number,
  y: number,
  width: number,
  height: number
) {
  const [x1, y1] = convertToPdfPoint(x, y + height);
  const [x2, y2] = convertToPdfPoint(x + width, y);
  return {
    pdfX: Math.min(x1, x2),
    pdfY: Math.min(y1, y2),
    pdfWidth: Math.abs(x2 - x1),
    pdfHeight: Math.abs(y2 - y1),
  };
}

export async function applyAnnotations(
  file: File,
  annotations: Annotation[]
): Promise<Uint8Array> {
  const pdf = await loadPdfDocument(file);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const ann of annotations) {
    const page = pages[ann.page - 1];
    if (!page) continue;

    const color = ann.color ?? "#FFFF00";
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;

    if (ann.type === "highlight") {
      page.drawRectangle({
        x: ann.pdfX,
        y: ann.pdfY,
        width: ann.pdfWidth,
        height: ann.pdfHeight,
        color: rgb(r, g, b),
        opacity: 0.4,
      });
    } else if (ann.type === "underline") {
      page.drawLine({
        start: { x: ann.pdfX, y: ann.pdfY },
        end: { x: ann.pdfX + ann.pdfWidth, y: ann.pdfY },
        thickness: 1.5,
        color: rgb(r, g, b),
      });
    } else if (ann.type === "strikethrough") {
      const midY = ann.pdfY + ann.pdfHeight / 2;
      page.drawLine({
        start: { x: ann.pdfX, y: midY },
        end: { x: ann.pdfX + ann.pdfWidth, y: midY },
        thickness: 1.5,
        color: rgb(r, g, b),
      });
    } else if (ann.type === "comment" && ann.text) {
      page.drawText(ann.text, {
        x: ann.pdfX,
        y: ann.pdfY + ann.pdfHeight - 10,
        size: 10,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  }

  return savePdf(pdf);
}

export function createAnnotationId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
