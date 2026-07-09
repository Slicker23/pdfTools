"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { PageRangeInput, ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  downloadPdf,
  formatResultSummary,
  getRotatePreview,
  rotatePdf,
  type RotationAngle,
  type RotateScope,
} from "@/lib/pdf";

export function RotateTool() {
  const [rotation, setRotation] = useState<RotationAngle>(90);
  const [scope, setScope] = useState<RotateScope>("all");
  const [selectedPages, setSelectedPages] = useState("");
  const [totalPages, setTotalPages] = useState<number | undefined>();
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    if (files.length === 0) {
      setTotalPages(undefined);
      return;
    }
    try {
      const count = await getRotatePreview(files[0]);
      setTotalPages(count);
    } catch {
      setTotalPages(undefined);
    }
  }, []);

  return (
    <ToolWorkspace
      toolId="rotate-pdf"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const inputSize = files[0].size;
        const { data, rotatedCount } = await rotatePdf(
          files[0],
          rotation,
          scope,
          selectedPages
        );
        downloadPdf(data, files[0].name.replace(/\.pdf$/i, "_rotated.pdf"));
        setResult(
          formatResultSummary({
            inputSize,
            outputSize: data.length,
            pageCount: rotatedCount,
          }) + ` · rotated ${rotation}°`
        );
      }}
      processLabel={`Rotate ${rotation}°`}
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Rotation angle</span>
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={rotation}
            onChange={(e) => setRotation(parseInt(e.target.value, 10) as RotationAngle)}
          >
            <option value={90}>90° clockwise</option>
            <option value={180}>180°</option>
            <option value={270}>270° clockwise (90° counter)</option>
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Apply to</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scope === "all"}
              onChange={() => setScope("all")}
            />
            All pages
            {totalPages !== undefined && ` (${totalPages})`}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scope === "selected"}
              onChange={() => setScope("selected")}
            />
            Selected pages only
          </label>
        </fieldset>

        {scope === "selected" && (
          <PageRangeInput
            value={selectedPages}
            onChange={setSelectedPages}
            totalPages={totalPages}
            label="Pages to rotate"
            hint="e.g. 1, 3, 5"
          />
        )}

        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
