import { createCanvas, loadImage } from "@napi-rs/canvas";
import { loadDocument } from "pdfium-native";
import type { PdfEditBBox } from "../pdf/edit-model";

const RENDER_DPI = 150;

function averageRgb(samples: { r: number; g: number; b: number }[]): {
  r: number;
  g: number;
  b: number;
} {
  if (!samples.length) return { r: 1, g: 1, b: 1 };
  const sorted = [...samples].sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b));
  const trim = samples.length >= 4 ? 1 : 0;
  const pool = sorted.slice(trim, trim > 0 ? sorted.length - trim : sorted.length);
  const n = pool.length;
  return {
    r: pool.reduce((sum, s) => sum + s.r, 0) / n / 255,
    g: pool.reduce((sum, s) => sum + s.g, 0) / n / 255,
    b: pool.reduce((sum, s) => sum + s.b, 0) / n / 255,
  };
}

/** Sample background RGB (0–1) just outside a bbox via pdfium-native render. */
export async function sampleBgRgb(
  input: Buffer,
  pageIdx: number,
  bbox: PdfEditBBox,
  pageHeight: number
): Promise<{ r: number; g: number; b: number }> {
  const fallback = { r: 1, g: 1, b: 1 };
  const doc = await loadDocument(input);
  try {
    if (pageIdx < 0 || pageIdx >= doc.pageCount) return fallback;
    const page = await doc.getPage(pageIdx);
    try {
      const scale = RENDER_DPI / 72;
      const png = await page.render({ scale, format: "png" });
      const img = await loadImage(png);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const left = Math.floor(bbox.px * scale);
      const top = Math.floor((pageHeight - bbox.py - bbox.ph) * scale);
      const right = Math.floor((bbox.px + bbox.pw) * scale);
      const bottom = Math.floor((pageHeight - bbox.py) * scale);
      const midX = Math.floor((left + right) / 2);
      const midY = Math.floor((top + bottom) / 2);
      const off = Math.max(4, Math.round(2 * scale));

      const candidates: [number, number][] = [
        [left - off, midY],
        [right + off, midY],
        [midX, top - off],
        [midX, bottom + off],
        [left - off, top - off],
        [right + off, bottom + off],
        [left - off, bottom + off],
        [right + off, top - off],
      ];

      const samples: { r: number; g: number; b: number; brightness: number }[] = [];
      for (const [cx, cy] of candidates) {
        const px = Math.round(cx);
        const py = Math.round(cy);
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
        const d = ctx.getImageData(px, py, 1, 1).data;
        samples.push({
          r: d[0]!,
          g: d[1]!,
          b: d[2]!,
          brightness: d[0]! + d[1]! + d[2]!,
        });
      }

      if (!samples.length) return fallback;

      const nonInk = samples.filter((s) => s.brightness > 72);
      return averageRgb(nonInk.length > 0 ? nonInk : samples);
    } finally {
      page.close();
    }
  } finally {
    doc.destroy();
  }
}
