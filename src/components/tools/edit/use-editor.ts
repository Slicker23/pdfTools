"use client";

import { useCallback, useMemo, useState } from "react";
import type { EditObject } from "@/lib/pdf";

export interface EditorApi {
  objects: EditObject[];
  selectedId: string | null;
  selected: EditObject | null;
  setSelectedId: (id: string | null) => void;
  /** Add an object (records history). Returns the added object. */
  add: (obj: EditObject) => void;
  /** Add multiple objects in a single history step; selects the last. */
  addMany: (objs: EditObject[]) => void;
  /** Patch an object with history (one-shot edits). */
  update: (id: string, patch: Partial<EditObject>) => void;
  /** Patch an object without recording history (live drag/resize). */
  updateLive: (id: string, patch: Partial<EditObject>) => void;
  remove: (id: string) => void;
  clearPage: (page: number) => void;
  /** Capture the current state so a following live edit can be undone. */
  beginHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: () => void;
  /** Replace all objects without recording undo (initial PDF import). */
  setInitialObjects: (objects: EditObject[]) => void;
  /** Remove a text block and its paired whiteout cover. */
  removeTextBlock: (textId: string) => void;
}

export function useEditor(): EditorApi {
  const [objects, setObjects] = useState<EditObject[]>([]);
  const [undoStack, setUndoStack] = useState<EditObject[][]>([]);
  const [redoStack, setRedoStack] = useState<EditObject[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const commit = useCallback((updater: (prev: EditObject[]) => EditObject[]) => {
    setObjects((prev) => {
      setUndoStack((s) => [...s, prev]);
      setRedoStack([]);
      return updater(prev);
    });
  }, []);

  const beginHistory = useCallback(() => {
    setObjects((prev) => {
      setUndoStack((s) => [...s, prev]);
      setRedoStack([]);
      return prev;
    });
  }, []);

  const add = useCallback(
    (obj: EditObject) => {
      commit((prev) => [...prev, obj]);
      setSelectedId(obj.id);
    },
    [commit]
  );

  const addMany = useCallback(
    (objs: EditObject[]) => {
      if (objs.length === 0) return;
      commit((prev) => [...prev, ...objs]);
      setSelectedId(objs[objs.length - 1].id);
    },
    [commit]
  );

  const update = useCallback(
    (id: string, patch: Partial<EditObject>) => {
      commit((prev) =>
        prev.map((o) => (o.id === id ? ({ ...o, ...patch } as EditObject) : o))
      );
    },
    [commit]
  );

  const updateLive = useCallback((id: string, patch: Partial<EditObject>) => {
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? ({ ...o, ...patch } as EditObject) : o))
    );
  }, []);

  const remove = useCallback(
    (id: string) => {
      commit((prev) => prev.filter((o) => o.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [commit]
  );

  const clearPage = useCallback(
    (page: number) => {
      commit((prev) => prev.filter((o) => o.page !== page));
      setSelectedId(null);
    },
    [commit]
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setObjects((cur) => {
        setRedoStack((r) => [...r, cur]);
        return previous;
      });
      setSelectedId(null);
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setObjects((cur) => {
        setUndoStack((u) => [...u, cur]);
        return next;
      });
      setSelectedId(null);
      return stack.slice(0, -1);
    });
  }, []);

  const reset = useCallback(() => {
    setObjects([]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
  }, []);

  const setInitialObjects = useCallback((objects: EditObject[]) => {
    setObjects(objects);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
  }, []);

  const removeTextBlock = useCallback(
    (textId: string) => {
      commit((prev) => {
        const text = prev.find((o) => o.id === textId && o.type === "text");
        if (!text || text.type !== "text") return prev.filter((o) => o.id !== textId);
        const coverId = text.coverId;
        return prev.filter((o) => o.id !== textId && o.id !== coverId);
      });
      setSelectedId((cur) => (cur === textId ? null : cur));
    },
    [commit]
  );

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) ?? null,
    [objects, selectedId]
  );

  return {
    objects,
    selectedId,
    selected,
    setSelectedId,
    add,
    addMany,
    update,
    updateLive,
    remove,
    clearPage,
    beginHistory,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    reset,
    setInitialObjects,
    removeTextBlock,
  };
}
