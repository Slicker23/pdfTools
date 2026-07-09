"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  addPageNumbers,
  baseName,
  downloadPdf,
  formatResultSummary,
  getPageCount,
  type PageNumberFormat,
  type PageNumberPosition,
} from "@/lib/pdf";

export function PageNumbersTool() {
  const [format, setFormat] = useState<PageNumberFormat>("number");
  const [position, setPosition] = useState<PageNumberPosition>("bottom-center");
  const [startAt, setStartAt] = useState(1);
  const [totalPages, setTotalPages] = useState<number | undefined>();
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    if (files.length === 0) {
      setTotalPages(undefined);
      return;
    }
    try {
      setTotalPages(await getPageCount(files[0]));
    } catch {
      setTotalPages(undefined);
    }
  }, []);

  const preview =
    format === "page-n" ? `Page ${startAt}` : format === "n-of-t" ? `${startAt} of ${totalPages ?? "N"}` : `${startAt}`;

  return (
    <ToolWorkspace
      toolId="page-numbers"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const data = await addPageNumbers(files[0], { format, position, startAt });
        downloadPdf(data, `${baseName(files[0].name)}_numbered.pdf`);
        setResult(
          formatResultSummary({
            inputSize: files[0].size,
            outputSize: data.length,
            pageCount: totalPages,
          }) + ` · format "${preview}"`
        );
      }}
      processLabel="Add page numbers"
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Format</span>
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={format}
            onChange={(e) => setFormat(e.target.value as PageNumberFormat)}
          >
            <option value="number">1, 2, 3…</option>
            <option value="page-n">Page 1, Page 2…</option>
            <option value="n-of-t">1 of 10, 2 of 10…</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Position</span>
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={position}
            onChange={(e) => setPosition(e.target.value as PageNumberPosition)}
          >
            <option value="bottom-center">Bottom center</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="top-center">Top center</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Start at</span>
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={startAt}
            onChange={(e) => setStartAt(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </label>

        {totalPages !== undefined && (
          <p className="text-sm text-muted">
            Preview first page: <span className="font-mono">{preview}</span> · {totalPages} pages
          </p>
        )}
        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
