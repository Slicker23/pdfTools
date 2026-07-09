"use client";

import { useEffect, useRef } from "react";
import type { EditObject } from "@/lib/pdf";
import { textPreviewStyle } from "./text-metrics";

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface ObjectViewProps {
  object: EditObject;
  box: ScreenBox;
  scale: number;
  selected: boolean;
  editing: boolean;
  interactive: boolean;
  /** Screen-space polyline points ("x,y x,y ...") relative to box, for brush. */
  brushPoints?: string;
  onSelect: (id: string) => void;
  onStartEdit: (id: string) => void;
  onDragStart: () => void;
  onDrag: (box: ScreenBox) => void;
  onResize: (box: ScreenBox) => void;
  onTextChange: (id: string, text: string) => void;
  onTextEditEnd: (id: string) => void;
}

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function handleStyle(h: ResizeHandle): React.CSSProperties {
  const map: Record<ResizeHandle, React.CSSProperties> = {
    nw: { left: -4, top: -4, cursor: "nwse-resize" },
    n: { left: "50%", top: -4, marginLeft: -4, cursor: "ns-resize" },
    ne: { right: -4, top: -4, cursor: "nesw-resize" },
    e: { right: -4, top: "50%", marginTop: -4, cursor: "ew-resize" },
    se: { right: -4, bottom: -4, cursor: "nwse-resize" },
    s: { left: "50%", bottom: -4, marginLeft: -4, cursor: "ns-resize" },
    sw: { left: -4, bottom: -4, cursor: "nesw-resize" },
    w: { left: -4, top: "50%", marginTop: -4, cursor: "ew-resize" },
  };
  return map[h];
}

function resizeBox(box: ScreenBox, h: ResizeHandle, dx: number, dy: number): ScreenBox {
  let { left, top, width, height } = box;
  if (h.includes("e")) width += dx;
  if (h.includes("s")) height += dy;
  if (h.includes("w")) {
    left += dx;
    width -= dx;
  }
  if (h.includes("n")) {
    top += dy;
    height -= dy;
  }
  const min = 6;
  if (width < min) width = min;
  if (height < min) height = min;
  return { left, top, width, height };
}

