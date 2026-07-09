"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { SortableFileList, type SortableFileItem } from "@/components/tools/shared/tool-ui";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { downloadPdf, formatResultSummary, jpgToPdf } from "@/lib/pdf";

export function JpgToPdfTool() {
  const [items, setItems] = useState<SortableFileItem[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback((files: File[]) => {
    setResult(null);
    setItems(files.map((file) => ({ file })));
  }, []);

  return (
    <ToolWorkspace
      toolId="jpg-to-pdf"
      accept="image/jpeg,image/png,.jpg,.jpeg,.png"
      multiple
      minFiles={1}
      onFilesChange={handleFilesChange}
      onProcess={async () => {
        setResult(null);
        const files = items.map((i) => i.file);
        const inputSize = files.reduce((s, f) => s + f.size, 0);
        const data = await jpgToPdf(files);
        downloadPdf(data, "images.pdf");
        setResult(
          formatResultSummary({
            inputSize,
            outputSize: data.length,
            pageCount: files.length,
          })
        );
      }}
      processLabel={`Create PDF from ${items.length || ""} images`.trim()}
      disabled={items.length === 0}
    >
      <div className="space-y-4">
        {items.length > 0 && (
          <>
            <SortableFileList
              items={items}
              onReorder={setItems}
              onRemove={(index) => setItems((prev) => prev.filter((_, i) => i !== index))}
            />
            <p className="text-sm text-muted">Image order = page order in PDF</p>
          </>
        )}
        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
