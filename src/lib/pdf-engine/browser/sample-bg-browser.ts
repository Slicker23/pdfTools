/**
 * Sample background RGB (0–1) from a pdf.js-rendered canvas.
 */
import type { PageViewport } from "pdfjs-dist";
import type { PdfEditBBox, PdfEditBlockPatch } from "@/lib/pdf/edit-model";
import { initPdfJs } from "@/lib/pdf";
import { pdfJsDocumentInit } from "@/lib/pdf/pdfjs-load-options";
import { sampleBackgroundColor } from "@/lib/pdf/edit-pickup";
import type { Rgb01 } from "../apply-overlay";

/** Fixed download/preview parity scale (150 DPI). */
export const OVERLAY_BG_RENDER_SCALE = 150 / 72;

const WHITE: Rgb01 = { r: 1, g: 1, b: 1 };

function hexToRgb01(hex: string): Rgb01 {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

export function sampleBgRgbFromCanvas(
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  rect: PdfEditBBox
): Rgb01 {
  return hexToRgb01(sampleBackgroundColor(canvas, viewport, rect));
}

/** Sample overlay backgrounds for every affected page at a fixed render scale. */
export async function sampleOverlayBackgroundsAllPages(
  nativeBytes: ArrayBuffer | Uint8Array,
  overlayBlocks: PdfEditBlockPatch[],
  renderScale = OVERLAY_BG_RENDER_SCALE
): Promise<Map<string, Rgb01>> {
  const samples = new Map<string, Rgb01>();
  const byPage = new Map<number, PdfEditBlockPatch[]>();

  for (const block of overlayBlocks) {
    if (!block.bbox) continue;
    const list = byPage.get(block.page) ?? [];
    list.push(block);
    byPage.set(block.page, list);
  }
  if (!byPage.size) return samples;

  const pdfjs = await initPdfJs();
  const data =
    nativeBytes instanceof Uint8Array
      ? (nativeBytes.buffer.slice(
          nativeBytes.byteOffset,
          nativeBytes.byteOffset + nativeBytes.byteLength
        ) as ArrayBuffer)
      : nativeBytes.slice(0);

  const pdf = await pdfjs.getDocument(pdfJsDocumentInit(data)).promise;
  try {
    for (const [pageNum, blocks] of byPage) {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: renderScale, rotation: page.rotate });
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        for (const block of blocks) {
          const rect = block.originalBbox ?? block.bbox!;
          try {
            samples.set(block.id, sampleBgRgbFromCanvas(canvas, viewport, rect));
          } catch {
            samples.set(block.id, WHITE);
          }
        }
      } catch {
        for (const block of blocks) {
          samples.set(block.id, WHITE);
        }
      }
    }
  } finally {
    void pdf.cleanup();
  }

  return samples;
}
