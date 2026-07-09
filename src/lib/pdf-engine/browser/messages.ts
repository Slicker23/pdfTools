/**
 * Browser PDF engine worker message types (M6 UX + M7 apply + M8 session).
 */
import type { ApplyPlan } from "../plan";
import type { PdfEditDocument, PdfEditPatch, PdfEditTextBlock } from "@/lib/pdf/edit-model";
import type { BlockOriginalSnapshot } from "../plan";
import type { PathSegment } from "../core/fonts/outlines/types";
import type { SessionIntent } from "./session";

export type WorkerRequest =
  | { type: "init"; id: string; pdfBytes: ArrayBuffer }
  | { type: "openSession"; id: string; document: PdfEditDocument }
  | { type: "intent"; id: string; intent: SessionIntent }
  | { type: "exportPatch"; id: string }
  | { type: "previewNative"; id: string }
  | { type: "previewFull"; id: string }
  | { type: "getSessionMeta"; id: string }
  | { type: "getBlocks"; id: string; page?: number; allPages?: boolean }
  | { type: "getOriginalSnapshot"; id: string; blockId: string }
  | {
      type: "predict";
      id: string;
      block: import("@/lib/pdf/edit-model").PdfEditBlockPatch;
      original?: BlockOriginalSnapshot;
    }
  | {
      type: "outlinePaths";
      id: string;
      locator: { page: number; streamNum: number; regionStart: number };
    }
  | { type: "applyNative"; id: string; patch: PdfEditPatch };

export type WorkerResponse =
  | { type: "ready"; id: string }
  | { type: "sessionOpened"; id: string; revision: number }
  | {
      type: "intentResult";
      id: string;
      revision: number;
      document: PdfEditDocument | null;
    }
  | { type: "exportPatchResult"; id: string; patch: PdfEditPatch | null; revision: number }
  | {
      type: "previewNativeResult";
      id: string;
      pdfBytes: ArrayBuffer;
      overlayBlockIds: string[];
      revision: number;
    }
  | {
      type: "previewFullResult";
      id: string;
      pdfBytes: ArrayBuffer;
      overlayBlockIds: string[];
      revision: number;
    }
  | {
      type: "originalSnapshotResult";
      id: string;
      snapshot?: BlockOriginalSnapshot;
      revision: number;
    }
  | {
      type: "sessionMetaResult";
      id: string;
      hasChanges: boolean;
      editedCount: number;
      revision: number;
    }
  | { type: "blocksResult"; id: string; blocks: PdfEditTextBlock[]; revision: number }
  | { type: "predictResult"; id: string; plan: ApplyPlan }
  | {
      type: "outlineResult";
      id: string;
      glyphs: PathSegment[][];
      fillColor?: { r: number; g: number; b: number; a: number };
      bbox?: [number, number, number, number];
    }
  | {
      type: "applyNativeResult";
      id: string;
      pdfBytes: ArrayBuffer;
      overlayBlockIds: string[];
    }
  | { type: "error"; id: string; message: string };
