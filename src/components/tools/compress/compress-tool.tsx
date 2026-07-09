"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { compressPdf, downloadPdf, formatResultSummary } from "@/lib/pdf";

export function CompressTool() {
  const [quality, setQuality] = useState(75);
  const [inputSize, setInputSize] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback((files: File[]) => {
    setResult(null);
    setInputSize(files[0]?.size ?? 0);
  }, []);

  return (
    <ToolWorkspace
      toolId="compress-pdf"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const { data, inputSize: inSize } = await compressPdf(files[0], quality);
        downloadPdf(data, files[0].name.replace(/\.pdf$/i, "_compressed.pdf"));
        const pct = Math.round((1 - data.length / inSize) * 100);
        setResult(
          formatResultSummary({ inputSize: inSize, outputSize: data.length }) +
            (pct > 0 ? ` · saved ${pct}%` : "")
        );
      }}
      processLabel="Compress PDF"
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Quality: {quality}%</span>
          <span className="ml-2 text-muted">
            Lower = smaller file, lower image quality
          </span>
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value, 10))}
            className="mt-2 w-full"
          />
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>Smaller file</span>
            <span>Better quality</span>
          </div>
        </label>
        {inputSize > 0 && (
          <p className="text-sm text-muted">
            Input size: {(inputSize / 1024 / 1024).toFixed(2)} MB
          </p>
        )}
        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