export function ObjectView(props: ObjectViewProps) {
  const {
    object,
    box,
    scale,
    selected,
    editing,
    interactive,
    brushPoints,
    onSelect,
    onStartEdit,
    onDragStart,
    onDrag,
    onResize,
    onTextChange,
    onTextEditEnd,
  } = props;

  const editRef = useRef<HTMLDivElement>(null);
  const wasEditingRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; box: ScreenBox } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    box: ScreenBox;
    handle: ResizeHandle;
  } | null>(null);

  useEffect(() => {
    const justStarted = editing && !wasEditingRef.current;
    wasEditingRef.current = editing;
    if (!justStarted || !editRef.current || object.type !== "text") return;

    const el = editRef.current;
    el.innerText = object.text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing, object]);

  const beginDrag = (e: React.PointerEvent) => {
    if (!interactive || editing) return;
    e.stopPropagation();
    onSelect(object.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, box };
    onDragStart();
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (resizeRef.current) {
      const r = resizeRef.current;
      onResize(resizeBox(r.box, r.handle, e.clientX - r.startX, e.clientY - r.startY));
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    onDrag({
      ...d.box,
      left: d.box.left + (e.clientX - d.startX),
      top: d.box.top + (e.clientY - d.startY),
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d && object.type === "text" && interactive && !editing) {
      const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (moved < 6) onStartEdit(object.id);
    }
    dragRef.current = null;
    resizeRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const beginResize = (e: React.PointerEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(object.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, box, handle };
    onDragStart();
  };

  const positionStyle: React.CSSProperties = {
    position: "absolute",
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    opacity: object.opacity ?? 1,
    pointerEvents:
      object.type === "whiteout" ? "none" : interactive || editing ? "auto" : "none",
    cursor: interactive && !editing ? "move" : undefined,
  };

  const outline = editing
    ? { outline: "2px solid #2563eb", outlineOffset: 0 }
    : selected
      ? { outline: "1.5px solid #2563eb", outlineOffset: 1 }
      : undefined;

  const canResize =
    interactive && selected && object.type !== "brush" && object.type !== "whiteout";

  const content = renderContent(
    object,
    box,
    scale,
    brushPoints,
    editing,
    editRef,
    onTextChange,
    onTextEditEnd
  );

  return (
    <div
      style={{ ...positionStyle, ...outline, touchAction: "none" }}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
    >
      {content}
      {canResize &&
        HANDLES.map((h) => (
          <div
            key={h}
            onPointerDown={(e) => beginResize(e, h)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            style={{
              position: "absolute",
              width: 8,
              height: 8,
              background: "#fff",
              border: "1.5px solid #2563eb",
              borderRadius: 2,
              zIndex: 2,
              ...handleStyle(h),
            }}
          />
        ))}
    </div>
  );
}

function renderContent(
  object: EditObject,
  box: ScreenBox,
  scale: number,
  brushPoints: string | undefined,
  editing: boolean,
  editRef: React.RefObject<HTMLDivElement | null>,
  onTextChange: (id: string, text: string) => void,
  onTextEditEnd: (id: string) => void
): React.ReactNode {
  switch (object.type) {
    case "text": {
      const lineCount = Math.max(1, object.text.split("\n").length);
      const typography = textPreviewStyle(
        object.fontSize,
        object.fontFamily,
        object.bold,
        object.italic,
        scale,
        {
          ascentRatio: object.ascentRatio,
          descentRatio: object.descentRatio,
          lineCount,
          boxHeightPx: box.height,
        }
      );
      const base: React.CSSProperties = {
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
        color: object.color,
        textDecoration:
          [object.underline ? "underline" : "", object.strike ? "line-through" : ""]
            .filter(Boolean)
            .join(" ") || "none",
        textAlign: object.align,
        whiteSpace: "pre-wrap",
        overflow: "hidden",
        wordBreak: "break-word",
        background: "transparent",
        fontSynthesis: "none",
      };
      if (editing) {
        return (
          <div
            ref={editRef}
            contentEditable
            suppressContentEditableWarning
            style={{ ...base, outline: "none", cursor: "text", caretColor: object.color }}
            onInput={(e) => onTextChange(object.id, e.currentTarget.innerText)}
            onBlur={() => onTextEditEnd(object.id)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        );
      }
      return (
        <div style={base} aria-hidden>
          {object.text}
        </div>
      );
    }

    case "whiteout":
      return <div style={{ width: "100%", height: "100%", background: object.color }} />;

    case "highlight":
      return (
        <div style={{ width: "100%", height: "100%", background: object.color, opacity: 0.4 }} />
      );

    case "underline":
      return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: Math.max(1.5, 2 * scale),
              background: object.color,
            }}
          />
        </div>
      );

    case "strikethrough":
      return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              height: Math.max(1.5, 2 * scale),
              transform: "translateY(-50%)",
              background: object.color,
            }}
          />
        </div>
      );

    case "shape": {
      if (object.shape === "line") {
        const x1 = object.antiDiagonal ? 0 : 0;
        const y1 = object.antiDiagonal ? "100%" : 0;
        const x2 = "100%";
        const y2 = object.antiDiagonal ? 0 : "100%";
        return (
          <svg width="100%" height="100%" style={{ overflow: "visible" }}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={object.stroke}
              strokeWidth={Math.max(1, object.strokeWidth * scale)}
              strokeLinecap="round"
            />
          </svg>
        );
      }
      const shapeStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
        border: `${Math.max(1, object.strokeWidth * scale)}px solid ${object.stroke}`,
        background: object.fill ?? "transparent",
        borderRadius: object.shape === "ellipse" ? "50%" : 0,
        boxSizing: "border-box",
      };
      return <div style={shapeStyle} />;
    }

    case "brush":
      return (
        <svg width="100%" height="100%" style={{ overflow: "visible" }}>
          <polyline
            points={brushPoints ?? ""}
            fill="none"
            stroke={object.color}
            strokeWidth={Math.max(1, object.strokeWidth * scale)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={object.dataUrl}
          alt="inserted"
          style={{ width: "100%", height: "100%", objectFit: "fill" }}
          draggable={false}
        />
      );
  }
}
