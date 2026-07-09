"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PdfEditDocument,
  PdfEditBBox,
  PdfEditPatch,
  PdfEditTextBlock,
} from "@/lib/pdf/edit-model";
import type { BlockOriginalSnapshot } from "@/lib/pdf/edit-overlay";
import {
  blockContentIsChanged,
  blockIsChanged,
  withLiveFlags,
} from "@/lib/pdf-engine/edit-session-core";
import type { EngineWorkerApi } from "@/lib/pdf-engine/browser/client";
import type { SessionIntent } from "@/lib/pdf-engine/edit-session-core";

export interface PdfDocumentEditor {
  document: PdfEditDocument | null;
  sessionReady: boolean;
  setDocument: (doc: PdfEditDocument | null) => void;
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
  updateBlockText: (id: string, text: string) => void;
  updateBlockStyle: (
    id: string,
    patch: Partial<{
      color: string;
      size: number;
      bold: boolean;
      italic: boolean;
      fontName: string;
    }>
  ) => void;
  updateBlockPosition: (id: string, position: { px: number; py: number }) => void;
  updateBlockFlattenToPath: (id: string, flatten: boolean) => void;
  removeBlock: (id: string) => void;
  resetBlock: (id: string) => void;
  resetAll: () => void;
  addBlock: (block: PdfEditTextBlock) => void;
  getBlock: (id: string) => PdfEditTextBlock | undefined;
  getOriginalText: (id: string) => string | undefined;
  getOriginalBbox: (id: string) => PdfEditBBox | undefined;
  getOriginalSnapshot: (id: string) => BlockOriginalSnapshot | undefined;
  isBlockEdited: (id: string) => boolean;
  isBlockContentEdited: (id: string) => boolean;
  editedCount: number;
  buildPatch: () => PdfEditPatch | null;
  hasChanges: boolean;
  reset: () => void;
}

export { blockContentIsChanged, blockIsChanged };

