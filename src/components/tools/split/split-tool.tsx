"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { PageRangeInput, ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  downloadPdfsAsZip,
  formatResultSummary,
  getSplitPreview,
  splitPdf,
} from "@/lib/pdf";

export function SplitTool() {
  const [ranges, setRanges] = useState("1-1");
  const [mode, setMode] = useState<"ranges" | "every-page">("ranges");
  const [totalPages, setTotalPages] = useState<number | undefined>();
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    if (files.length === 0) {
      setTotalPages(undefined);
      return;
    }
    try {
      const count = await getSplitPreview(files[0]);
      setTotalPages(count);
      setRanges(`1-${count}`);
    } catch {
      setTotalPages(undefined);
    }
  }, []);

  return (
    <ToolWorkspace
      toolId="split-pdf"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const inputSize = files[0].size;
        const results = await splitPdf(files[0], ranges, mode);
        await downloadPdfsAsZip(results, `${files[0].name.replace(/\.pdf$/i, "")}_split.zip`);
        const outputSize = results.reduce((s, r) => s + r.data.length, 0);
        setResult(
          formatResultSummary({
            inputSize,
            outputSize,
            fileCount: results.length,
          })
        );
      }}
      processLabel="Split PDF"
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Split mode</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={mode === "ranges"}
              onChange={() => setMode("ranges")}
            />
            Custom page ranges
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={mode === "every-page"}
              onChange={() => setMode("every-page")}
            />
            Split into separate file per page
            {totalPages !== undefined && ` (${totalPages} files)`}
          </label>
        </fieldset>

        {mode === "ranges" && (
          <PageRangeInput
            value={ranges}
            onChange={setRanges}
            totalPages={totalPages}
            hint="e.g. 1-3, 5, 7-10"
          />
        )}

        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
