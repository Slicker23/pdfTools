/**
 * Isomorphic edit-session logic (M9) — shared by worker session and tests.
 */
import type {
  PdfEditDocument,
  PdfEditFont,
  PdfEditPatch,
  PdfEditTextBlock,
} from "../pdf/edit-model";
import { buildPdfEditPatch } from "../pdf/edit-model";
import { clampBlockToPage, translateBlockPosition } from "../pdf/edit-geometry";
import { layoutBlockWithinPage } from "../pdf/text-layout";
import {
  bboxDiffers,
  predictBlockApply,
  type BlockOriginalSnapshot,
} from "./plan";

export type SessionIntent =
  | { kind: "updateText"; id: string; text: string }
  | {
      kind: "updateStyle";
      id: string;
      patch: Partial<{
        color: string;
        size: number;
        bold: boolean;
        italic: boolean;
        fontName: string;
      }>;
    }
  | { kind: "updatePosition"; id: string; position: { px: number; py: number } }
  | { kind: "updateFlatten"; id: string; flatten: boolean }
  | { kind: "removeBlock"; id: string }
  | { kind: "resetBlock"; id: string }
  | { kind: "resetAll" }
  | { kind: "addBlock"; block: PdfEditTextBlock };

export type OriginalSnapshot = BlockOriginalSnapshot;

export function cloneDocument(doc: PdfEditDocument): PdfEditDocument {
  return JSON.parse(JSON.stringify(doc)) as PdfEditDocument;
}

export function updateOneBlock(
  doc: PdfEditDocument,
  id: string,
  fn: (block: PdfEditTextBlock) => PdfEditTextBlock
): PdfEditDocument {
  let changed = false;
  const pages = doc.pages.map((page) => {
    if (changed) return page;
    let touched = false;
    const blocks = page.blocks.map((b) => {
      if (b.id !== id) return b;
      touched = true;
      changed = true;
      return fn(b);
    });
    return touched ? { ...page, blocks } : page;
  });
  return changed ? { ...doc, pages } : doc;
}

export function snapshotFromBlock(block: PdfEditTextBlock): OriginalSnapshot {
  return {
    text: block.text,
    font: { ...block.font },
    bbox: { ...block.bbox },
    baselineY: block.baselineY,
    insertAt: block.insertAt ? { ...block.insertAt } : undefined,
    flattenToPath: block.flattenToPath,
    segments: block.segments?.map((s) => ({
      locator: s.locator,
      text: s.text,
      bbox: { ...s.bbox },
    })),
  };
}

