"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Layers, Plus, RotateCcw, Trash2, Zap, PaintBucket, Undo2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PdfEditTextBlock } from "@/lib/pdf/edit-model";
import type { ApplyPlan, OverlayReason } from "@/lib/pdf/edit-overlay";
import { predictBlockApply, willRemoveOnDownload } from "@/lib/pdf/edit-overlay";
import { EditFormatBar } from "./edit-toolbar";
import type { FontFamily } from "@/lib/pdf";

interface FormatBarProps {
  color: string;
  fontFamily: FontFamily;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  onColorChange: (color: string) => void;
  onFontFamilyChange: (family: FontFamily) => void;
  onFontSizeChange: (size: number) => void;
  onBoldToggle: () => void;
  onItalicToggle: () => void;
}

interface BlocksPanelProps {
  pageNum: number;
  totalPages: number;
  blocks: PdfEditTextBlock[];
  activeBlock: PdfEditTextBlock | undefined;
  activeBlockId: string | null;
  editedCount: number;
  getApplyPlan: (id: string) => ApplyPlan | undefined;
  getOriginalSnapshot: (id: string) => import("@/lib/pdf-engine/plan").BlockOriginalSnapshot | undefined;
  getOriginalText: (id: string) => string | undefined;
  isEdited: (id: string) => boolean;
  showAllPages: boolean;
  onShowAllPagesChange: (value: boolean) => void;
  onDeselect: () => void;
  onChangeText: (id: string, text: string) => void;
  onDeleteBlock: (id: string) => void;
  onRestoreBlock: (id: string) => void;
  onToggleFlatten?: (id: string, flatten: boolean) => void;
  onResetAll: () => void;
  onAddText?: () => void;
  addTextHint?: string | null;
  formatBar: FormatBarProps | null;
  markupInspector?: ReactNode;
}

function overlayTooltip(reason?: OverlayReason): string {
  switch (reason) {
    case "style":
      return "Style change — repaints the region on download.";
    case "unencodable":
      return "New characters need redraw (outside embedded font subset).";
    case "multiline":
      return "Multi-line text — repaints the region.";
    case "no-locator":
      return "No native locator — repaints the region.";
    case "created":
      return "New text — inserted natively into the PDF content stream.";
    case "moved":
      return "Moved natively in the PDF content stream.";
    case "outlined":
      return "Flattened to vector paths on download (non-editable text).";
    default:
      return "Edited in place using the original embedded font.";
  }
}

export function BlocksPanel({
  pageNum,
  totalPages,
  blocks,
  activeBlock,
  activeBlockId,
  editedCount,
  getApplyPlan,
  getOriginalSnapshot,
  getOriginalText,
  isEdited,
  showAllPages,
  onShowAllPagesChange,
  onDeselect,
  onChangeText,
  onDeleteBlock,
  onRestoreBlock,
  onToggleFlatten,
  onResetAll,
  onAddText,
  addTextHint,
  formatBar,
  markupInspector,
}: BlocksPanelProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeBlockId) return;
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (!typing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onDeselect();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeBlockId, onDeselect]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Layers className="h-4 w-4 text-[#2563eb]" />
            Text editor
          </div>
          {onAddText && (
            <button
              type="button"
              onClick={onAddText}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-slate-50"
              title="Click the PDF page to place new text"
            >
              <Plus className="h-3 w-3" />
              Add text
            </button>
          )}
        </div>
        {addTextHint && <p className="text-xs text-[#2563eb]">{addTextHint}</p>}
        <p className="text-xs text-muted">
          {showAllPages ? "All pages" : `Page ${pageNum} of ${totalPages}`} · {blocks.length}{" "}
          region{blocks.length !== 1 ? "s" : ""}
          {editedCount > 0 ? ` · ${editedCount} edited` : ""}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {totalPages > 1 && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={showAllPages}
                onChange={(e) => onShowAllPagesChange(e.target.checked)}
              />
              All pages
            </label>
          )}
          {editedCount > 0 && (
            <button
              type="button"
              onClick={onResetAll}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#e5322d] hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Reset all
            </button>
          )}
        </div>
      </div>

      <BlockInspector
        block={activeBlock}
        applyPlan={
          activeBlock
            ? (getApplyPlan(activeBlock.id) ??
              predictBlockApply(
                { ...activeBlock, modified: activeBlock.modified ?? true },
                getOriginalSnapshot(activeBlock.id)
              ))
            : null
        }
        originalText={activeBlock ? getOriginalText(activeBlock.id) : undefined}
        edited={activeBlock ? isEdited(activeBlock.id) : false}
        formatBar={formatBar}
        onChangeText={(text) => activeBlock && onChangeText(activeBlock.id, text)}
        onDelete={() => activeBlock && onDeleteBlock(activeBlock.id)}
        onRestore={() => activeBlock && onRestoreBlock(activeBlock.id)}
        onToggleFlatten={
          onToggleFlatten && activeBlock
            ? (flatten) => onToggleFlatten(activeBlock.id, flatten)
            : undefined
        }
      />

      {!activeBlock && markupInspector && (
        <div className="border-b border-border px-3 py-3">{markupInspector}</div>
      )}

      {!activeBlock && !markupInspector && (
        <div className="flex flex-1 items-center justify-center px-4 py-6 text-center text-xs leading-relaxed text-muted">
          Click text on the PDF to select a region and edit it here.
        </div>
      )}
    </div>
  );
}

