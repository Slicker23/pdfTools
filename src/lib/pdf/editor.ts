import { rgb } from "pdf-lib";
import { loadPdfDocument, savePdf } from "./core";
import { resolveFont, type FontFamily, DEFAULT_FONT_FAMILY } from "./fonts";

/**
 * Editor object model.
 *
 * All geometry is stored in PDF user space (points, origin bottom-left) so it is
 * independent of the on-screen zoom and rotation-safe. The UI converts to/from
 * screen coordinates using the pdf.js viewport at render time.
 *
 * `px, py` = bottom-left corner of the object's bounding box.
 */
export type EditObjectType =
  | "text"
  | "whiteout"
  | "shape"
  | "brush"
  | "image"
  | "highlight"
  | "underline"
  | "strikethrough";

export type ShapeKind = "rect" | "line" | "ellipse";
export type TextAlign = "left" | "center" | "right";

interface BaseObject {
  id: string;
  page: number;
  type: EditObjectType;
  /** Bounding box in PDF user space (points, bottom-left origin). */
  px: number;
  py: number;
  pw: number;
  ph: number;
  opacity?: number;
}

export interface TextObject extends BaseObject {
  type: "text";
  text: string;
  fontFamily: FontFamily;
  /** PDF points — used on export. */
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  align: TextAlign;
  /** Ascender height / fontSize (from PDF font metrics). */
  ascentRatio?: number;
  /** Descender depth / fontSize (positive, from PDF font metrics). */
  descentRatio?: number;
  /** PDF baseline Y (bottom-left origin) for precise text placement on export. */
  baselineY?: number;
  /** Paired whiteout object id (original PDF text cover). */
  coverId?: string;
  /** True when auto-imported from the source PDF on load. */
  fromPdf?: boolean;
}

export interface WhiteoutObject extends BaseObject {
  type: "whiteout";
  /** Fill color hex (sampled background or white). */
  color: string;
}

export interface ShapeObject extends BaseObject {
  type: "shape";
  shape: ShapeKind;
  stroke: string;
  strokeWidth: number;
  fill?: string;
  /** For lines: true = bottom-left to top-right, false = top-left to bottom-right. */
  antiDiagonal?: boolean;
}

