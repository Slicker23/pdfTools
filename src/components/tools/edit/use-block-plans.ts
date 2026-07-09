"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfEditTextBlock } from "@/lib/pdf/edit-model";
import type { ApplyPlan, BlockOriginalSnapshot } from "@/lib/pdf-engine/plan";
import type { useEngineWorker } from "@/lib/pdf-engine/browser/client";

type WorkerApi = Pick<ReturnType<typeof useEngineWorker>, "predict" | "ready">;

function blockRevision(block: PdfEditTextBlock): string {
  return JSON.stringify({
    t: block.text,
    f: block.font,
    b: block.bbox,
    d: block.deleted,
    c: block.created,
    fl: block.flattenToPath,
    o: block.overlay,
    ob: block.originalBbox,
    bl: block.baselineY,
    ins: block.insertAt,
    m: block.modified,
  });
}

export function useBlockPlans(
  worker: WorkerApi,
  blocks: PdfEditTextBlock[],
  getOriginal: (id: string) => BlockOriginalSnapshot | undefined
) {
  const [plans, setPlans] = useState<Map<string, ApplyPlan>>(new Map());
  const inflightRef = useRef(new Set<string>());

  const refreshPlan = useCallback(
    async (block: PdfEditTextBlock) => {
      if (!worker.ready) return;
      const id = block.id;
      if (inflightRef.current.has(id)) return;
      inflightRef.current.add(id);
      try {
        const original = getOriginal(id);
        const patch = {
          ...block,
          modified: block.modified ?? true,
        };
        const plan = await worker.predict(patch, original);
        setPlans((prev) => {
          const next = new Map(prev);
          next.set(id, plan);
          return next;
        });
      } finally {
        inflightRef.current.delete(id);
      }
    },
    [worker, getOriginal]
  );

  useEffect(() => {
    if (!worker.ready) return;
    for (const block of blocks) {
      if (block.modified || block.deleted || block.created || block.flattenToPath) {
        void refreshPlan(block);
      }
    }
  }, [blocks, worker.ready, refreshPlan]);

  const getApplyPlan = useCallback(
    (id: string): ApplyPlan | undefined => {
      return plans.get(id);
    },
    [plans]
  );

  return { getApplyPlan, refreshPlan, plans };
}

export function planRevisionKey(block: PdfEditTextBlock): string {
  return blockRevision(block);
}
