"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { PageOrderEditor, ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  downloadPdf,
  formatResultSummary,
  getDefaultPageOrder,
  orderToString,
  reorderFilename,
  reorderPdf,
} from "@/lib/pdf";

export function ReorderTool() {
  const [order, setOrder] = useState<number[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    if (files.length === 0) {
      setOrder([]);
      return;
    }
    try {
      const defaultOrder = await getDefaultPageOrder(files[0]);
      setOrder(defaultOrder);
    } catch {
      setOrder([]);
    }
  }, []);

  return (
    <ToolWorkspace
      toolId="reorder-pdf"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const inputSize = files[0].size;
        const { data, pageCount } = await reorderPdf(files[0], orderToString(order));
        downloadPdf(data, reorderFilename(files[0]));
        setResult(
          formatResultSummary({
            inputSize,
            outputSize: data.length,
            pageCount,
          })
        );
      }}
      processLabel="Apply new page order"
      disabled={order.length === 0}
    >
      <div className="space-y-4">
        {order.length > 0 && (
          <PageOrderEditor order={order} onChange={setOrder} />
        )}
        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
