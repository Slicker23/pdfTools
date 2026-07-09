/**
 * Node-only bundled DejaVu TTF reader for base-14 outline fallback (M9).
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

const DEJAVU_BY_BASE14: Record<string, string> = {
  Helvetica: "DejaVuSans.ttf",
  "Helvetica-Bold": "DejaVuSans-Bold.ttf",
  "Helvetica-Oblique": "DejaVuSans-Oblique.ttf",
  "Helvetica-BoldOblique": "DejaVuSans-BoldOblique.ttf",
  "Times-Roman": "DejaVuSans.ttf",
  "Times-Bold": "DejaVuSans-Bold.ttf",
  "Times-Italic": "DejaVuSans-Oblique.ttf",
  "Times-BoldItalic": "DejaVuSans-BoldOblique.ttf",
  Courier: "DejaVuSans.ttf",
  "Courier-Bold": "DejaVuSans-Bold.ttf",
  "Courier-Oblique": "DejaVuSans-Oblique.ttf",
  "Courier-BoldOblique": "DejaVuSans-BoldOblique.ttf",
};

function fontsDir(): string {
  return path.join(process.cwd(), "services", "pdf-engine", "fonts");
}

export function readBundledDejaVu(base14Key: string): Uint8Array | undefined {
  const file = DEJAVU_BY_BASE14[base14Key];
  if (!file) return undefined;
  const full = path.join(fontsDir(), file);
  if (!existsSync(full)) return undefined;
  return new Uint8Array(readFileSync(full));
}

export function createDejaVuOutlineReader(): (base14Key: string) => Uint8Array | undefined {
  return readBundledDejaVu;
}
