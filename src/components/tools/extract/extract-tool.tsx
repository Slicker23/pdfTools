"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { PageRangeInput, ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  downloadPdf,
  extractFilename,
  extractPages,
  formatResultSummary,
  getExtractPreview,
} from "@/lib/pdf";

export function ExtractTool() {
  const [pages, setPages] = useState("1");
  const [totalPages, setTotalPages] = useState<number | undefined>();
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    if (files.length === 0) {
      setTotalPages(undefined);
      return;
    }
    try {
      const count = await getExtractPreview(files[0]);
      setTotalPages(count);
    } catch {
      setTotalPages(undefined);
    }
  }, []);

  return (
    <ToolWorkspace
      toolId="extract-pdf"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const inputSize = files[0].size;
        const { data, pageCount } = await extractPages(files[0], pages);
        downloadPdf(data, extractFilename(files[0], pageCount));
        setResult(
          formatResultSummary({
            inputSize,
            outputSize: data.length,
            pageCount,
          })
        );
      }}
      processLabel="Extract pages"
    >
      <div className="space-y-4">
        <PageRangeInput
          value={pages}
          onChange={setPages}
          totalPages={totalPages}
          label="Pages to extract"
          hint="e.g. 1, 3, 5-8"
        />
        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
