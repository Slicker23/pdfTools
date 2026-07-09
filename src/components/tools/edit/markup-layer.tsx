"use client";

import { useCallback, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import { createObjectId, type EditObject, type ShapeObject } from "@/lib/pdf";
import type { EditorApi } from "./use-editor";
import { ObjectView, type ScreenBox } from "./object-view";
import { pdfRectToScreenBox } from "./block-bounds";
import type { EditToolMode } from "./edit-toolbar";
import {
  brushBoundsFromPoints,
  brushPointsToScreenString,
  hitTestEditObject,
  screenBoxToPdfBBox,
  screenPointToPdf,
} from "./markup-utils";

const MIN_DRAG_PX = 4;

type DragPreview =
  | { kind: "rect"; box: ScreenBox; markType?: "highlight" | "underline" | "strikethrough" }
  | { kind: "shape"; box: ScreenBox; shape: "rect" | "ellipse" | "line"; antiDiagonal?: boolean }
  | { kind: "brush"; points: { x: number; y: number }[] };

function isMarkupTool(tool: EditToolMode): boolean {
  return (
    tool === "highlight" ||
    tool === "underline" ||
    tool === "strikethrough" ||
    tool === "brush" ||
    tool === "rect" ||
    tool === "ellipse" ||
    tool === "line" ||
    tool === "image" ||
    tool === "eraser"
  );
}

interface MarkupLayerProps {
  viewport: PageViewport;
  pageNum: number;
  scale: number;
  toolMode: EditToolMode;
  markupColor: string;
  strokeWidth: number;
  shapeFill: boolean;
  editor: EditorApi;
  markupInteractive: boolean;
  onClearTextSelection: () => void;
  onRequestImage: (pdfX: number, pdfY: number) => void;
}

export function MarkupLayer({
  viewport,
  pageNum,
  scale,
  toolMode,
  markupColor,
  strokeWidth,
  shapeFill,
  editor,
  markupInteractive,
  onClearTextSelection,
  onRequestImage,
}: MarkupLayerProps) {
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);
  const liveDragRef = useRef<{ id: string; startBox: ScreenBox } | null>(null);

  const pageObjects = editor.objects.filter((o) => o.page === pageNum);

  const getCanvasCoords = useCallback(
    (e: React.PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * viewport.width,
        y: ((e.clientY - rect.top) / rect.height) * viewport.height,
      };
    },
    [viewport.width, viewport.height]
  );

  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    if (!markupInteractive || !isMarkupTool(toolMode)) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = getCanvasCoords(e);
    dragRef.current = { startX: x, startY: y };

    if (toolMode === "image") {
      const { px, py } = screenPointToPdf(viewport, x, y);
      onRequestImage(px, py);
      dragRef.current = null;
      return;
    }

    if (toolMode === "eraser") {
      const { px, py } = screenPointToPdf(viewport, x, y);
      const hit = hitTestEditObject(editor.objects, pageNum, px, py);
      if (hit) editor.remove(hit.id);
      return;
    }

    if (toolMode === "brush") {
      setPreview({ kind: "brush", points: [{ x, y }] });
      return;
    }

    if (toolMode === "highlight" || toolMode === "underline" || toolMode === "strikethrough") {
      setPreview({
        kind: "rect",
        box: { left: x, top: y, width: 0, height: 0 },
        markType: toolMode,
      });
      return;
    }

    if (toolMode === "rect" || toolMode === "ellipse" || toolMode === "line") {
      setPreview({
        kind: "shape",
        box: { left: x, top: y, width: 0, height: 0 },
        shape: toolMode,
      });
    }
  };

  const handleOverlayPointerMove = (e: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start) return;
    const { x, y } = getCanvasCoords(e);

    if (toolMode === "eraser") {
      const { px, py } = screenPointToPdf(viewport, x, y);
      const hit = hitTestEditObject(editor.objects, pageNum, px, py);
      if (hit) editor.remove(hit.id);
      return;
    }

    if (toolMode === "brush" && preview?.kind === "brush") {
      setPreview({ kind: "brush", points: [...preview.points, { x, y }] });
      return;
    }

    const box: ScreenBox = {
      left: Math.min(start.startX, x),
      top: Math.min(start.startY, y),
      width: Math.abs(x - start.startX),
      height: Math.abs(y - start.startY),
    };

    if (preview?.kind === "rect") {
      setPreview({ ...preview, box });
      return;
    }

    if (preview?.kind === "shape" && preview.shape === "line") {
      setPreview({
        ...preview,
        box,
        antiDiagonal: y < start.startY,
      });
    } else if (preview?.kind === "shape") {
      setPreview({ ...preview, box });
    }
  };

  const handleOverlayPointerUp = () => {
    const start = dragRef.current;
    dragRef.current = null;

    if (!preview || !start) {
      setPreview(null);
      return;
    }

    if (preview.kind === "brush" && preview.points.length >= 2) {
      const pdfPoints = preview.points.map((p) => screenPointToPdf(viewport, p.x, p.y));
      const bounds = brushBoundsFromPoints(
        pdfPoints.map((p) => ({ x: p.px, y: p.py })),
        strokeWidth
      );
      editor.add({
        id: createObjectId(),
        page: pageNum,
        type: "brush",
        color: markupColor,
        strokeWidth,
        points: pdfPoints.map((p) => ({ x: p.px, y: p.py })),
        ...bounds,
      });
      onClearTextSelection();
    } else if (preview.kind === "rect" && preview.markType) {
      const { width, height } = preview.box;
      if (width >= MIN_DRAG_PX || height >= MIN_DRAG_PX) {
        const bbox = screenBoxToPdfBBox(viewport, preview.box);
        editor.add({
          id: createObjectId(),
          page: pageNum,
          type: preview.markType,
          color: markupColor,
          ...bbox,
        });
        onClearTextSelection();
      }
    } else if (preview.kind === "shape") {
      const { width, height } = preview.box;
      if (width >= MIN_DRAG_PX || height >= MIN_DRAG_PX) {
        const bbox = screenBoxToPdfBBox(viewport, preview.box);
        const shapeObj: ShapeObject = {
          id: createObjectId(),
          page: pageNum,
          type: "shape",
          shape: preview.shape,
          stroke: markupColor,
          strokeWidth,
          fill: preview.shape !== "line" && shapeFill ? markupColor : undefined,
          antiDiagonal: preview.antiDiagonal,
          ...bbox,
        };
        editor.add(shapeObj);
        onClearTextSelection();
      }
    }

    setPreview(null);
  };

  const renderPreview = () => {
    if (!preview) return null;

    if (preview.kind === "brush") {
      if (preview.points.length < 2) return null;
      const d = preview.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      return (
        <svg className="pointer-events-none absolute inset-0" width={viewport.width} height={viewport.height}>
          <path
            d={d}
            fill="none"
            stroke={markupColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    const { box } = preview;
    if (preview.kind === "rect") {
      const bg =
        preview.markType === "highlight"
          ? { background: markupColor, opacity: 0.4 }
          : preview.markType === "underline"
            ? {
                borderBottom: `${Math.max(2, strokeWidth)}px solid ${markupColor}`,
              }
            : {
                position: "relative" as const,
                background: "transparent",
              };
      return (
        <div
          className="pointer-events-none absolute border border-dashed border-[#2563eb]/40"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            ...bg,
          }}
        >
          {preview.markType === "strikethrough" && (
            <div
              className="absolute left-0 right-0 top-1/2 -translate-y-1/2"
              style={{ height: Math.max(2, strokeWidth), background: markupColor }}
            />
          )}
        </div>
      );
    }

    if (preview.kind === "shape") {
      if (preview.shape === "line") {
        const x1 = preview.antiDiagonal ? box.left : box.left;
        const y1 = preview.antiDiagonal ? box.top + box.height : box.top;
        const x2 = box.left + box.width;
        const y2 = preview.antiDiagonal ? box.top : box.top + box.height;
        return (
          <svg className="pointer-events-none absolute inset-0" width={viewport.width} height={viewport.height}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={markupColor}
              strokeWidth={strokeWidth}
            />
          </svg>
        );
      }
      if (preview.shape === "ellipse") {
        return (
          <div
            className="pointer-events-none absolute rounded-full border-2"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              borderColor: markupColor,
              background: shapeFill ? `${markupColor}66` : "transparent",
            }}
          />
        );
      }
      return (
        <div
          className="pointer-events-none absolute border-2"
          style={{
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            borderColor: markupColor,
            background: shapeFill ? `${markupColor}66` : "transparent",
          }}
        />
      );
    }

    return null;
  };

  return (
    <div
      className="absolute inset-0 z-[15]"
      style={{ pointerEvents: markupInteractive && isMarkupTool(toolMode) ? "auto" : "none" }}
    >
      {pageObjects.map((obj) => {
        const box = pdfRectToScreenBox(viewport, {
          px: obj.px,
          py: obj.py,
          pw: obj.pw,
          ph: obj.ph,
        });
        const brushPoints =
          obj.type === "brush"
            ? brushPointsToScreenString(viewport, box, obj.points)
            : undefined;

        return (
          <ObjectView
            key={obj.id}
            object={obj}
            box={box}
            scale={scale}
            selected={editor.selectedId === obj.id}
            editing={editingTextId === obj.id}
            interactive={markupInteractive && toolMode === "select"}
            brushPoints={brushPoints}
            onSelect={(id) => {
              editor.setSelectedId(id);
              onClearTextSelection();
            }}
            onStartEdit={(id) => {
              if (obj.type === "text") setEditingTextId(id);
            }}
            onDragStart={() => {
              editor.beginHistory();
              liveDragRef.current = { id: obj.id, startBox: box };
            }}
            onDrag={(nextBox) => {
              if (liveDragRef.current) editor.updateLive(obj.id, screenBoxToPdfBBox(viewport, nextBox));
            }}
            onResize={(nextBox) => {
              if (liveDragRef.current) editor.updateLive(obj.id, screenBoxToPdfBBox(viewport, nextBox));
            }}
            onTextChange={(id, text) => editor.updateLive(id, { text } as Partial<EditObject>)}
            onTextEditEnd={(id) => {
              setEditingTextId(null);
              const current = editor.objects.find((o) => o.id === id);
              if (current?.type === "text") editor.update(id, { text: current.text });
            }}
          />
        );
      })}

      {renderPreview()}

      {markupInteractive && isMarkupTool(toolMode) && (
        <div
          className="absolute inset-0 touch-none"
          style={{
            cursor:
              toolMode === "eraser"
                ? "not-allowed"
                : toolMode === "brush"
                  ? "crosshair"
                  : toolMode === "image"
                    ? "copy"
                    : "crosshair",
          }}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerLeave={handleOverlayPointerUp}
        />
      )}
    </div>
  );
}

export { isMarkupTool };
