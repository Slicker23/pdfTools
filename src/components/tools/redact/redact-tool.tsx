"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import {
  DownloadActions,
  ResultBanner,
  type DownloadFileItem,
} from "@/components/tools/shared/tool-ui";
import { PII_TYPE_LABELS } from "@/lib/pii";
import type { PiiMatch } from "@/lib/pii";
import {
  baseName,
  redactPiiInPdf,
  redactPiiInText,
  scanPdfForPii,
  type PiiScanResult,
} from "@/lib/pdf";
import { toUserMessage } from "@/lib/pdf";
import { createDownloadLink } from "@/lib/utils";

type RedactMode = "text" | "pdf" | "both";

export function RedactTool() {
  const { status } = useSession();
  const [mode, setMode] = useState<RedactMode>("both");
  const [scan, setScan] = useState<PiiScanResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadFileItem[]>([]);

  const scanRef = useRef<PiiScanResult | null>(null);
  const fileRef = useRef<File | null>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const downloadsRef = useRef<DownloadFileItem[]>([]);

  const selectedMatches = useMemo(
    () => scan?.matches.filter((m) => selectedIds.has(m.id)) ?? [],
    [scan, selectedIds]
  );

  const clearDownloads = useCallback(() => {
    downloadsRef.current = [];
    setDownloads([]);
  }, []);

  useEffect(() => {
    downloadsRef.current = downloads;
  }, [downloads]);

  const handleFilesChange = useCallback(
    async (files: File[]) => {
      setResult(null);
      clearDownloads();
      setScan(null);
      scanRef.current = null;
      setScanError(null);
      setSelectedIds(new Set());
      selectedIdsRef.current = new Set();
      fileRef.current = files[0] ?? null;

      if (files.length === 0) return;

      setScanning(true);
      try {
        const scanResult = await scanPdfForPii(files[0]);
        setScan(scanResult);
        scanRef.current = scanResult;
        const ids = new Set<string>(scanResult.matches.map((m) => m.id));
        setSelectedIds(ids);
        selectedIdsRef.current = ids;
      } catch (e) {
        setScanError(toUserMessage(e));
      } finally {
        setScanning(false);
      }
    },
    [clearDownloads]
  );

  const toggleMatch = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selectedIdsRef.current = next;
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    if (!scan) return;
    const next = on ? new Set<string>(scan.matches.map((m) => m.id)) : new Set<string>();
    setSelectedIds(next);
    selectedIdsRef.current = next;
  };

  const previewRedacted = useMemo(() => {
    if (!scan || selectedMatches.length === 0) return null;
    let text = scan.fullText;
    const sorted = [...selectedMatches].sort((a, b) => b.value.length - a.value.length);
    for (const m of sorted) {
      text = text.split(m.value).join(`[REDACTED_${m.type.toUpperCase()}]`);
    }
    return text.slice(0, 4000) + (text.length > 4000 ? "\n…" : "");
  }, [scan, selectedMatches]);

  const disabledReason = scanning
    ? "Scanning document…"
    : !scan
      ? "Upload a PDF and wait for the scan to finish."
      : selectedMatches.length === 0
        ? scan.matches.length === 0
          ? "No PII patterns found in selectable text. Try OCR for scanned PDFs."
          : "Select at least one item to redact."
        : status === "unauthenticated"
          ? "Sign in to download redacted files."
          : undefined;

  const downloadPanel =
    downloads.length > 0 ? (
      <DownloadActions
        files={downloads}
        hint="Redaction complete — click a link below to save:"
      />
    ) : null;

  return (
    <ToolWorkspace
      toolId="redact-pdf"
      onFilesChange={handleFilesChange}
      onProcess={async () => {
        const file = fileRef.current;
        const currentScan = scanRef.current;
        const ids = selectedIdsRef.current;
        const matches = currentScan?.matches.filter((m) => ids.has(m.id)) ?? [];

        if (!file) throw new Error("Upload a PDF first");
        if (!currentScan) throw new Error("Scan the PDF first by uploading a file");
        if (matches.length === 0) {
          throw new Error("Select at least one item to redact");
        }

        setResult(null);
        clearDownloads();
        const base = baseName(file.name);
        const ready: DownloadFileItem[] = [];

        if (mode === "text" || mode === "both") {
          const textResult = await redactPiiInText(file, currentScan, matches);
          ready.push(
            createDownloadLink(
              [textResult.text],
              `${base}_redacted.txt`,
              "text file",
              "text/plain;charset=utf-8"
            )
          );
        }

        if (mode === "pdf" || mode === "both") {
          const pdfResult = await redactPiiInPdf(file, matches, currentScan);
          const pdfBytes = new Uint8Array(pdfResult.pdf);
          ready.push(
            createDownloadLink(
              [pdfBytes],
              `${base}_redacted.pdf`,
              "PDF",
              "application/pdf"
            )
          );
          setResult(
            `Redacted ${matches.length} item${matches.length !== 1 ? "s" : ""}` +
              (pdfResult.boxesDrawn > 0
                ? ` · ${pdfResult.boxesDrawn} black box${pdfResult.boxesDrawn !== 1 ? "es" : ""} on PDF`
                : " · PDF saved (text replacements applied; visual boxes need selectable text)")
          );
        } else {
          setResult(
            `Redacted text saved · ${matches.length} item${matches.length !== 1 ? "s" : ""}`
          );
        }

        downloadsRef.current = ready;
        setDownloads(ready);
      }}
      processLabel="Redact & download"
      disabled={scanning || !scan || selectedMatches.length === 0}
      disabledReason={disabledReason}
      afterActions={downloadPanel}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Scans selectable PDF text for emails, phones, SSN, IBAN, and card numbers. Review findings
          below, then download a redacted PDF and/or text file. Runs locally in your browser.
        </p>

        {status === "unauthenticated" && (
          <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <Link href="/api/auth/signin" className="font-medium underline">
              Sign in
            </Link>{" "}
            to redact and download — scanning works without an account.
          </p>
        )}

        <label className="block text-sm">
          <span className="font-medium">Output</span>
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={mode}
            onChange={(e) => setMode(e.target.value as RedactMode)}
          >
            <option value="both">Redacted PDF + text file</option>
            <option value="pdf">Redacted PDF (black boxes)</option>
            <option value="text">Redacted text file only</option>
          </select>
        </label>

        {scanning && <p className="text-sm text-muted">Scanning document for sensitive data…</p>}

        {scanError && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{scanError}</p>
        )}

        {scan && scan.matches.length === 0 && !scanning && (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
            No matching PII patterns in selectable text. Scanned PDFs need{" "}
            <Link href="/en/tools/ocr-pdf" className="underline">
              OCR
            </Link>{" "}
            first.
          </p>
        )}

        {scan && scan.matches.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Found {scan.matches.length} item{scan.matches.length !== 1 ? "s" : ""} — select
                what to redact
              </p>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary underline" onClick={() => toggleAll(true)}>
                  All
                </button>
                <button type="button" className="text-primary underline" onClick={() => toggleAll(false)}>
                  None
                </button>
              </div>
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2 text-sm">
              {scan.matches.map((m) => (
                <MatchRow
                  key={m.id}
                  match={m}
                  checked={selectedIds.has(m.id)}
                  onToggle={() => toggleMatch(m.id)}
                />
              ))}
            </ul>
          </div>
        )}

        {previewRedacted && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium text-muted">Preview after redaction</p>
            <pre className="whitespace-pre-wrap text-xs">{previewRedacted}</pre>
          </div>
        )}

        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}

function MatchRow({
  match,
  checked,
  onToggle,
}: {
  match: PiiMatch;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-slate-50">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" />
      <div className="min-w-0 flex-1">
        <span className="font-medium">{PII_TYPE_LABELS[match.type] ?? match.type}</span>
        <span className="text-muted"> · page {match.page}</span>
        <p className="truncate font-mono text-xs text-muted">{match.masked}</p>
      </div>
    </li>
  );
}
