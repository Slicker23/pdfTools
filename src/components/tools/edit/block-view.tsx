"use client";

/** @legacy Canvas overlay block view — kept for future canvas rebuild; not imported by edit-tool. */

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { PdfEditTextBlock } from "@/lib/pdf/edit-model";
import { sampleBackgroundColor } from "@/lib/pdf";
import { parseFontTraits, type FontFamily } from "@/lib/pdf/fonts";
import { textPreviewStyle } from "./text-metrics";

export interface BlockScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BlockViewProps {
  block: PdfEditTextBlock;
  viewport: PageViewport;
  pdfCanvas: HTMLCanvasElement | null;
  active: boolean;
  editing: boolean;
  /** When false the block is a passive preview (no pointer interaction). */
  interactive?: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onTextCommit: (text: string) => void;
  onTextEditEnd: () => void;
}

/** Map PDF bbox → screen box (PDF bottom-left origin). */
export function blockToScreenBox(
  viewport: PageViewport,
  block: PdfEditTextBlock
): BlockScreenBox {
  const b = block.bbox;
  const [x1, y1] = viewport.convertToViewportPoint(b.px, b.py) as [number, number];
  const [x2, y2] = viewport.convertToViewportPoint(b.px + b.pw, b.py + b.ph) as [
    number,
    number,
  ];
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.max(Math.abs(x2 - x1), 1),
    height: Math.max(Math.abs(y2 - y1), 1),
  };
}

/** Keep blocks that intersect the page (drop only fully off-page junk). */
export function blockWithinPage(
  block: PdfEditTextBlock,
  pageWidth: number,
  pageHeight: number
): boolean {
  const b = block.bbox;
  if (b.pw < 0.5 || b.ph < 0.5) return false;
  const right = b.px + b.pw;
  const top = b.py + b.ph;
  if (right < 0 || top < 0) return false;
  if (b.px > pageWidth || b.py > pageHeight) return false;
  return true;
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

function handleStyle(handle: (typeof HANDLES)[number]): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 7,
    height: 7,
    background: "#fff",
    border: "1.5px solid #2563eb",
    borderRadius: 1,
    zIndex: 3,
    pointerEvents: "none",
  };
  switch (handle) {
    case "nw":
      return { ...base, left: -4, top: -4 };
    case "n":
      return { ...base, left: "50%", top: -4, marginLeft: -3.5 };
    case "ne":
      return { ...base, right: -4, top: -4 };
    case "e":
      return { ...base, right: -4, top: "50%", marginTop: -3.5 };
    case "se":
      return { ...base, right: -4, bottom: -4 };
    case "s":
      return { ...base, left: "50%", bottom: -4, marginLeft: -3.5 };
    case "sw":
      return { ...base, left: -4, bottom: -4 };
    case "w":
      return { ...base, left: -4, top: "50%", marginTop: -3.5 };
  }
}

export function coverRect(block: PdfEditTextBlock) {
  const pad = 1;
  return {
    px: block.bbox.px - pad,
    py: block.bbox.py - pad,
    pw: block.bbox.pw + pad * 2,
    ph: block.bbox.ph + pad * 2,
  };
}

export const PdfBlockView = memo(function PdfBlockView({
  block,
  viewport,
  pdfCanvas,
  active,
  editing,
  interactive = true,
  onSelect,
  onStartEdit,
  onTextCommit,
  onTextEditEnd,
}: BlockViewProps) {
  const editRef = useRef<HTMLDivElement>(null);
  const enteredEditRef = useRef(false);
  const [draft, setDraft] = useState(block.text);

  const box = blockToScreenBox(viewport, block);
  const traits = parseFontTraits(block.font.name);
  const family = traits.family as FontFamily;
  const bold = block.font.bold ?? traits.bold;
  const italic = block.font.italic ?? traits.italic;
  const lineCount = Math.max(block.lineCount ?? 1, block.text.split("\n").length);

  const typography = textPreviewStyle(
    block.font.size,
    family,
    bold,
    italic,
    viewport.scale,
    { lineCount, boxHeightPx: box.height }
  );

  // Preview committed edits/deletions: whiteout covers the original PDF bitmap.
  const showPreview = Boolean(block.modified) || Boolean(block.deleted);
  const needsBg = showPreview;

  const bgColor = useMemo(() => {
    if (!needsBg || !pdfCanvas) return "#ffffff";
    return sampleBackgroundColor(pdfCanvas, viewport, coverRect(block));
  }, [needsBg, pdfCanvas, viewport, block.bbox.px, block.bbox.py, block.bbox.pw, block.bbox.ph]);

  useEffect(() => {
    if (editing) setDraft(block.text);
  }, [editing, block.id]); // eslint-disable-line react-hooks/exhaustive-deps -- seed draft once per edit session

  useEffect(() => {
    if (editing && !enteredEditRef.current && editRef.current) {
      enteredEditRef.current = true;
      editRef.current.innerText = block.text;
      editRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    if (!editing) enteredEditRef.current = false;
  }, [editing, block.id]);

  const finishEdit = () => {
    onTextCommit(draft);
    onTextEditEnd();
  };

  const outline = active
      ? "2px solid #2563eb"
      : showPreview
        ? "1px solid rgba(37, 99, 235, 0.35)"
        : "1px dashed rgba(37, 99, 235, 0.45)";

  const editStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    margin: 0,
    padding: 0,
    boxSizing: "border-box",
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    lineHeight: `${typography.lineHeight}px`,
    fontWeight: typography.fontWeight,
    fontStyle: typography.fontStyle,
    color: block.font.color,
    textAlign: "left",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflow: "hidden",
    fontSynthesis: "none",
    background: bgColor,
    outline: "none",
    cursor: "text",
    caretColor: block.font.color,
  };

  const beginEdit = (e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
  };

  const previewStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    background: bgColor,
    overflow: "hidden",
    pointerEvents: "none",
    ...(block.deleted
      ? {}
      : {
          fontFamily: typography.fontFamily,
          fontSize: typography.fontSize,
          lineHeight: `${typography.lineHeight}px`,
          fontWeight: typography.fontWeight,
          fontStyle: typography.fontStyle,
          color: block.font.color,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontSynthesis: "none",
        }),
  };

  return (
    <div
      role="button"
      data-block-id={block.id}
      tabIndex={editing ? -1 : 0}
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: Math.max(box.width, 8),
        height: Math.max(box.height, 10),
        zIndex: active ? 10 : showPreview ? 6 : 3,
        pointerEvents: interactive ? "auto" : "none",
        touchAction: "none",
        outline,
        outlineOffset: 0,
        contain: "layout style paint",
      }}
      onPointerDown={beginEdit}
      title={block.text.slice(0, 120)}
      aria-label={block.text.slice(0, 120)}
    >
      {showPreview && <div style={previewStyle}>{block.deleted ? "" : block.text}</div>}
      {active &&
        HANDLES.map((h) => <div key={h} style={handleStyle(h)} aria-hidden />)}
    </div>
  );
}, (prev, next) => {
  return (
    prev.block === next.block &&
    prev.editing === next.editing &&
    prev.active === next.active &&
    prev.interactive === next.interactive &&
    prev.viewport === next.viewport &&
    prev.pdfCanvas === next.pdfCanvas
  );
});
