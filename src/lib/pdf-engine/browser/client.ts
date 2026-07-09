"use client";

/**
 * Typed client for the PDF engine browser worker (M6–M9).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PdfEditDocument,
  PdfEditBlockPatch,
  PdfEditPatch,
} from "@/lib/pdf/edit-model";
import type { ApplyPlan, BlockOriginalSnapshot } from "../plan";
import type { PathSegment } from "../core/fonts/outlines/types";
import type { WorkerRequest, WorkerResponse } from "./messages";
import type { SessionIntent } from "../edit-session-core";

export interface ApplyNativeResult {
  pdfBytes: ArrayBuffer;
  overlayBlockIds: string[];
}

export interface OutlinePreviewData {
  glyphs: PathSegment[][];
  fillColor?: { r: number; g: number; b: number; a: number };
  bbox?: [number, number, number, number];
}

export interface SessionMeta {
  hasChanges: boolean;
  editedCount: number;
  revision: number;
}

export interface IntentResult {
  revision: number;
  document: PdfEditDocument | null;
}

let reqCounter = 0;

function nextId(): string {
  reqCounter += 1;
  return String(reqCounter);
}

export function useEngineWorker(pdfBytes: ArrayBuffer | null) {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(
    new Map<string, { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void }>()
  );
  const [ready, setReady] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);

  const bumpRevision = useCallback((msg: WorkerResponse) => {
    if (
      msg.type === "sessionOpened" ||
      msg.type === "intentResult" ||
      msg.type === "exportPatchResult" ||
      msg.type === "previewNativeResult" ||
      msg.type === "previewFullResult" ||
      msg.type === "originalSnapshotResult" ||
      msg.type === "sessionMetaResult" ||
      msg.type === "blocksResult"
    ) {
      setSessionRevision(msg.revision);
    }
  }, []);

  useEffect(() => {
    if (!pdfBytes) {
      workerRef.current?.terminate();
      workerRef.current = null;
      setReady(false);
      setSessionRevision(0);
      return;
    }

    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const pending = pendingRef.current.get(msg.id);
      if (pending) {
        pendingRef.current.delete(msg.id);
        pending.resolve(msg);
      }
      if (msg.type === "ready") setReady(true);
      bumpRevision(msg);
    };

    worker.onerror = () => {
      setReady(false);
    };

    const initId = nextId();
    const workerCopy = pdfBytes.slice(0);
    worker.postMessage({ type: "init", id: initId, pdfBytes: workerCopy }, [workerCopy]);

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
      setReady(false);
      setSessionRevision(0);
    };
  }, [pdfBytes, bumpRevision]);

  const post = useCallback((req: WorkerRequest): Promise<WorkerResponse> => {
    return new Promise((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) {
        reject(new Error("Engine worker not ready"));
        return;
      }
      pendingRef.current.set(req.id, { resolve, reject });
      worker.postMessage(req);
    });
  }, []);

  const openSession = useCallback(
    async (document: PdfEditDocument): Promise<number> => {
      const id = nextId();
      const res = await post({ type: "openSession", id, document });
      if (res.type === "error") throw new Error(res.message);
      if (res.type !== "sessionOpened") throw new Error("Unexpected worker response");
      return res.revision;
    },
    [post]
  );

  const intent = useCallback(
    async (sessionIntent: SessionIntent): Promise<IntentResult> => {
      const id = nextId();
      const res = await post({ type: "intent", id, intent: sessionIntent });
      if (res.type === "error") throw new Error(res.message);
      if (res.type !== "intentResult") throw new Error("Unexpected worker response");
      return { revision: res.revision, document: res.document };
    },
    [post]
  );

  const exportPatch = useCallback(async (): Promise<PdfEditPatch | null> => {
    const id = nextId();
    const res = await post({ type: "exportPatch", id });
    if (res.type === "error") throw new Error(res.message);
    if (res.type !== "exportPatchResult") throw new Error("Unexpected worker response");
    return res.patch;
  }, [post]);

  const getSessionMeta = useCallback(async (): Promise<SessionMeta> => {
    const id = nextId();
    const res = await post({ type: "getSessionMeta", id });
    if (res.type === "error") throw new Error(res.message);
    if (res.type !== "sessionMetaResult") throw new Error("Unexpected worker response");
    return {
      hasChanges: res.hasChanges,
      editedCount: res.editedCount,
      revision: res.revision,
    };
  }, [post]);

  const getOriginalSnapshot = useCallback(
    async (blockId: string): Promise<BlockOriginalSnapshot | undefined> => {
      const id = nextId();
      const res = await post({ type: "getOriginalSnapshot", id, blockId });
      if (res.type === "error") throw new Error(res.message);
      if (res.type !== "originalSnapshotResult") throw new Error("Unexpected worker response");
      return res.snapshot;
    },
    [post]
  );

  const previewNative = useCallback(async (): Promise<ApplyNativeResult> => {
    const id = nextId();
    const res = await post({ type: "previewNative", id });
    if (res.type === "error") throw new Error(res.message);
    if (res.type !== "previewNativeResult") throw new Error("Unexpected worker response");
    return {
      pdfBytes: res.pdfBytes,
      overlayBlockIds: res.overlayBlockIds,
    };
  }, [post]);

  const previewFull = useCallback(async (): Promise<ApplyNativeResult> => {
    const id = nextId();
    const res = await post({ type: "previewFull", id });
    if (res.type === "error") throw new Error(res.message);
    if (res.type !== "previewFullResult") throw new Error("Unexpected worker response");
    return {
      pdfBytes: res.pdfBytes,
      overlayBlockIds: res.overlayBlockIds,
    };
  }, [post]);

  const predict = useCallback(
    async (block: PdfEditBlockPatch, original?: BlockOriginalSnapshot): Promise<ApplyPlan> => {
      const id = nextId();
      const res = await post({ type: "predict", id, block, original });
      if (res.type === "error") throw new Error(res.message);
      if (res.type !== "predictResult") throw new Error("Unexpected worker response");
      return res.plan;
    },
    [post]
  );

  const outlinePaths = useCallback(
    async (locator: {
      page: number;
      streamNum: number;
      regionStart: number;
    }): Promise<OutlinePreviewData> => {
      const id = nextId();
      const res = await post({ type: "outlinePaths", id, locator });
      if (res.type === "error") throw new Error(res.message);
      if (res.type !== "outlineResult") throw new Error("Unexpected worker response");
      return {
        glyphs: res.glyphs,
        fillColor: res.fillColor,
        bbox: res.bbox,
      };
    },
    [post]
  );

  return useMemo(
    () => ({
      ready,
      sessionRevision,
      openSession,
      intent,
      exportPatch,
      getSessionMeta,
      getOriginalSnapshot,
      previewNative,
      previewFull,
      predict,
      outlinePaths,
    }),
    [
      ready,
      sessionRevision,
      openSession,
      intent,
      exportPatch,
      getSessionMeta,
      getOriginalSnapshot,
      previewNative,
      previewFull,
      predict,
      outlinePaths,
    ]
  );
}

export type EngineWorkerApi = Pick<
  ReturnType<typeof useEngineWorker>,
  | "ready"
  | "sessionRevision"
  | "openSession"
  | "intent"
  | "exportPatch"
  | "getSessionMeta"
  | "getOriginalSnapshot"
  | "previewNative"
  | "previewFull"
>;