function planTooltip(plan: ApplyPlan | null): string {
  if (!plan) return "Analyzing apply strategy…";
  switch (plan.strategy) {
    case "overlay":
      return overlayTooltip(plan.reason);
    case "native-flatten":
      return overlayTooltip("outlined");
    case "native-move":
      return overlayTooltip("moved");
    case "native-insert":
      return overlayTooltip("created");
    case "native-in-place":
      return overlayTooltip(undefined);
    default:
      return "";
  }
}

interface BlockInspectorProps {
  block: PdfEditTextBlock | undefined;
  applyPlan: ApplyPlan | null;
  originalText?: string;
  edited: boolean;
  formatBar: FormatBarProps | null;
  onChangeText: (text: string) => void;
  onDelete: () => void;
  onRestore: () => void;
  onToggleFlatten?: (flatten: boolean) => void;
}

function BlockInspector({
  block,
  applyPlan,
  originalText,
  edited,
  formatBar,
  onChangeText,
  onDelete,
  onRestore,
  onToggleFlatten,
}: BlockInspectorProps) {
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (block) setDraft(block.text);
  }, [block?.id, block?.text]);

  useEffect(() => {
    if (block && taRef.current && !block.deleted) {
      const el = taRef.current;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
    }
  }, [block, draft]);

  if (!block) return null;

  const displayDeleted = originalText ?? block.text;
  const removeOnDownload = willRemoveOnDownload(block, originalText);

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-2 bg-slate-50/50 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
            applyPlan?.strategy === "overlay"
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800"
          )}
          title={planTooltip(applyPlan)}
        >
          {applyPlan?.strategy === "overlay" ? (
            <>
              <PaintBucket className="h-3 w-3" /> Redraw
            </>
          ) : applyPlan?.strategy === "native-flatten" ? (
            <>
              <PenLine className="h-3 w-3" /> Outlined
            </>
          ) : applyPlan?.strategy === "native-move" ? (
            <>
              <Zap className="h-3 w-3" /> Moved
            </>
          ) : applyPlan?.strategy === "native-insert" ? (
            <>
              <Plus className="h-3 w-3" /> Created
            </>
          ) : (
            <>
              <Zap className="h-3 w-3" /> In-place
            </>
          )}
        </span>
        <div className="flex items-center gap-1">
          {edited && (
            <button
              type="button"
              className="rounded p-1 text-muted hover:text-foreground"
              title="Revert this region"
              onClick={onRestore}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          )}
          {!block.deleted && (
            <button
              type="button"
              className="rounded p-1 text-muted hover:text-[#e5322d]"
              title="Remove from PDF"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {formatBar && !block.deleted && (
        <EditFormatBar
          compact
          color={formatBar.color}
          fontFamily={formatBar.fontFamily}
          fontSize={formatBar.fontSize}
          align="left"
          bold={formatBar.bold}
          italic={formatBar.italic}
          underline={false}
          showStroke={false}
          strokeWidth={2}
          fillEnabled={false}
          showFill={false}
          onColorChange={formatBar.onColorChange}
          onFontFamilyChange={formatBar.onFontFamilyChange}
          onFontSizeChange={formatBar.onFontSizeChange}
          onAlignChange={() => {}}
          onBoldToggle={formatBar.onBoldToggle}
          onItalicToggle={formatBar.onItalicToggle}
        />
      )}

      {!block.deleted && onToggleFlatten && block.locator && !block.created && (
        <label
          className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
          title={
            !block.supportsOutlines
              ? "No embedded font program — outlines require FontFile2/FontFile3"
              : undefined
          }
        >
          <input
            type="checkbox"
            checked={Boolean(block.flattenToPath)}
            disabled={!block.supportsOutlines}
            onChange={(e) => onToggleFlatten(e.target.checked)}
            className="rounded border-border disabled:opacity-50"
          />
          Flatten to outlines on download
        </label>
      )}

      {!block.deleted && (
        <p className="text-[10px] text-muted">Drag the selection on the PDF to reposition.</p>
      )}

      {block.deleted ? (
        <p className="text-xs italic text-muted line-through">{displayDeleted || "(removed)"}</p>
      ) : (
        <textarea
          ref={taRef}
          value={draft}
          rows={4}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            onChangeText(e.target.value);
            e.currentTarget.style.height = "auto";
            e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 280)}px`;
          }}
          placeholder={draft.length === 0 ? "Type replacement text…" : undefined}
          className="min-h-[6rem] w-full flex-1 resize-none rounded-md border border-border bg-white px-2 py-1.5 text-sm text-foreground outline-none focus:border-[#2563eb]"
        />
      )}

      {!block.deleted && (
        <p className="truncate text-[10px] text-muted" title={block.font.name}>
          {block.font.name} · {Math.round(block.font.size * 10) / 10}pt
          {block.lineCount && block.lineCount > 1 ? ` · ${block.lineCount} lines` : ""}
        </p>
      )}
      {removeOnDownload && (
        <p className="text-[10px] text-amber-700">Empty on download removes this text from the PDF</p>
      )}
    </div>
  );
}