export function usePdfDocument(worker: EngineWorkerApi): PdfDocumentEditor {
  const [document, setDocumentState] = useState<PdfEditDocument | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionMeta, setSessionMeta] = useState({ hasChanges: false, editedCount: 0 });
  const originalsCacheRef = useRef<Map<string, BlockOriginalSnapshot>>(new Map());
  const patchCacheRef = useRef<PdfEditPatch | null>(null);
  const pendingDocRef = useRef<PdfEditDocument | null>(null);

  const refreshMeta = useCallback(async () => {
    if (!worker.ready || !sessionReady) return;
    const meta = await worker.getSessionMeta();
    setSessionMeta({ hasChanges: meta.hasChanges, editedCount: meta.editedCount });
    const patch = await worker.exportPatch();
    patchCacheRef.current = patch;
  }, [worker, sessionReady]);

  useEffect(() => {
    if (!worker.ready || !pendingDocRef.current || sessionReady) return;
    let cancelled = false;
    const doc = pendingDocRef.current;
    void worker.openSession(doc).then(async () => {
      if (cancelled) return;
      setSessionReady(true);
      for (const page of doc.pages) {
        for (const block of page.blocks) {
          const snap = await worker.getOriginalSnapshot(block.id);
          if (snap) originalsCacheRef.current.set(block.id, snap);
        }
      }
      await refreshMeta();
    });
    return () => {
      cancelled = true;
    };
  }, [worker.ready, worker, sessionReady, refreshMeta]);

  useEffect(() => {
    if (!sessionReady) return;
    void refreshMeta();
  }, [worker.sessionRevision, sessionReady, refreshMeta]);

  const runIntent = useCallback(
    async (intent: SessionIntent) => {
      if (!worker.ready || !sessionReady) return;
      const { document: next } = await worker.intent(intent);
      if (next) setDocumentState(next);
      await refreshMeta();
    },
    [worker, sessionReady, refreshMeta]
  );

  const setDocument = useCallback((doc: PdfEditDocument | null) => {
    pendingDocRef.current = doc;
    patchCacheRef.current = null;
    originalsCacheRef.current = new Map();
    setSessionReady(false);
    setSessionMeta({ hasChanges: false, editedCount: 0 });
    setDocumentState(doc);
    setActiveBlockId(null);
  }, []);

  const getBlock = useCallback(
    (id: string) => {
      if (!document) return undefined;
      for (const page of document.pages) {
        const block = page.blocks.find((b) => b.id === id);
        if (block) return block;
      }
      return undefined;
    },
    [document]
  );

  const getOriginalSnapshot = useCallback(
    (id: string): BlockOriginalSnapshot | undefined => {
      return originalsCacheRef.current.get(id);
    },
    []
  );

  const ensureOriginal = useCallback(
    async (id: string): Promise<BlockOriginalSnapshot | undefined> => {
      const cached = originalsCacheRef.current.get(id);
      if (cached) return cached;
      if (!worker.ready || !sessionReady) return undefined;
      const snap = await worker.getOriginalSnapshot(id);
      if (snap) originalsCacheRef.current.set(id, snap);
      return snap;
    },
    [worker, sessionReady]
  );

  const getOriginalText = useCallback(
    (id: string) => originalsCacheRef.current.get(id)?.text,
    []
  );

  const getOriginalBbox = useCallback((id: string): PdfEditBBox | undefined => {
    const bbox = originalsCacheRef.current.get(id)?.bbox;
    return bbox ? { ...bbox } : undefined;
  }, []);

  const isBlockEdited = useCallback(
    (id: string) => {
      const block = getBlock(id);
      if (!block) return false;
      const originals = originalsCacheRef.current;
      return blockIsChanged(id, withLiveFlags(id, block, originals), originals);
    },
    [getBlock]
  );

  const isBlockContentEdited = useCallback(
    (id: string) => {
      const block = getBlock(id);
      if (!block) return false;
      return blockContentIsChanged(id, block, originalsCacheRef.current);
    },
    [getBlock]
  );

  const updateBlockText = useCallback(
    (id: string, text: string) => {
      void runIntent({ kind: "updateText", id, text });
    },
    [runIntent]
  );

  const updateBlockStyle = useCallback(
    (
      id: string,
      patch: Partial<{
        color: string;
        size: number;
        bold: boolean;
        italic: boolean;
        fontName: string;
      }>
    ) => {
      void runIntent({ kind: "updateStyle", id, patch });
    },
    [runIntent]
  );

  const updateBlockPosition = useCallback(
    (id: string, position: { px: number; py: number }) => {
      void runIntent({ kind: "updatePosition", id, position });
    },
    [runIntent]
  );

  const updateBlockFlattenToPath = useCallback(
    (id: string, flatten: boolean) => {
      void runIntent({ kind: "updateFlatten", id, flatten });
    },
    [runIntent]
  );

  const removeBlock = useCallback(
    (id: string) => {
      setActiveBlockId((cur) => (cur === id ? null : cur));
      void runIntent({ kind: "removeBlock", id });
    },
    [runIntent]
  );

  const resetBlock = useCallback(
    (id: string) => {
      void runIntent({ kind: "resetBlock", id });
    },
    [runIntent]
  );

  const resetAll = useCallback(() => {
    setActiveBlockId(null);
    void runIntent({ kind: "resetAll" });
  }, [runIntent]);

  const addBlock = useCallback(
    (block: PdfEditTextBlock) => {
      setActiveBlockId(block.id);
      void runIntent({ kind: "addBlock", block });
    },
    [runIntent]
  );

  const buildPatch = useCallback((): PdfEditPatch | null => {
    return patchCacheRef.current;
  }, []);

  const reset = useCallback(() => {
    pendingDocRef.current = null;
    patchCacheRef.current = null;
    originalsCacheRef.current = new Map();
    setSessionReady(false);
    setSessionMeta({ hasChanges: false, editedCount: 0 });
    setDocumentState(null);
    setActiveBlockId(null);
  }, []);

  useEffect(() => {
    if (!document || !sessionReady) return;
    void (async () => {
      for (const page of document.pages) {
        for (const block of page.blocks) {
          if (!originalsCacheRef.current.has(block.id)) {
            await ensureOriginal(block.id);
          }
        }
      }
    })();
  }, [document, sessionReady, ensureOriginal]);

  return {
    document,
    sessionReady,
    setDocument,
    activeBlockId,
    setActiveBlockId,
    updateBlockText,
    updateBlockStyle,
    updateBlockPosition,
    updateBlockFlattenToPath,
    removeBlock,
    resetBlock,
    resetAll,
    addBlock,
    getBlock,
    getOriginalText,
    getOriginalBbox,
    getOriginalSnapshot,
    isBlockEdited,
    isBlockContentEdited,
    editedCount: sessionMeta.editedCount,
    buildPatch,
    hasChanges: sessionMeta.hasChanges,
    reset,
  };
}
