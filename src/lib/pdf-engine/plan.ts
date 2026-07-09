/**
 * Isomorphic apply routing planner (M6 UX).
 *
 * Single source of truth for how a block patch is applied — shared by
 * server-side apply and browser worker UI prediction.
 */
import type { PdfEditBlockPatch, PdfEditBBox, PdfEditFont } from "../pdf/edit-model";
import { decodeLocator } from "./core";

export type OverlayReason =
  | "no-locator"
  | "style"
  | "unencodable"
  | "multiline"
  | "created"
  | "moved"
  | "outlined";

export type ApplyStrategy =
  | "skip"
  | "overlay"
  | "native-in-place"
  | "native-move"
  | "native-insert"
  | "native-flatten";

export interface BlockOriginalSnapshot {
  text: string;
  font: PdfEditFont;
  bbox: PdfEditBBox;
  baselineY?: number;
  insertAt?: { px: number; py: number };
  flattenToPath?: boolean;
  segments?: PdfEditBlockPatch["segments"];
}

export function isMergedBlock(block: PdfEditBlockPatch): boolean {
  return (block.segments?.length ?? 0) > 1;
}

export interface ApplyPlan {
  strategy: ApplyStrategy;
  reason?: OverlayReason;
  /** True when pdf-lib whiteout+redraw will run (overlay fallback). */
  overlay: boolean;
}

export function bboxDiffers(a: PdfEditBBox, b: PdfEditBBox, epsilon = 0.5): boolean {
  return Math.abs(a.px - b.px) > epsilon || Math.abs(a.py - b.py) > epsilon;
}

export function bboxMoved(block: PdfEditBlockPatch): boolean {
  const orig = block.originalBbox;
  const bbox = block.bbox;
  if (!orig || !bbox) return false;
  return bboxDiffers(orig, bbox);
}

function positionDiffers(
  block: PdfEditBlockPatch,
  original: BlockOriginalSnapshot
): boolean {
  if (!block.bbox) return false;
  if (bboxDiffers(block.bbox, original.bbox)) return true;
  if (
    block.baselineY !== undefined &&
    original.baselineY !== undefined &&
    Math.abs(block.baselineY - original.baselineY) > 0.5
  ) {
    return true;
  }
  if (block.insertAt && original.insertAt) {
    if (Math.abs(block.insertAt.px - original.insertAt.px) > 0.5) return true;
    if (Math.abs(block.insertAt.py - original.insertAt.py) > 0.5) return true;
  }
  return false;
}

function fontFamilyDiffers(a: PdfEditFont, b: PdfEditFont): boolean {
  return (
    a.name !== b.name ||
    Boolean(a.bold) !== Boolean(b.bold) ||
    Boolean(a.italic) !== Boolean(b.italic)
  );
}

function hasUnencodableChars(block: PdfEditBlockPatch): boolean {
  if (!block.encodableChars || !block.text) return false;
  for (const ch of block.text) {
    if (!block.encodableChars.includes(ch)) return true;
  }
  return false;
}

function fontStyleDiffers(a: PdfEditFont, b: PdfEditFont): boolean {
  return fontFamilyDiffers(a, b);
}

function colorOrSizeDiffers(a: PdfEditFont, b: PdfEditFont): boolean {
  if (a.color !== b.color) return true;
  return Math.abs(a.size - b.size) > 0.01;
}

function overlayReason(
  block: PdfEditBlockPatch,
  original: BlockOriginalSnapshot | undefined
): OverlayReason | undefined {
  if (!block.locator) return "no-locator";
  if ((block.text ?? "").includes("\n")) return "multiline";
  if (original && block.font && colorOrSizeDiffers(original.font, block.font)) {
    return "style";
  }
  if (original && block.font && fontStyleDiffers(original.font, block.font)) {
    if (!canNativeFontSwap(block, original)) return "style";
  }
  if (hasUnencodableChars(block)) return "unencodable";
  return undefined;
}

function needsOverlay(block: PdfEditBlockPatch, original?: BlockOriginalSnapshot): boolean {
  if (block.overlay) return true;
  if (isMergedBlock(block)) return true;
  if (!block.locator || !decodeLocator(block.locator)) return true;
  if ((block.text ?? "").includes("\n")) return true;
  if (original && block.font && colorOrSizeDiffers(original.font, block.font)) {
    return true;
  }
  if (original && block.font && fontStyleDiffers(original.font, block.font)) {
    if (!canNativeFontSwap(block, original)) return true;
  }
  if (hasUnencodableChars(block)) return true;
  return false;
}

