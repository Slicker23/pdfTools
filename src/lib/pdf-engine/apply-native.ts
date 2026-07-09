/**
 * Native-only PDF patch apply (CosDocument engine, no pdf-lib).
 */
import type { PdfEditBlockPatch, PdfEditPatch } from "../pdf/edit-model";
import {
  CosDocument,
  decodeLocator,
  editText,
  encodeLocator,
  flattenTextRuns,
  insertTextBlocks,
  relocateTextRuns,
  type TextEdit,
  type TextFlatten,
  type TextMove,
} from "./core";
import type { PlatformAdapters } from "./core/platform";
import {
  canNativeFlatten,
  canNativeInPlace,
  canNativeMove,
  canPreEditForFlatten,
  isOverlayBlock,
} from "./plan";

function blockToFlatten(block: PdfEditBlockPatch): TextFlatten | null {
  const locator = block.locator ? decodeLocator(block.locator) : undefined;
  if (!locator) return null;
  return { locator };
}

function blockToMove(block: PdfEditBlockPatch): TextMove | null {
  const locator = block.locator ? decodeLocator(block.locator) : undefined;
  const bbox = block.bbox;
  if (!locator || !bbox) return null;
  return {
    locator,
    x: block.insertAt?.px ?? bbox.px,
    y: block.baselineY ?? block.insertAt?.py ?? bbox.py,
    text: block.text ?? "",
  };
}

export interface ApplyNativeResult {
  output: Uint8Array;
  overlayBlocks: PdfEditBlockPatch[];
}

/**
 * Apply native engine operations only. Blocks that need pdf-lib overlay are
 * returned in `overlayBlocks` for a follow-up `applyOverlayPatch` call.
 */
export async function applyNativePatch(
  input: Uint8Array,
  patch: PdfEditPatch,
  adapters: PlatformAdapters
): Promise<ApplyNativeResult> {
  const changed = patch.blocks.filter((b) => b.modified || b.deleted || b.created);
  if (!changed.length) {
    return { output: input.slice(), overlayBlocks: [] };
  }

  let bytes: Uint8Array = input.slice();
  const overlayBlocks: PdfEditBlockPatch[] = [];

  const createdBlocks = changed.filter((b) => b.created);
  const editBlocks = changed.filter((b) => !b.created);

  if (createdBlocks.length) {
    const insertResult = await insertTextBlocks(
      bytes,
      createdBlocks,
      adapters.deflate,
      adapters.inflate
    );
    bytes = insertResult.output;
    if (insertResult.skippedIds.length) {
      overlayBlocks.push(...createdBlocks.filter((b) => insertResult.skippedIds.includes(b.id)));
    }
  }

  if (!editBlocks.length && !overlayBlocks.length) {
    return { output: bytes, overlayBlocks: [] };
  }

  const moveBlocks = editBlocks.filter(canNativeMove);
  const flattenBlocks = editBlocks.filter(canNativeFlatten);
  const inPlaceBlocks = editBlocks.filter(
    (b) => canNativeInPlace(b) || canPreEditForFlatten(b)
  );
  overlayBlocks.push(...editBlocks.filter(isOverlayBlock));

  if (moveBlocks.length) {
    try {
      const doc = await CosDocument.open(bytes, { inflate: adapters.inflate });
      const moves = moveBlocks
        .map(blockToMove)
        .filter((m): m is TextMove => m !== null);
      const result = await relocateTextRuns(doc, moves, adapters.deflate);
      bytes = result.output;
      const skipped = new Set(result.skipped.map((s) => encodeLocator(s.locator)));
      for (const b of moveBlocks) {
        if (b.locator && skipped.has(b.locator)) overlayBlocks.push(b);
      }
    } catch {
      overlayBlocks.push(...moveBlocks);
    }
  }

  if (inPlaceBlocks.length) {
    try {
      const doc = await CosDocument.open(bytes, { inflate: adapters.inflate });
      const edits: TextEdit[] = inPlaceBlocks.map((b) => ({
        locator: decodeLocator(b.locator!)!,
        newText: b.deleted ? "" : b.text ?? "",
        newColor: b.font?.color,
        newSize: b.font?.size,
        originalColor: b.originalFont?.color,
        originalSize: b.originalFont?.size,
        newFontFamily: b.font?.name,
        newBold: b.font?.bold,
        newItalic: b.font?.italic,
      }));
      const result = await editText(doc, edits, adapters.deflate);
      bytes = result.output;
      const skipped = new Set(result.skipped.map((s) => encodeLocator(s.locator)));
      for (const b of inPlaceBlocks) {
        if (b.locator && skipped.has(b.locator)) overlayBlocks.push(b);
      }
    } catch {
      overlayBlocks.push(...inPlaceBlocks);
    }
  }

  if (flattenBlocks.length) {
    try {
      const doc = await CosDocument.open(bytes, { inflate: adapters.inflate });
      const flattens = flattenBlocks
        .map(blockToFlatten)
        .filter((f): f is TextFlatten => f !== null);
      const result = await flattenTextRuns(doc, flattens, adapters.deflate);
      bytes = result.output;
      const skipped = new Set(result.skipped.map((s) => encodeLocator(s.locator)));
      for (const b of flattenBlocks) {
        if (b.locator && skipped.has(b.locator)) overlayBlocks.push(b);
      }
    } catch {
      overlayBlocks.push(...flattenBlocks);
    }
  }

  return { output: bytes, overlayBlocks };
}
