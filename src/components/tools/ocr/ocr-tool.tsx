"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  OCR_LANGUAGES,
  baseName,
  downloadPdf,
  runBrowserOcr,
  type OcrOutput,
  type OcrProgress,
} from "@/lib/pdf";
import { downloadBlob } from "@/lib/utils";
import { runServerJob } from "@/lib/jobs/client-jobs";

function progressLabel(p: OcrProgress | null): string {
  if (!p) return "";
  const phase =
    p.phase === "render" ? "Rendering" : p.phase === "recognize" ? "Recognizing" : "Building PDF";
  return `${phase} page ${p.page} / ${p.total}…`;
}

export function OcrTool() {
  const [mode, setMode] = useState<"browser" | "server">("browser");
  const [language, setLanguage] = useState("eng");
  const [output, setOutput] = useState<OcrOutput>("both");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<string | null>(null);

  const handleFilesChange = useCallback(() => {
    setResult(null);
    setProgress(null);
    setServerStatus(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={mode === "browser"}
            onChange={() => setMode("browser")}
          />
          Browser OCR (free, private)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={mode === "server"}
            onChange={() => setMode("server")}
          />
          Server OCR (quota, ocrmypdf)
        </label>
      </div>

      {mode === "browser" ? (
        <ToolWorkspace
          toolId="ocr-pdf"
          onFilesChange={handleFilesChange}
          onProcess={async (files) => {
            setResult(null);
            setProgress(null);
            const ocr = await runBrowserOcr(files[0], language, output, setProgress);
            const base = baseName(files[0].name);

            if (output === "text" || output === "both") {
              downloadBlob(new Blob([ocr.text], { type: "text/plain" }), `${base}_ocr.txt`);
            }
            if (ocr.pdf && (output === "searchable-pdf" || output === "both")) {
              downloadPdf(ocr.pdf, `${base}_searchable.pdf`);
            }

            setProgress(null);
            setResult(
              `Processed ${ocr.pageCount} page${ocr.pageCount !== 1 ? "s" : ""}` +
                (ocr.text ? ` · ${ocr.text.length.toLocaleString()} characters extracted` : "") +
                (ocr.pdf ? " · searchable PDF ready" : "")
            );
          }}
          processLabel="Run OCR"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Extracts text from scanned PDFs using Tesseract.js in your browser. Choose a searchable
              PDF to copy/paste text in any viewer.
            </p>

            <label className="block text-sm">
              <span className="font-medium">Language</span>
              <select
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {OCR_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium">Output</span>
              <select
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                value={output}
                onChange={(e) => setOutput(e.target.value as OcrOutput)}
              >
                <option value="both">Text file + searchable PDF</option>
                <option value="text">Text file only</option>
                <option value="searchable-pdf">Searchable PDF only</option>
              </select>
            </label>

            {progress && (
              <p className="text-sm text-muted">{progressLabel(progress)}</p>
            )}
            {result && <ResultBanner message={result} />}
          </div>
        </ToolWorkspace>
      ) : (
        <ToolWorkspace
          toolId="ocr-pdf"
          onFilesChange={handleFilesChange}
          onProcess={async (files) => {
            setResult(null);
            setServerStatus(null);
            const blob = await runServerJob(
              files[0],
              "ocr",
              { language, output: "searchable-pdf" },
              setServerStatus
            );
            downloadBlob(blob, `${baseName(files[0].name)}_searchable.pdf`);
            setServerStatus(null);
            setResult("Server OCR complete — searchable PDF downloaded");
          }}
          processLabel={serverStatus ?? "Run Server OCR"}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Uploads your PDF for server-side OCR via ocrmypdf. Requires a paid account and
              the background worker running on the server.
            </p>

            <label className="block text-sm">
              <span className="font-medium">Language</span>
              <select
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {OCR_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            {serverStatus && <p className="text-sm text-muted">{serverStatus}</p>}
            {result && <ResultBanner message={result} />}
          </div>
        </ToolWorkspace>
      )}
    </div>
  );
}