function familiesCompatible(a: string, b: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (na.includes(nb) || nb.includes(na)) return true;
  const generic = (name: string): "sans" | "serif" | "mono" => {
    const lower = name.toLowerCase();
    if (/courier|mono/.test(lower)) return "mono";
    if (/times|georgia|serif/.test(lower) && !/sans|sans-serif|sansserif/.test(lower)) {
      return "serif";
    }
    return "sans";
  };
  return generic(a) === generic(b);
}

/** True when bold/italic/family can be swapped via page `/Font` resources (M9). */
export function canNativeFontSwap(
  block: PdfEditBlockPatch,
  original?: BlockOriginalSnapshot
): boolean {
  if (!block.locator || !decodeLocator(block.locator)) return false;
  if ((block.text ?? "").includes("\n")) return false;
  if (hasUnencodableChars(block)) return false;
  if (!original?.font || !block.font) return false;
  if (!fontStyleDiffers(original.font, block.font)) return false;
  if (original.font.name.toLowerCase() !== block.font.name.toLowerCase()) {
    return familiesCompatible(original.font.name, block.font.name);
  }
  return true;
}

export function canNativeFlatten(block: PdfEditBlockPatch): boolean {
  if (isMergedBlock(block)) return false;
  if (block.deleted || block.created || !block.flattenToPath) return false;
  if (!block.locator || !decodeLocator(block.locator)) return false;
  return true;
}

export function canNativeMove(block: PdfEditBlockPatch): boolean {
  if (isMergedBlock(block)) return false;
  if (block.flattenToPath) return false;
  if (block.deleted || block.created || block.overlay) return false;
  if (!block.locator || !decodeLocator(block.locator)) return false;
  if (!bboxMoved(block)) return false;
  if ((block.text ?? "").includes("\n")) return false;
  return true;
}

export function canPreEditForFlatten(block: PdfEditBlockPatch): boolean {
  if (!canNativeFlatten(block) || block.overlay) return false;
  if (bboxMoved(block)) return false;
  return true;
}

export function canNativeInPlace(block: PdfEditBlockPatch): boolean {
  if (isMergedBlock(block)) return false;
  if (block.flattenToPath) return false;
  if (block.overlay) return false;
  if (!block.locator || !decodeLocator(block.locator)) return false;
  if (bboxMoved(block)) return false;
  return true;
}

/** Route a changed block to an apply strategy (UI + worker). */
export function predictBlockApply(
  block: PdfEditBlockPatch,
  original?: BlockOriginalSnapshot
): ApplyPlan {
  if (!block.modified && !block.deleted && !block.created) {
    return { strategy: "skip", overlay: false };
  }

  if (block.created) {
    return { strategy: "native-insert", reason: "created", overlay: false };
  }

  if (block.deleted) {
    if (block.locator && decodeLocator(block.locator) && !block.overlay) {
      return { strategy: "native-in-place", overlay: false };
    }
    return { strategy: "overlay", overlay: true };
  }

  if (canNativeFlatten(block)) {
    return { strategy: "native-flatten", reason: "outlined", overlay: false };
  }

  if (canNativeInPlace(block) && !needsOverlay(block, original)) {
    return { strategy: "native-in-place", overlay: false };
  }

  if (canNativeMove(block) && !needsOverlay(block, original)) {
    return { strategy: "native-move", reason: "moved", overlay: false };
  }

  if (canPreEditForFlatten(block)) {
    return { strategy: "native-flatten", reason: "outlined", overlay: false };
  }

  const reason = overlayReason(block, original) ?? "no-locator";
  return { strategy: "overlay", reason, overlay: true };
}

/** @deprecated Use predictBlockApply().overlay */
export function willUseOverlay(
  block: PdfEditBlockPatch,
  original?: BlockOriginalSnapshot
): { overlay: boolean; reason?: OverlayReason } {
  const plan = predictBlockApply(block, original);
  return { overlay: plan.overlay, reason: plan.reason };
}

/** True when live text is whitespace-only but original had content (delete on download). */
export function willRemoveOnDownload(
  block: PdfEditBlockPatch,
  originalText: string | undefined
): boolean {
  if (block.deleted) return false;
  if (!originalText?.trim()) return false;
  return (block.text ?? "").trim().length === 0;
}

/** Blocks that applyPatch would send to the pdf-lib overlay fallback. */
export function isOverlayBlock(block: PdfEditBlockPatch): boolean {
  if (block.created) return false;
  if (isMergedBlock(block)) return true;
  if (block.overlay) return true;
  return (
    !canNativeMove(block) &&
    !canNativeInPlace(block) &&
    !canPreEditForFlatten(block) &&
    !canNativeFlatten(block)
  );
}
