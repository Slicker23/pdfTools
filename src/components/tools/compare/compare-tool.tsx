"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { Button } from "@/components/ui/button";
import { comparePdfs, renderCompareDiff, type CompareResult } from "@/lib/pdf";
import { cn } from "@/lib/utils";

export function CompareTool() {
  const [files, setFiles] = useState<[File | null, File | null]>([null, null]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [diffPage, setDiffPage] = useState<number | null>(null);
  const [diffImage, setDiffImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesChange = useCallback((uploaded: File[]) => {
    setResult(null);
    setDiffPage(null);
    setDiffImage(null);
    setError(null);
    setFiles([uploaded[0] ?? null, uploaded[1] ?? null]);
  }, []);

  const runCompare = async () => {
    if (!files[0] || !files[1]) return;
    setLoading(true);
    setError(null);
    setDiffPage(null);
    setDiffImage(null);
    try {
      const cmp = await comparePdfs(files[0], files[1]);
      setResult(cmp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setLoading(false);
    }
  };

  const showDiff = async (page: number) => {
    if (!files[0] || !files[1]) return;
    setDiffPage(page);
    setLoading(true);
    try {
      setDiffImage(await renderCompareDiff(files[0], files[1], page));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not render diff");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolWorkspace
      toolId="compare-pdf"
      multiple
      minFiles={2}
      onFilesChange={handleFilesChange}
      onProcess={async () => {
        await runCompare();
      }}
      processLabel="Compare PDFs"
      disabled={!files[0] || !files[1] || loading}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Upload two PDFs in order (original first, revised second). Pages are compared visually;
          differences are highlighted in red on the diff preview.
        </p>

        {files[0] && files[1] && (
          <dl className="grid gap-2 rounded-lg border border-border bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">Document A</dt>
              <dd className="truncate text-muted">{files[0].name}</dd>
            </div>
            <div>
              <dt className="font-medium">Document B</dt>
              <dd className="truncate text-muted">{files[1].name}</dd>
            </div>
          </dl>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        )}

        {result && (
          <>
            <ResultBanner
              variant={result.overallMatch ? "success" : "info"}
              message={
                result.overallMatch
                  ? `Documents match (${result.pageCountA} pages)`
                  : `Differences found · A: ${result.pageCountA} pages · B: ${result.pageCountB} pages`
              }
            />

            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-sm">
              {result.pages.map((p) => (
                <li
                  key={p.page}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded px-2 py-1.5",
                    !p.match && "bg-red-50"
                  )}
                >
                  <span>
                    Page {p.page}{" "}
                    {p.match ? (
                      <span className="text-green-700">· match</span>
                    ) : (
                      <span className="text-red-700">· {p.diffPercent.toFixed(1)}% different</span>
                    )}
                  </span>
                  {!p.match && p.width > 0 && (
                    <Button type="button" size="sm" variant="outline" onClick={() => showDiff(p.page)}>
                      View diff
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {diffImage && diffPage !== null && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Diff preview · page {diffPage}</p>
            <img
              src={diffImage}
              alt={`Difference on page ${diffPage}`}
              className="max-w-full rounded-lg border border-border"
            />
          </div>
        )}
      </div>
    </ToolWorkspace>
  );
}
