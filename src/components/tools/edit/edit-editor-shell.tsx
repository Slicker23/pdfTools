"use client";

import type { ReactNode } from "react";
import { ChevronLeft, Loader2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditEditorShellProps {
  fileName: string;
  onChangeFile: () => void;
  onDownload: () => void;
  downloading: boolean;
  downloadDisabled: boolean;
  downloadHint?: string | null;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  pageNum: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  leftToolbar?: ReactNode;
  rightPanel?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onUndo?: () => void;
  canUndo?: boolean;
}

export function EditEditorShell({
  fileName,
  onChangeFile,
  onDownload,
  downloading,
  downloadDisabled,
  downloadHint,
  scale,
  onZoomIn,
  onZoomOut,
  pageNum,
  totalPages,
  onPrevPage,
  onNextPage,
  leftToolbar,
  rightPanel,
  children,
  footer,
  onUndo,
  canUndo,
}: EditEditorShellProps) {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border border-border bg-[#eef0f4] shadow-sm">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-white px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted"
          onClick={onChangeFile}
        >
          <ChevronLeft className="h-4 w-4" />
          Change file
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{fileName}</p>
        <div className="flex items-center gap-1">
          {onUndo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canUndo}
              onClick={onUndo}
              title="Undo markup (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onZoomOut} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="hidden min-w-[3rem] text-center text-xs text-muted sm:inline">
            {Math.round(scale * 100)}%
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onZoomIn} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={downloadDisabled || downloading}
          onClick={onDownload}
          className="shrink-0 bg-[#e5322d] px-5 hover:bg-[#c92b27]"
        >
          {downloading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            "Download"
          )}
        </Button>
      </header>

      {downloadHint && (
        <p className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          {downloadHint}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4 md:p-6">
            {leftToolbar && (
              <div className="sticky top-0 mr-3 flex shrink-0 flex-col gap-1 self-start">
                {leftToolbar}
              </div>
            )}
            {children}
          </div>

          <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-border bg-white px-4 py-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pageNum <= 1}
              onClick={onPrevPage}
            >
              Previous
            </Button>
            <span className="text-sm text-muted">
              Page {pageNum} / {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pageNum >= totalPages}
              onClick={onNextPage}
            >
              Next
            </Button>
          </footer>

          {footer}
        </div>

        {rightPanel && (
          <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-white sm:w-80 lg:w-96">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
