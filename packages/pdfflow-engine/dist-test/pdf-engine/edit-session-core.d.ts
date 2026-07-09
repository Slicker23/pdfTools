/**
 * Isomorphic edit-session logic (M9) — shared by worker session and tests.
 */
import type { PdfEditDocument, PdfEditFont, PdfEditPatch, PdfEditTextBlock } from "@/lib/pdf/edit-model";
import { type BlockOriginalSnapshot } from "./plan";
export type SessionIntent = {
    kind: "updateText";
    id: string;
    text: string;
} | {
    kind: "updateStyle";
    id: string;
    patch: Partial<{
        color: string;
        size: number;
        bold: boolean;
        italic: boolean;
        fontName: string;
    }>;
} | {
    kind: "updatePosition";
    id: string;
    position: {
        px: number;
        py: number;
    };
} | {
    kind: "updateFlatten";
    id: string;
    flatten: boolean;
} | {
    kind: "removeBlock";
    id: string;
} | {
    kind: "resetBlock";
    id: string;
} | {
    kind: "resetAll";
} | {
    kind: "addBlock";
    block: PdfEditTextBlock;
};
export type OriginalSnapshot = BlockOriginalSnapshot;
export declare function cloneDocument(doc: PdfEditDocument): PdfEditDocument;
export declare function updateOneBlock(doc: PdfEditDocument, id: string, fn: (block: PdfEditTextBlock) => PdfEditTextBlock): PdfEditDocument;
export declare function snapshotFromBlock(block: PdfEditTextBlock): OriginalSnapshot;
export declare function positionDiffers(block: PdfEditTextBlock, original: OriginalSnapshot): boolean;
export declare function fontDiffers(a: PdfEditFont, b: PdfEditFont): boolean;
export declare function blockContentIsChanged(id: string, block: PdfEditTextBlock, originals: Map<string, OriginalSnapshot>): boolean;
export declare function blockIsChanged(id: string, block: PdfEditTextBlock, originals: Map<string, OriginalSnapshot>): boolean;
export declare function withLiveFlags(id: string, block: PdfEditTextBlock, originals: Map<string, OriginalSnapshot>): PdfEditTextBlock;
export declare function withPatchFlags(id: string, block: PdfEditTextBlock, originals: Map<string, OriginalSnapshot>): PdfEditTextBlock;
export declare function exportPatchFromDocument(document: PdfEditDocument, originals: Map<string, OriginalSnapshot>): PdfEditPatch | null;
export declare function computeSessionMeta(document: PdfEditDocument | null, originals: Map<string, OriginalSnapshot>, revision: number): {
    hasChanges: boolean;
    editedCount: number;
    revision: number;
};
export declare function applyIntentToState(document: PdfEditDocument, originals: Map<string, OriginalSnapshot>, intent: SessionIntent): PdfEditDocument;
export declare function cloneOriginalSnapshot(original: OriginalSnapshot): BlockOriginalSnapshot;
//# sourceMappingURL=edit-session-core.d.ts.map