export function positionDiffers(block: PdfEditTextBlock, original: OriginalSnapshot): boolean {
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

export function fontDiffers(a: PdfEditFont, b: PdfEditFont): boolean {
  return (
    a.name !== b.name ||
    a.size !== b.size ||
    Boolean(a.bold) !== Boolean(b.bold) ||
    Boolean(a.italic) !== Boolean(b.italic) ||
    a.color !== b.color
  );
}

export function blockContentIsChanged(
  id: string,
  block: PdfEditTextBlock,
  originals: Map<string, OriginalSnapshot>
): boolean {
  if (block.created) return true;
  const original = originals.get(id);
  if (!original) return false;
  if (block.text !== original.text) return true;
  return fontDiffers(original.font, block.font);
}

export function blockIsChanged(
  id: string,
  block: PdfEditTextBlock,
  originals: Map<string, OriginalSnapshot>
): boolean {
  if (block.created) {
    if (block.deleted) return false;
    return (block.text ?? "").trim().length > 0;
  }
  if (block.deleted) return true;
  const original = originals.get(id);
  if (!original) return Boolean(block.modified || block.created);
  if (block.text !== original.text) return true;
  if (fontDiffers(original.font, block.font)) return true;
  if (Boolean(block.flattenToPath) !== Boolean(original.flattenToPath)) return true;
  return positionDiffers(block, original);
}

export function withLiveFlags(
  id: string,
  block: PdfEditTextBlock,
  originals: Map<string, OriginalSnapshot>
): PdfEditTextBlock {
  const changed = blockIsChanged(id, block, originals);
  return {
    ...block,
    modified: changed,
    deleted: block.deleted ?? false,
  };
}

export function withPatchFlags(
  id: string,
  block: PdfEditTextBlock,
  originals: Map<string, OriginalSnapshot>
): PdfEditTextBlock {
  if (!block.deleted && block.text.trim().length === 0) {
    const original = originals.get(id);
    if (original?.text.trim()) {
      return { ...block, deleted: true, modified: true, text: "" };
    }
  }
  return withLiveFlags(id, block, originals);
}

export function exportPatchFromDocument(
  document: PdfEditDocument,
  originals: Map<string, OriginalSnapshot>
): PdfEditPatch | null {
  const all = document.pages
    .flatMap((p) => p.blocks)
    .map((b) => withPatchFlags(b.id, b, originals))
    .filter((b) => blockIsChanged(b.id, b, originals));
  const patch = buildPdfEditPatch(document, all);
  if (patch.blocks.length === 0) return null;
  patch.blocks = patch.blocks.map((b) => {
    if (b.deleted || b.created) return b;
    const block = all.find((x) => x.id === b.id);
    const original = originals.get(b.id);
    const plan = block ? predictBlockApply(block, original) : { overlay: false };
    let out = b;
    if (plan.overlay) out = { ...out, overlay: true };
    if (original && b.bbox && bboxDiffers(b.bbox, original.bbox)) {
      out = { ...out, originalBbox: { ...original.bbox } };
    }
    if (original && b.font && (fontDiffers(original.font, b.font) || out.overlay)) {
      out = { ...out, originalFont: { ...original.font } };
    }
    return out;
  });
  return patch;
}

export function computeSessionMeta(
  document: PdfEditDocument | null,
  originals: Map<string, OriginalSnapshot>,
  revision: number
): { hasChanges: boolean; editedCount: number; revision: number } {
  if (!document) {
    return { hasChanges: false, editedCount: 0, revision };
  }
  const editedCount = document.pages.reduce(
    (sum, p) =>
      sum +
      p.blocks.filter((b) =>
        blockIsChanged(b.id, withLiveFlags(b.id, b, originals), originals)
      ).length,
    0
  );
  return { hasChanges: editedCount > 0, editedCount, revision };
}

function findBlockPage(document: PdfEditDocument, blockId: string) {
  return document.pages.find((p) => p.blocks.some((b) => b.id === blockId));
}

function layoutBlockOnPage(block: PdfEditTextBlock, page: PdfEditDocument["pages"][number]) {
  return layoutBlockWithinPage(block, page.width, page.height);
}

export function applyIntentToState(
  document: PdfEditDocument,
  originals: Map<string, OriginalSnapshot>,
  intent: SessionIntent
): PdfEditDocument {
  switch (intent.kind) {
    case "updateText":
      return updateOneBlock(document, intent.id, (b) => {
        const page = findBlockPage(document, intent.id);
        let next: PdfEditTextBlock = { ...b, text: intent.text, deleted: false };
        if (page) next = layoutBlockOnPage(next, page);
        return withLiveFlags(intent.id, next, originals);
      });
    case "updateStyle":
      return updateOneBlock(document, intent.id, (b) => {
        const font = { ...b.font };
        const patch = intent.patch;
        if (patch.color !== undefined) font.color = patch.color;
        if (patch.size !== undefined) font.size = patch.size;
        if (patch.bold !== undefined) font.bold = patch.bold;
        if (patch.italic !== undefined) font.italic = patch.italic;
        if (patch.fontName !== undefined) font.name = patch.fontName;
        const page = findBlockPage(document, intent.id);
        let next: PdfEditTextBlock = { ...b, font };
        if (page) next = layoutBlockOnPage(next, page);
        return withLiveFlags(intent.id, next, originals);
      });
    case "updatePosition": {
      const page = document.pages.find((p) => p.blocks.some((b) => b.id === intent.id));
      if (!page) return document;
      return updateOneBlock(document, intent.id, (b) => {
        if (b.deleted) return b;
        const deltaPx = intent.position.px - b.bbox.px;
        const deltaPy = intent.position.py - b.bbox.py;
        if (Math.abs(deltaPx) < 0.01 && Math.abs(deltaPy) < 0.01) return b;
        const translated = { ...b, ...translateBlockPosition(b, deltaPx, deltaPy) };
        const contentEdited = blockContentIsChanged(intent.id, translated, originals);
        const clamped = clampBlockToPage(translated, page.width, page.height, contentEdited);
        return withLiveFlags(intent.id, clamped, originals);
      });
    }
    case "updateFlatten":
      return updateOneBlock(document, intent.id, (b) => {
        if (b.created || !b.locator) return b;
        return withLiveFlags(intent.id, { ...b, flattenToPath: intent.flatten }, originals);
      });
    case "removeBlock":
      return updateOneBlock(document, intent.id, (b) => ({
        ...b,
        deleted: true,
        modified: true,
      }));
    case "resetBlock": {
      const original = originals.get(intent.id);
      if (!original) return document;
      return updateOneBlock(document, intent.id, (b) => ({
        ...b,
        text: original.text,
        font: { ...original.font },
        bbox: { ...original.bbox },
        baselineY: original.baselineY,
        insertAt: original.insertAt ? { ...original.insertAt } : undefined,
        flattenToPath: original.flattenToPath,
        segments: original.segments?.map((s) => ({
          locator: s.locator,
          text: s.text,
          bbox: { ...s.bbox },
        })),
        modified: false,
        deleted: false,
      }));
    }
    case "resetAll":
      return {
        ...document,
        pages: document.pages.map((page) => ({
          ...page,
          blocks: page.blocks
            .map((block) => {
              if (!blockIsChanged(block.id, block, originals)) return block;
              const original = originals.get(block.id);
              if (!original) {
                if (block.created) return null;
                return block;
              }
              return {
                ...block,
                text: original.text,
                font: { ...original.font },
                bbox: { ...original.bbox },
                baselineY: original.baselineY,
                insertAt: original.insertAt ? { ...original.insertAt } : undefined,
                flattenToPath: original.flattenToPath,
                segments: original.segments?.map((s) => ({
                  locator: s.locator,
                  text: s.text,
                  bbox: { ...s.bbox },
                })),
                modified: false,
                deleted: false,
              };
            })
            .filter((b): b is PdfEditTextBlock => b !== null),
        })),
      };
    case "addBlock": {
      const page = document.pages.find((p) => p.number === intent.block.page);
      let block = withLiveFlags(intent.block.id, intent.block, originals);
      if (page) block = layoutBlockOnPage(block, page);
      return {
        ...document,
        pages: document.pages.map((page) =>
          page.number === intent.block.page
            ? { ...page, blocks: [...page.blocks, block] }
            : page
        ),
      };
    }
  }
}

export function cloneOriginalSnapshot(original: OriginalSnapshot): BlockOriginalSnapshot {
  return {
    text: original.text,
    font: { ...original.font },
    bbox: { ...original.bbox },
    baselineY: original.baselineY,
    insertAt: original.insertAt ? { ...original.insertAt } : undefined,
    flattenToPath: original.flattenToPath,
    segments: original.segments?.map((s) => ({
      locator: s.locator,
      text: s.text,
      bbox: { ...s.bbox },
    })),
  };
}
