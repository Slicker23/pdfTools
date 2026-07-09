/**
 * Worker-owned edit session state (M8/M9).
 */
import type { PdfEditDocument, PdfEditPatch, PdfEditTextBlock } from "@/lib/pdf/edit-model";
import type { BlockOriginalSnapshot } from "../plan";
import {
  applyIntentToState,
  cloneDocument,
  cloneOriginalSnapshot,
  computeSessionMeta,
  exportPatchFromDocument,
  snapshotFromBlock,
  type OriginalSnapshot,
  type SessionIntent,
} from "../edit-session-core";
import { applyOverlayFull } from "../apply-full";
import { applyNativePatch } from "../apply-native";
import { createBrowserOverlayPlatform } from "../apply-overlay-browser";
import { sampleOverlayBackgroundsInWorker } from "./sample-bg-worker";
import type { PlatformAdapters } from "../core/platform";

export type { SessionIntent } from "../edit-session-core";
export {
  blockContentIsChanged,
  blockIsChanged,
} from "../edit-session-core";

export class EditSession {
  private document: PdfEditDocument | null = null;
  private originals = new Map<string, OriginalSnapshot>();
  private revision = 0;
  private pdfBytes: Uint8Array | null = null;
  private adapters: PlatformAdapters | null = null;

  open(
    pdfBytes: Uint8Array,
    document: PdfEditDocument,
    adapters: PlatformAdapters
  ): { revision: number } {
    this.pdfBytes = pdfBytes;
    this.adapters = adapters;
    this.document = cloneDocument(document);
    this.originals = new Map();
    for (const page of this.document.pages) {
      for (const block of page.blocks) {
        this.originals.set(block.id, snapshotFromBlock(block));
      }
    }
    this.revision += 1;
    return { revision: this.revision };
  }

  getRevision(): number {
    return this.revision;
  }

  getDocument(): PdfEditDocument | null {
    return this.document ? cloneDocument(this.document) : null;
  }

  getSessionMeta(): { hasChanges: boolean; editedCount: number; revision: number } {
    return computeSessionMeta(this.document, this.originals, this.revision);
  }

  getBlocks(filter?: { page?: number; allPages?: boolean }): PdfEditTextBlock[] {
    if (!this.document) return [];
    if (filter?.page !== undefined) {
      const page = this.document.pages.find((p) => p.number === filter.page);
      return page ? page.blocks.map((b) => ({ ...b })) : [];
    }
    if (filter?.allPages) {
      return this.document.pages.flatMap((p) => p.blocks.map((b) => ({ ...b })));
    }
    return this.document.pages.flatMap((p) => p.blocks.map((b) => ({ ...b })));
  }

  getOriginalSnapshot(id: string): BlockOriginalSnapshot | undefined {
    const original = this.originals.get(id);
    if (!original) return undefined;
    return cloneOriginalSnapshot(original);
  }

  applyIntent(intent: SessionIntent): { revision: number; document: PdfEditDocument | null } {
    if (!this.document) throw new Error("Session not open");
    this.document = applyIntentToState(this.document, this.originals, intent);
    this.revision += 1;
    return { revision: this.revision, document: this.getDocument() };
  }

  exportPatch(): PdfEditPatch | null {
    if (!this.document) return null;
    return exportPatchFromDocument(this.document, this.originals);
  }

  async previewNative(): Promise<{ pdfBytes: Uint8Array; overlayBlockIds: string[] }> {
    if (!this.pdfBytes || !this.adapters) throw new Error("Session not open");
    const patch = this.exportPatch();
    if (!patch) {
      return { pdfBytes: this.pdfBytes.slice(), overlayBlockIds: [] };
    }
    const { output, overlayBlocks } = await applyNativePatch(
      this.pdfBytes,
      patch,
      this.adapters
    );
    return { pdfBytes: output, overlayBlockIds: overlayBlocks.map((b) => b.id) };
  }

  async previewFull(): Promise<{ pdfBytes: Uint8Array; overlayBlockIds: string[] }> {
    if (!this.pdfBytes || !this.adapters) throw new Error("Session not open");
    const patch = this.exportPatch();
    if (!patch) {
      return { pdfBytes: this.pdfBytes.slice(), overlayBlockIds: [] };
    }
    const platform = createBrowserOverlayPlatform();
    const { output, overlayBlocks } = await applyNativePatch(
      this.pdfBytes,
      patch,
      this.adapters
    );
    if (!overlayBlocks.length) {
      return { pdfBytes: output, overlayBlockIds: [] };
    }
    const full = await applyOverlayFull(
      output,
      overlayBlocks,
      this.adapters,
      platform,
      sampleOverlayBackgroundsInWorker
    );
    return {
      pdfBytes: full,
      overlayBlockIds: overlayBlocks.map((b) => b.id),
    };
  }
}
