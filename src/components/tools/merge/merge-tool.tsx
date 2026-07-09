"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import {
  ResultBanner,
  SortableFileList,
  type SortableFileItem,
} from "@/components/tools/shared/tool-ui";
import {
  defaultMergedFilename,
  downloadPdf,
  formatResultSummary,
  getPageCount,
  mergePdfs,
} from "@/lib/pdf";

export function MergeTool() {
  const [items, setItems] = useState<SortableFileItem[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    if (files.length === 0) {
      setItems([]);
      return;
    }
    setItems(files.map((file) => ({ file, loading: true })));
    const updated = await Promise.all(
      files.map(async (file) => {
        try {
          const pageCount = await getPageCount(file);
          return { file, pageCount, loading: false };
        } catch {
          return { file, loading: false };
        }
      })
    );
    setItems(updated);
  }, []);

  const totalPages = items.reduce((sum, i) => sum + (i.pageCount ?? 0), 0);

  return (
    <ToolWorkspace
      toolId="merge-pdf"
      multiple
      minFiles={2}
      onFilesChange={handleFilesChange}
      onProcess={async () => {
        setResult(null);
        const files = items.map((i) => i.file);
        const { data, totalPages: pages, inputSize } = await mergePdfs(files);
        downloadPdf(data, defaultMergedFilename(files));
        setResult(
          formatResultSummary({
            inputSize,
            outputSize: data.length,
            pageCount: pages,
          })
        );
      }}
      processLabel={
        items.length >= 2 ? `Merge ${items.length} PDFs (${totalPages} pages)` : "Merge PDFs"
      }
      disabled={items.length < 2}
    >
      {items.length > 0 && (
        <div className="space-y-3">
          <SortableFileList
            items={items}
            onReorder={setItems}
            onRemove={(index) => setItems((prev) => prev.filter((_, i) => i !== index))}
          />
          <p className="text-sm text-muted">
            Use arrows to set merge order. First file = first pages in output.
          </p>
        </div>
      )}
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}
