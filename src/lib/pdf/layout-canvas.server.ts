/** Node-only canvas backend (@napi-rs/canvas). Do not import from client components. */

import type { LayoutCanvas } from "./layout-canvas.types";

export async function createLayoutCanvas(
  width: number,
  height: number
): Promise<LayoutCanvas> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const el = createCanvas(width, height);
  return {
    width,
    height,
    getContext: (id) => el.getContext(id) as unknown as CanvasRenderingContext2D | null,
    asRenderTarget: () => el as unknown as HTMLCanvasElement,
    toPngBytes: async () => new Uint8Array(el.toBuffer("image/png")),
  };
}

export type CreateLayoutCanvas = typeof createLayoutCanvas;
