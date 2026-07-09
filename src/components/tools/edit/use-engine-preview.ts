"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfEditPatch } from "@/lib/pdf/edit-model";
import type { EditObject } from "@/lib/pdf";
import { applyEdits } from "@/lib/pdf";
import { applyOverlayForBlockIdsInBrowser } from "@/lib/pdf-engine/browser/apply-client";
import type { useEngineWorker } from "@/lib/pdf-engine/browser/client";

type WorkerApi = Pick<
  ReturnType<typeof useEngineWorker>,
  "ready" | "sessionRevision" | "previewNative" | "exportPatch"
>;

function patchHash(patch: PdfEditPatch | null, markupObjects: EditObject[]): string {
  return JSON.stringify({
    blocks: patch?.blocks.map((b) => ({
      id: b.id,
      text: b.text,
      deleted: b.deleted,
      font: b.font,
      bbox: b.bbox,
      modified: b.modified,
      overlay: b.overlay,
      flattenToPath: b.flattenToPath,
    })),
    markup: markupObjects.map((o) => ({ id: o.id, type: o.type, page: o.page })),
  });
}

export interface UseEnginePreviewOptions {
  worker: WorkerApi;
  sessionReady: boolean;
  originalBytes: ArrayBuffer | null;
  hasChanges: boolean;
  editedCount: number;
  markupObjects: EditObject[];
  markupRevision: number;
  fileName: string;
  refreshToken?: number;
}

async function bakeMarkup(
  pdfBytes: ArrayBuffer,
  fileName: string,
  markupObjects: EditObject[]
): Promise<ArrayBuffer> {
  if (!markupObjects.length) return pdfBytes;
  const file = new File([pdfBytes.slice(0)], fileName, { type: "application/pdf" });
  const out = await applyEdits(file, markupObjects);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

export function useEnginePreview({
  worker,
  sessionReady,
  originalBytes,
  hasChanges,
  editedCount,
  markupObjects,
  markupRevision,
  fileName,
  refreshToken = 0,
}: UseEnginePreviewOptions) {
  const { ready: workerReady, sessionRevision, previewNative, exportPatch } = worker;

  const [previewBytes, setPreviewBytes] = useState<ArrayBuffer | null>(null);
  const [updating, setUpdating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [isFresh, setIsFresh] = useState(false);
  const revisionRef = useRef(0);
  const lastSuccessRef = useRef<{ editedCount: number; hash: string } | null>(null);

  const buildPreviewBytes = useCallback(async (): Promise<ArrayBuffer | null> => {
    const hasMarkup = markupObjects.length > 0;
    if (!workerReady || !sessionReady) return null;

    let pdfBytes: ArrayBuffer | null = null;
    let patch: PdfEditPatch | null = null;

    if (hasChanges) {
      const preview = await previewNative();
      patch = await exportPatch();
      const outBytes =
        preview.overlayBlockIds.length && patch
          ? await applyOverlayForBlockIdsInBrowser(
              new Uint8Array(preview.pdfBytes),
              patch,
              preview.overlayBlockIds
            )
          : new Uint8Array(preview.pdfBytes);
      pdfBytes = outBytes.slice().buffer;
    } else if (hasMarkup && originalBytes) {
      pdfBytes = originalBytes.slice(0);
    } else {
      return null;
    }

    if (hasMarkup && pdfBytes) {
      pdfBytes = await bakeMarkup(pdfBytes, fileName, markupObjects);
    }

    lastSuccessRef.current = {
      editedCount,
      hash: patchHash(patch, markupObjects),
    };
    return pdfBytes;
  }, [
    workerReady,
    sessionReady,
    originalBytes,
    hasChanges,
    editedCount,
    markupObjects,
    fileName,
    previewNative,
    exportPatch,
  ]);

  const runPreview = useCallback(async () => {
    const hasMarkup = markupObjects.length > 0;
    if (!workerReady || !sessionReady || (!hasChanges && !hasMarkup)) {
      setPreviewBytes(null);
      setUpdating(false);
      setIsFresh(false);
      setLastError(null);
      return;
    }

    const rev = ++revisionRef.current;
    setUpdating(true);
    setLastError(null);

    try {
      const result = await buildPreviewBytes();
      if (rev !== revisionRef.current) return;

      if (result) {
        setPreviewBytes(result);
        setRevision(rev);
        setIsFresh(true);
      } else {
        setPreviewBytes(null);
        setIsFresh(false);
      }
    } catch (err) {
      console.error("[useEnginePreview]", err);
      if (rev === revisionRef.current) {
        setLastError(err instanceof Error ? err.message : String(err));
        setIsFresh(false);
      }
    } finally {
      if (rev === revisionRef.current) {
        setUpdating(false);
      }
    }
  }, [workerReady, sessionReady, hasChanges, markupObjects, buildPreviewBytes]);

  useEffect(() => {
    const current = lastSuccessRef.current;
    if (!current || !previewBytes) {
      setIsFresh(false);
      return;
    }
    void exportPatch().then((patch) => {
      const hash = patchHash(patch, markupObjects);
      setIsFresh(current.editedCount === editedCount && current.hash === hash);
    });
  }, [editedCount, markupObjects, markupRevision, previewBytes, exportPatch]);

  useEffect(() => {
    const delay = refreshToken > 0 ? 100 : 250;
    const timer = setTimeout(() => {
      void runPreview();
    }, delay);
    return () => clearTimeout(timer);
  }, [
    runPreview,
    refreshToken,
    hasChanges,
    editedCount,
    markupRevision,
    sessionReady,
    sessionRevision,
  ]);

  const resetPreview = useCallback(() => {
    revisionRef.current += 1;
    setPreviewBytes(null);
    setUpdating(false);
    setIsFresh(false);
    setLastError(null);
    lastSuccessRef.current = null;
  }, []);

  const getDownloadBytes = useCallback(async (): Promise<Uint8Array> => {
    const bytes = await buildPreviewBytes();
    if (!bytes) throw new Error("Nothing to download");
    return new Uint8Array(bytes);
  }, [buildPreviewBytes]);

  return {
    previewBytes,
    updating,
    revision,
    lastError,
    isFresh,
    resetPreview,
    getDownloadBytes,
  };
}