export interface BrushObject extends BaseObject {
  type: "brush";
  /** Freehand points in PDF user space. */
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

export interface ImageObject extends BaseObject {
  type: "image";
  bytes: Uint8Array;
  mime: "png" | "jpeg";
  /** Data URL for the DOM overlay preview. */
  dataUrl: string;
}

export interface MarkObject extends BaseObject {
  type: "highlight" | "underline" | "strikethrough";
  color: string;
}

export type EditObject =
  | TextObject
  | WhiteoutObject
  | ShapeObject
  | BrushObject
  | ImageObject
  | MarkObject;

export function createObjectId(): string {
  return `obj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return {
    r: Number.isFinite(r) ? r : 0,
    g: Number.isFinite(g) ? g : 0,
    b: Number.isFinite(b) ? b : 0,
  };
}

function color(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return rgb(r, g, b);
}

const LINE_HEIGHT_FACTOR = 1.18;

/** Split text into lines, honoring explicit newlines. */
function textLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/**
 * Apply all editor objects onto the original PDF and return the new bytes.
 * Objects are drawn in array order (z-order), so callers should keep the list
 * ordered from bottom to top.
 */
export async function applyEdits(
  file: File,
  objects: EditObject[]
): Promise<Uint8Array> {
  const doc = await loadPdfDocument(file);
  const pages = doc.getPages();

  for (const obj of objects) {
    const page = pages[obj.page - 1];
    if (!page) continue;
    const opacity = obj.opacity ?? 1;

    switch (obj.type) {
      case "whiteout": {
        page.drawRectangle({
          x: obj.px,
          y: obj.py,
          width: obj.pw,
          height: obj.ph,
          color: color(obj.color),
        });
        break;
      }

      case "highlight": {
        page.drawRectangle({
          x: obj.px,
          y: obj.py,
          width: obj.pw,
          height: obj.ph,
          color: color(obj.color),
          opacity: 0.4,
        });
        break;
      }

      case "underline": {
        page.drawLine({
          start: { x: obj.px, y: obj.py },
          end: { x: obj.px + obj.pw, y: obj.py },
          thickness: 1.5,
          color: color(obj.color),
        });
        break;
      }

      case "strikethrough": {
        const midY = obj.py + obj.ph / 2;
        page.drawLine({
          start: { x: obj.px, y: midY },
          end: { x: obj.px + obj.pw, y: midY },
          thickness: 1.5,
          color: color(obj.color),
        });
        break;
      }

      case "shape": {
        if (obj.shape === "line") {
          const start = obj.antiDiagonal
            ? { x: obj.px, y: obj.py }
            : { x: obj.px, y: obj.py + obj.ph };
          const end = obj.antiDiagonal
            ? { x: obj.px + obj.pw, y: obj.py + obj.ph }
            : { x: obj.px + obj.pw, y: obj.py };
          page.drawLine({
            start,
            end,
            thickness: obj.strokeWidth,
            color: color(obj.stroke),
            opacity,
          });
        } else if (obj.shape === "ellipse") {
          page.drawEllipse({
            x: obj.px + obj.pw / 2,
            y: obj.py + obj.ph / 2,
            xScale: obj.pw / 2,
            yScale: obj.ph / 2,
            borderColor: color(obj.stroke),
            borderWidth: obj.strokeWidth,
            color: obj.fill ? color(obj.fill) : undefined,
            opacity: obj.fill ? opacity : undefined,
            borderOpacity: opacity,
          });
        } else {
          page.drawRectangle({
            x: obj.px,
            y: obj.py,
            width: obj.pw,
            height: obj.ph,
            borderColor: color(obj.stroke),
            borderWidth: obj.strokeWidth,
            color: obj.fill ? color(obj.fill) : undefined,
            opacity: obj.fill ? opacity : undefined,
            borderOpacity: opacity,
          });
        }
        break;
      }

      case "brush": {
        const c = color(obj.color);
        for (let i = 1; i < obj.points.length; i++) {
          const a = obj.points[i - 1];
          const b = obj.points[i];
          page.drawLine({
            start: { x: a.x, y: a.y },
            end: { x: b.x, y: b.y },
            thickness: obj.strokeWidth,
            color: c,
            opacity,
          });
        }
        break;
      }

      case "image": {
        try {
          const embedded =
            obj.mime === "png"
              ? await doc.embedPng(obj.bytes)
              : await doc.embedJpg(obj.bytes);
          page.drawImage(embedded, {
            x: obj.px,
            y: obj.py,
            width: obj.pw,
            height: obj.ph,
            opacity,
          });
        } catch {
          // Skip images that cannot be embedded (unsupported encoding).
        }
        break;
      }

      case "text": {
        const family = obj.fontFamily ?? DEFAULT_FONT_FAMILY;
        const font = await resolveFont(doc, family, obj.bold, obj.italic);
        const size = obj.fontSize;
        const ascentRatio = obj.ascentRatio ?? 0.82;
        const lines = textLines(obj.text);
        const leading = lines.length > 1 ? obj.ph / lines.length : size * LINE_HEIGHT_FACTOR;
        const c = color(obj.color);
        const firstBaseline =
          obj.baselineY ?? obj.py + obj.ph - size * ascentRatio;

        lines.forEach((line, i) => {
          const baselineY = firstBaseline - i * leading;
          const textWidth = font.widthOfTextAtSize(line, size);
          let x = obj.px;
          if (obj.align === "center") x = obj.px + (obj.pw - textWidth) / 2;
          else if (obj.align === "right") x = obj.px + obj.pw - textWidth;

          page.drawText(line, {
            x,
            y: baselineY,
            size,
            font,
            color: c,
            opacity,
          });

          if (obj.underline) {
            page.drawLine({
              start: { x, y: baselineY - size * 0.12 },
              end: { x: x + textWidth, y: baselineY - size * 0.12 },
              thickness: Math.max(0.5, size * 0.05),
              color: c,
              opacity,
            });
          }
          if (obj.strike) {
            page.drawLine({
              start: { x, y: baselineY + size * 0.3 },
              end: { x: x + textWidth, y: baselineY + size * 0.3 },
              thickness: Math.max(0.5, size * 0.05),
              color: c,
              opacity,
            });
          }
        });
        break;
      }
    }
  }

  return savePdf(doc);
}
