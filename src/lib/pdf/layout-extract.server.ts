/** Worker / Node-only — do not import from client components. */

import { extractPdfPageLayoutsFromBytes } from "@/lib/pdf/layout-extract";
import { createLayoutCanvas } from "@/lib/pdf/layout-canvas.server";

/** Worker-only: extract PDF layouts using Node canvas (pdf.js + @napi-rs/canvas). */
export async function extractPdfPageLayoutsOnServer(data: Uint8Array) {
  return extractPdfPageLayoutsFromBytes(data, { createCanvas: createLayoutCanvas });
}
