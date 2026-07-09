"use client";

import { useCallback, useState } from "react";
import JSZip from "jszip";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  compressPdf,
  downloadPdfsAsZip,
  formatResultSummary,
} from "@/lib/pdf";
import { BATCH_MAX_FILES } from "@/lib/constants";
import { runServerJob } from "@/lib/jobs/client-jobs";
import { downloadBlob } from "@/lib/utils";

export function BatchTool() {
  const [mode, setMode] = useState<"browser" | "server">("browser");
  const [quality, setQuality] = useState(75);
  const [fileCount, setFileCount] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleFilesChange = useCallback((files: File[]) => {
    setResult(null);
    setFileCount(files.length);
  }, []);

  const buildZip = async (files: File[]): Promise<File> => {
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.name, await file.arrayBuffer());
    }
    const blob = await zip.generateAsync({ type: "blob" });
    return new File([blob], "batch_input.zip", { type: "application/zip" });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={mode === "browser"}
            onChange={() => setMode("browser")}
          />
          Browser (free, private)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={mode === "server"}
            onChange={() => setMode("server")}
          />
          Server batch (paid, worker)
        </label>
      </div>

      <ToolWorkspace
        toolId="batch-process"
        multiple
        onFilesChange={handleFilesChange}
        onProcess={async (files) => {
          setResult(null);
          setStatus(null);
          if (files.length > BATCH_MAX_FILES) {
            throw new Error(`Maximum ${BATCH_MAX_FILES} files per batch`);
          }

          if (mode === "server") {
            const zipFile = await buildZip(files);
            const blob = await runServerJob(
              zipFile,
              "batch",
              { operation: "compress", quality },
              setStatus
            );
            downloadBlob(blob, "compressed_pdfs.zip");
            setStatus(null);
            setResult(`Server batch complete — ${files.length} PDFs compressed`);
            return;
          }

          let totalIn = 0;
          let totalOut = 0;
          const outputs: { name: string; data: Uint8Array }[] = [];

          for (const file of files) {
            const { data, inputSize } = await compressPdf(file, quality);
            totalIn += inputSize;
            totalOut += data.length;
            outputs.push({
              name: file.name.replace(/\.pdf$/i, "_compressed.pdf"),
              data,
            });
          }

          await downloadPdfsAsZip(outputs, "compressed_pdfs.zip");
          setResult(
            formatResultSummary({
              inputSize: totalIn,
              outputSize: totalOut,
              fileCount: files.length,
            })
          );
        }}
        processLabel={status ?? "Batch compress"}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Compress multiple PDFs at once. Up to {BATCH_MAX_FILES} files — downloaded as a ZIP when
            more than one.
          </p>

          <label className="block text-sm">
            <span className="font-medium">Quality: {quality}%</span>
            <input
              type="range"
              min={20}
              max={100}
              step={5}
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              className="mt-2 w-full"
            />
          </label>

          {fileCount > 0 && (
            <p className="text-sm text-muted">
              {fileCount} file{fileCount !== 1 ? "s" : ""} selected
            </p>
          )}

          {status && mode === "server" && (
            <p className="text-sm text-muted">{status}</p>
          )}
          {result && <ResultBanner message={result} />}
        </div>
      </ToolWorkspace>
    </div>
  );
}
