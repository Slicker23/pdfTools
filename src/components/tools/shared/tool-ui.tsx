"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FileText, GripVertical, X } from "lucide-react";
import { downloadBlob, formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface SortableFileItem {
  file: File;
  pageCount?: number;
  loading?: boolean;
}

interface SortableFileListProps {
  items: SortableFileItem[];
  onReorder: (items: SortableFileItem[]) => void;
  onRemove: (index: number) => void;
}

export function SortableFileList({ items, onReorder, onRemove }: SortableFileListProps) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder(next);
  };

  if (items.length === 0) return null;

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item.file.name}-${index}`}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
        >
          <GripVertical className="h-4 w-4 shrink-0 text-muted" />
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.file.name}</p>
            <p className="text-xs text-muted">
              {formatBytes(item.file.size)}
              {item.loading && " · reading..."}
              {!item.loading && item.pageCount !== undefined && ` · ${item.pageCount} pages`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Move up"
              className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
              disabled={index === items.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Remove"
              className="rounded p-1 hover:bg-slate-100"
              onClick={() => onRemove(index)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface PageRangeInputProps {
  value: string;
  onChange: (value: string) => void;
  totalPages?: number;
  hint?: string;
  label?: string;
}

export function PageRangeInput({
  value,
  onChange,
  totalPages,
  hint = "e.g. 1-3, 5, 7-10",
  label = "Page ranges",
}: PageRangeInputProps) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {totalPages !== undefined && (
        <span className="ml-2 text-muted">({totalPages} pages total)</span>
      )}
      <input
        className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        spellCheck={false}
      />
    </label>
  );
}

interface ResultBannerProps {
  message: string;
  variant?: "success" | "info" | "error";
}

export function ResultBanner({ message, variant = "success" }: ResultBannerProps) {
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-3 text-sm",
        variant === "success" && "bg-green-50 text-green-800",
        variant === "info" && "bg-blue-50 text-blue-800",
        variant === "error" && "bg-red-50 text-red-800"
      )}
    >
      {message}
    </div>
  );
}

export interface DownloadFileItem {
  filename: string;
  label: string;
  mime: string;
  blob: Blob;
  size: number;
}

interface DownloadActionsProps {
  files: DownloadFileItem[];
  hint?: string;
}

export function DownloadActions({ files, hint }: DownloadActionsProps) {
  if (files.length === 0) return null;

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
      <p className="text-sm font-medium text-green-900">
        {hint ?? "Your file is ready — click to download:"}
      </p>
      <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <button
            key={file.filename}
            type="button"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-blue-700"
            onClick={() => downloadBlob(file.blob.slice(), file.filename)}
          >
            Download {file.label} ({formatBytes(file.size)})
          </button>
        ))}
      </div>
    </div>
  );
}

interface PageOrderEditorProps {
  order: number[];
  onChange: (order: number[]) => void;
}

export function PageOrderEditor({ order, onChange }: PageOrderEditorProps) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Page order (first = page 1 in output)</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {order.map((pageNum, index) => (
          <li
            key={`${pageNum}-${index}`}
            className="flex flex-col items-center rounded-xl border border-border bg-card p-3 text-center"
          >
            <span className="text-xs text-muted">Out {index + 1}</span>
            <span className="my-1 text-xl font-bold">p{pageNum}</span>
            <div className="flex w-full gap-2">
              <button
                type="button"
                aria-label="Move page left"
                className="flex flex-1 items-center justify-center rounded-lg border border-border bg-slate-50 py-2.5 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <ChevronLeft className="h-7 w-7" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                aria-label="Move page right"
                className="flex flex-1 items-center justify-center rounded-lg border border-border bg-slate-50 py-2.5 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                disabled={index === order.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <ChevronRight className="h-7 w-7" strokeWidth={2.5} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
