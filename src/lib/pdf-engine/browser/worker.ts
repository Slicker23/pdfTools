/**
 * Browser Web Worker for PDF engine apply planning + native preview (M6/M7/M8).
 */
import { CosDocument, getBlockOutlinePaths } from "../core";
import { applyNativePatch } from "../apply-native";
import { browserAdapters } from "./platform-browser";
import { predictBlockApply } from "../plan";
import { EditSession } from "./session";
import type { WorkerRequest, WorkerResponse } from "./messages";

let pdfBytes: Uint8Array | null = null;
let docPromise: Promise<CosDocument> | null = null;
const session = new EditSession();

async function getDoc(): Promise<CosDocument> {
  if (!pdfBytes) throw new Error("Worker not initialized");
  if (!docPromise) {
    docPromise = CosDocument.open(pdfBytes, { inflate: browserAdapters.inflate });
  }
  return docPromise;
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  const id = "id" in msg ? msg.id : "init";

  try {
    if (msg.type === "init") {
      pdfBytes = new Uint8Array(msg.pdfBytes);
      docPromise = null;
      const response: WorkerResponse = { type: "ready", id };
      self.postMessage(response);
      return;
    }

    if (msg.type === "openSession") {
      if (!pdfBytes) throw new Error("Worker not initialized");
      const { revision } = session.open(pdfBytes, msg.document, browserAdapters);
      const response: WorkerResponse = { type: "sessionOpened", id, revision };
      self.postMessage(response);
      return;
    }

    if (msg.type === "intent") {
      const result = session.applyIntent(msg.intent);
      const response: WorkerResponse = {
        type: "intentResult",
        id,
        revision: result.revision,
        document: result.document,
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === "exportPatch") {
      const patch = session.exportPatch();
      const response: WorkerResponse = {
        type: "exportPatchResult",
        id,
        patch,
        revision: session.getRevision(),
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === "previewNative") {
      const { pdfBytes: out, overlayBlockIds } = await session.previewNative();
      const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
      const response: WorkerResponse = {
        type: "previewNativeResult",
        id,
        pdfBytes: buf,
        overlayBlockIds,
        revision: session.getRevision(),
      };
      self.postMessage(response, { transfer: [buf] });
      return;
    }

    if (msg.type === "previewFull") {
      const { pdfBytes: out, overlayBlockIds } = await session.previewFull();
      const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
      const response: WorkerResponse = {
        type: "previewFullResult",
        id,
        pdfBytes: buf,
        overlayBlockIds,
        revision: session.getRevision(),
      };
      self.postMessage(response, { transfer: [buf] });
      return;
    }

    if (msg.type === "getOriginalSnapshot") {
      const snapshot = session.getOriginalSnapshot(msg.blockId);
      const response: WorkerResponse = {
        type: "originalSnapshotResult",
        id,
        snapshot,
        revision: session.getRevision(),
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === "getSessionMeta") {
      const meta = session.getSessionMeta();
      const response: WorkerResponse = {
        type: "sessionMetaResult",
        id,
        hasChanges: meta.hasChanges,
        editedCount: meta.editedCount,
        revision: meta.revision,
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === "getBlocks") {
      const blocks = session.getBlocks({ page: msg.page, allPages: msg.allPages });
      const response: WorkerResponse = {
        type: "blocksResult",
        id,
        blocks,
        revision: session.getRevision(),
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === "predict") {
      const plan = predictBlockApply(msg.block, msg.original);
      const response: WorkerResponse = { type: "predictResult", id, plan };
      self.postMessage(response);
      return;
    }

    if (msg.type === "outlinePaths") {
      const doc = await getDoc();
      const result = await getBlockOutlinePaths(doc, msg.locator);
      if (!result) {
        const response: WorkerResponse = {
          type: "outlineResult",
          id,
          glyphs: [],
        };
        self.postMessage(response);
        return;
      }
      const response: WorkerResponse = {
        type: "outlineResult",
        id,
        glyphs: result.glyphs,
        fillColor: result.fillColor,
        bbox: result.bbox,
      };
      self.postMessage(response);
      return;
    }

    if (msg.type === "applyNative") {
      if (!pdfBytes) throw new Error("Worker not initialized");
      const { output, overlayBlocks } = await applyNativePatch(
        pdfBytes,
        msg.patch,
        browserAdapters
      );
      const buf = output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength
      ) as ArrayBuffer;
      const response: WorkerResponse = {
        type: "applyNativeResult",
        id,
        pdfBytes: buf,
        overlayBlockIds: overlayBlocks.map((b) => b.id),
      };
      self.postMessage(response, { transfer: [buf] });
      return;
    }
  } catch (err) {
    const response: WorkerResponse = {
      type: "error",
      id,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};

export {};
