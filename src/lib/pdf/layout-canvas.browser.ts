/** Browser canvas for PDF layout extraction. */

import type { LayoutCanvas } from "./layout-canvas.types";

function browserCanvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error("Failed to export canvas"));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/png"
    );
  });
}

export async function createLayoutCanvas(
  width: number,
  height: number
): Promise<LayoutCanvas> {
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  return {
    width,
    height,
    getContext: (id) => el.getContext(id),
    asRenderTarget: () => el,
    toPngBytes: () => browserCanvasToPng(el),
  };
}

export type CreateLayoutCanvas = typeof createLayoutCanvas;
