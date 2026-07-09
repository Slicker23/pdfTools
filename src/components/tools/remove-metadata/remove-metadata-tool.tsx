"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { baseName, downloadPdf, formatResultSummary, readMetadata, removeMetadata } from "@/lib/pdf";

export function RemoveMetadataTool() {
  const [meta, setMeta] = useState<Record<string, string> | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    if (files.length === 0) {
      setMeta(null);
      return;
    }
    try {
      const m = await readMetadata(files[0]);
      setMeta({
        Title: m.title || "—",
        Author: m.author || "—",
        Subject: m.subject || "—",
        Creator: m.creator || "—",
        Producer: m.producer || "—",
        Keywords: m.keywords.length ? m.keywords.join(", ") : "—",
      });
    } catch {
      setMeta(null);
    }
  }, []);

  return (
    <ToolWorkspace
      toolId="remove-metadata"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const data = await removeMetadata(files[0]);
        downloadPdf(data, `${baseName(files[0].name)}_clean.pdf`);
        setResult(
          formatResultSummary({ inputSize: files[0].size, outputSize: data.length }) +
            " · metadata cleared"
        );
        setMeta(null);
      }}
      processLabel="Remove metadata"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Strips title, author, subject, keywords, creator, producer, and dates from the PDF.
        </p>
        {meta && (
          <dl className="rounded-lg border border-border bg-slate-50 p-4 text-sm">
            <dt className="mb-2 font-medium">Current metadata</dt>
            {Object.entries(meta).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[7rem_1fr] gap-2 py-1">
                <dt className="text-muted">{key}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
