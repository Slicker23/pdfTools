/**
 * Worker-side overlay background sampling (OffscreenCanvas + pdf.js).
 */
import type { PageViewport } from "pdfjs-dist";
import type { PdfEditBBox, PdfEditBlockPatch } from "@/lib/pdf/edit-model";
import type { Rgb01 } from "../apply-overlay";
import { pdfJsDocumentInit } from "@/lib/pdf/pdfjs-load-options";
import { initPdfJsInWorker } from "./pdfjs-worker-init";

export const OVERLAY_BG_RENDER_SCALE = 150 / 72;

const WHITE: Rgb01 = { r: 1, g: 1, b: 1 };

type SampleCanvas = {
  width: number;
  height: number;
  getContext(type: "2d", opts?: { willReadFrequently?: boolean }): CanvasRenderingContext2D | null;
};

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

function sampleBgFromCanvas(
  canvas: SampleCanvas,
  viewport: PageViewport,
  rect: PdfEditBBox
): Rgb01 {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return WHITE;

  const [x1, y1] = viewport.convertToViewportPoint(rect.px, rect.py) as [number, number];
  const [x2, y2] = viewport.convertToViewportPoint(rect.px + rect.pw, rect.py + rect.ph) as [
    number,
    number,
  ];
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  const candidates: [number, number][] = [
    [left - 3, midY],
    [right + 3, midY],
    [midX, top - 3],
    [midX, bottom + 3],
  ];

  const samples: { brightness: number; r: number; g: number; b: number }[] = [];
  for (const [cx, cy] of candidates) {
    const px = Math.round(cx);
    const py = Math.round(cy);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
    const d = ctx.getImageData(px, py, 1, 1).data;
    samples.push({ brightness: d[0]! + d[1]! + d[2]!, r: d[0]!, g: d[1]!, b: d[2]! });
  }
  if (!samples.length) return WHITE;
  samples.sort((a, b) => a.brightness - b.brightness);
  const best = samples[0]!;
  const hex = `#${[best.r, best.g, best.b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
  return hexToRgb01(hex);
}

async function loadPdfJsWorker() {
  return initPdfJsInWorker();
}

/** Sample overlay backgrounds inside the engine worker at fixed 150 DPI scale. */
export async function sampleOverlayBackgroundsInWorker(
  nativeBytes: Uint8Array,
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

  const pdfjs = await loadPdfJsWorker();
  const data = nativeBytes.buffer.slice(
    nativeBytes.byteOffset,
    nativeBytes.byteOffset + nativeBytes.byteLength
  ) as ArrayBuffer;

  const pdf = await pdfjs.getDocument(pdfJsDocumentInit(data)).promise;
  try {
    for (const [pageNum, blocks] of byPage) {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: renderScale, rotation: page.rotate });
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        await page.render({
          canvasContext: ctx,
          viewport,
        } as unknown as Parameters<typeof page.render>[0]).promise;

        for (const block of blocks) {
          const rect = block.originalBbox ?? block.bbox!;
          try {
            samples.set(block.id, sampleBgFromCanvas(canvas as unknown as SampleCanvas, viewport, rect));
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
