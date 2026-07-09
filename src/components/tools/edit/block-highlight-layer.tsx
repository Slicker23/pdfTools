"use client";

import { memo, useMemo, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { PdfEditTextBlock } from "@/lib/pdf/edit-model";
import { cn } from "@/lib/utils";
import { blockToInteractionScreenBox, screenDeltaToPdfDelta } from "./block-bounds";

interface BlockHighlightLayerProps {
  blocks: PdfEditTextBlock[];
  viewport: PageViewport;
  activeBlockId: string | null;
  hoverBlockId: string | null;
  placingText: boolean;
  /** When true, text block hit-testing is disabled (markup draw mode). */
  markupMode?: boolean;
  isContentEdited: (id: string) => boolean;
  onHoverBlock: (id: string | null) => void;
  onSelectBlock: (id: string) => void;
  onMoveBlock?: (id: string, position: { px: number; py: number }) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

/** Reading order: top-to-bottom, left-to-right in PDF space. */
export function sortBlocksReadingOrder(blocks: PdfEditTextBlock[]): PdfEditTextBlock[] {
  return [...blocks].sort((a, b) => {
    const dy = b.bbox.py - a.bbox.py;
    if (Math.abs(dy) > 2) return dy;
    return a.bbox.px - b.bbox.px;
  });
}

const DRAG_THRESHOLD_PX = 6;

export const BlockHighlightLayer = memo(function BlockHighlightLayer({
  blocks,
  viewport,
  activeBlockId,
  hoverBlockId,
  placingText,
  markupMode = false,
  isContentEdited,
  onHoverBlock,
  onSelectBlock,
  onMoveBlock,
  onDragStateChange,
}: BlockHighlightLayerProps) {
  const sorted = useMemo(() => sortBlocksReadingOrder(blocks), [blocks]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originPx: number;
    originPy: number;
    dragging: boolean;
  } | null>(null);

  const beginDrag = (e: React.PointerEvent, block: PdfEditTextBlock) => {
    if (placingText || block.deleted || !onMoveBlock) return;
    e.stopPropagation();
    onSelectBlock(block.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: block.id,
      startX: e.clientX,
      startY: e.clientY,
      originPx: block.bbox.px,
      originPy: block.bbox.py,
      dragging: false,
    };
  };

  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !onMoveBlock) return;
    const dxScreen = e.clientX - d.startX;
    const dyScreen = e.clientY - d.startY;
    if (!d.dragging && Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD_PX) return;
    if (!d.dragging) {
      d.dragging = true;
      setDraggingId(d.id);
      onDragStateChange?.(true);
    }
    const { dx, dy } = screenDeltaToPdfDelta(viewport, dxScreen, dyScreen);
    onMoveBlock(d.id, { px: d.originPx + dx, py: d.originPy + dy });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d?.dragging) {
      setDraggingId(null);
      onDragStateChange?.(false);
    }
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        "absolute inset-0",
        placingText || markupMode ? "pointer-events-none" : "cursor-pointer"
      )}
      aria-hidden
    >
      {sorted.map((block) => {
        const contentEdited = isContentEdited(block.id);
        const box = blockToInteractionScreenBox(viewport, block, contentEdited);
        const active = block.id === activeBlockId;
        const hover = block.id === hoverBlockId && !active;
        const canDrag = active && !placingText && !block.deleted && Boolean(onMoveBlock);

        return (
          <div
            key={block.id}
            className={cn(
              "absolute box-border transition-colors",
              active
                ? "z-20 border-2 border-[#2563eb] bg-blue-500/5"
                : hover
                  ? "z-10 border border-dashed border-[#2563eb]/70 bg-blue-500/5"
                  : "z-[8] border border-transparent hover:border-dashed hover:border-[#2563eb]/40"
            )}
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              touchAction: canDrag ? "none" : undefined,
              cursor: draggingId === block.id ? "grabbing" : canDrag ? "grab" : undefined,
            }}
            onMouseEnter={() => onHoverBlock(block.id)}
            onMouseLeave={() => onHoverBlock(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectBlock(block.id);
            }}
            onPointerDown={canDrag ? (e) => beginDrag(e, block) : undefined}
            onPointerMove={canDrag ? moveDrag : undefined}
            onPointerUp={canDrag ? endDrag : undefined}
            onPointerCancel={canDrag ? endDrag : undefined}
          />
        );
      })}
    </div>
  );
});
