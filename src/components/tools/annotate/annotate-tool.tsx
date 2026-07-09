"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import { Undo2 } from "lucide-react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { Button } from "@/components/ui/button";
import {
  applyAnnotations,
  canvasRectToPdf,
  createAnnotationId,
  downloadPdf,
  initPdfJs,
  type Annotation,
  type AnnotationType,
} from "@/lib/pdf";

const TOOLS: { id: AnnotationType | "select"; label: string }[] = [
  { id: "select", label: "Select / Move" },
  { id: "highlight", label: "Highlight" },
  { id: "underline", label: "Underline" },
  { id: "strikethrough", label: "Strikethrough" },
  { id: "comment", label: "Comment" },
];

const COLORS = ["#FFFF00", "#FF9999", "#99FF99", "#9999FF"];
const SCALE = 1.5;
const MIN_HIT = 10;

type PreviewAnnotation = Omit<Annotation, "id">;

export function AnnotateTool() {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const renderGenRef = useRef(0);
  const dragSnapshotRef = useRef<Annotation[] | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tool, setTool] = useState<AnnotationType | "select">("highlight");
  const [color, setColor] = useState(COLORS[0]);
  const [commentText, setCommentText] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [previewRect, setPreviewRect] = useState<PreviewAnnotation | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renderVersion, setRenderVersion] = useState(0);

  const pushUndo = useCallback((snapshot: Annotation[]) => {
    setUndoStack((stack) => [...stack, snapshot]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setAnnotations(previous);
      setSelectedId(null);
      setPreviewRect(null);
      setDrawing(null);
      setMoving(null);
      dragSnapshotRef.current = null;
      return stack.slice(0, -1);
    });
  }, []);

  const commitAnnotations = useCallback(
    (updater: (prev: Annotation[]) => Annotation[]) => {
      setAnnotations((prev) => {
        pushUndo(prev);
        return updater(prev);
      });
    },
    [pushUndo]
  );

  const drawAnnotations = useCallback(
    (page: number, preview?: PreviewAnnotation | null, selected?: string | null) => {
      const canvas = overlayCanvasRef.current;
      const viewport = viewportRef.current;
      if (!canvas || !viewport) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const ann of annotations.filter((a) => a.page === page)) {
        drawAnnotation(ctx, ann, ann.id === selected);
      }
      if (preview && preview.page === page) {
        drawAnnotation(ctx, preview, false);
      }
    },
    [annotations]
  );

  const renderPdfPage = useCallback(async (pdfFile: File, page: number) => {
    const gen = ++renderGenRef.current;
    setLoading(true);

    try {
      const pdfjs = await initPdfJs();
      const bytes = await pdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;

      if (gen !== renderGenRef.current) return;

      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);

      const pdfPage: PDFPageProxy = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: SCALE, rotation: pdfPage.rotate });
      viewportRef.current = viewport;

      const pdfCanvas = pdfCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (!pdfCanvas || !overlayCanvas) return;

      pdfCanvas.width = viewport.width;
      pdfCanvas.height = viewport.height;
      overlayCanvas.width = viewport.width;
      overlayCanvas.height = viewport.height;

      const ctx = pdfCanvas.getContext("2d")!;
      ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);

      await pdfPage.render({ canvasContext: ctx, viewport, canvas: pdfCanvas }).promise;

      if (gen === renderGenRef.current) setRenderVersion((v) => v + 1);
    } finally {
      if (gen === renderGenRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (file) renderPdfPage(file, pageNum);
  }, [file, pageNum, renderPdfPage]);

  useEffect(() => {
    drawAnnotations(pageNum, previewRect, selectedId);
  }, [annotations, previewRect, pageNum, selectedId, drawAnnotations, renderVersion]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    setAnnotations([]);
    setUndoStack([]);
    setSelectedId(null);
    setPreviewRect(null);
    setMoving(null);
    dragSnapshotRef.current = null;
    pdfDocRef.current = null;
    viewportRef.current = null;
    if (files.length === 0) {
      setFile(null);
      return;
    }
    setFile(files[0]);
    setPageNum(1);
  }, []);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const buildAnnotation = (
    type: AnnotationType,
    x: number,
    y: number,
    width: number,
    height: number,
    text?: string
  ): Annotation => {
    const viewport = viewportRef.current!;
    const pdf = canvasRectToPdf(
      (px, py) => viewport.convertToPdfPoint(px, py) as [number, number],
      x,
      y,
      width,
      height
    );
    return {
      id: createAnnotationId(),
      type,
      page: pageNum,
      x,
      y,
      width,
      height,
      ...pdf,
      color,
      text,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);

    if (tool === "select") {
      const hit = hitTest(pageNum, x, y, annotations);
      if (hit) {
        dragSnapshotRef.current = annotations;
        setSelectedId(hit.id);
        setMoving({
          id: hit.id,
          startMouseX: x,
          startMouseY: y,
          origX: hit.x,
          origY: hit.y,
        });
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (tool === "comment") return;

    setDrawing({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    if (tool === "select" && moving) {
      const dx = x - moving.startMouseX;
      const dy = y - moving.startMouseY;
      const viewport = viewportRef.current;
      if (!viewport) return;

      setAnnotations((prev) =>
        prev.map((ann) => {
          if (ann.id !== moving.id) return ann;
          return repositionAnnotation(ann, moving.origX + dx, moving.origY + dy, viewport);
        })
      );
      return;
    }

    if (!drawing || tool === "select" || tool === "comment") return;

    const rx = Math.min(drawing.x, x);
    const ry = Math.min(drawing.y, y);
    const rw = Math.abs(x - drawing.x);
    const rh = Math.abs(y - drawing.y);
    setPreviewRect({
      type: tool,
      page: pageNum,
      x: rx,
      y: ry,
      width: rw,
      height: rh,
      pdfX: 0,
      pdfY: 0,
      pdfWidth: 0,
      pdfHeight: 0,
      color,
    });
  };

  const finishMove = () => {
    if (!moving || !dragSnapshotRef.current) {
      setMoving(null);
      dragSnapshotRef.current = null;
      return;
    }

    const snapshot = dragSnapshotRef.current;
    const moved = annotations.some((ann) => {
      const original = snapshot.find((o) => o.id === ann.id);
      return original && (original.x !== ann.x || original.y !== ann.y);
    });

    if (moved) {
      pushUndo(snapshot);
    }

    dragSnapshotRef.current = null;
    setMoving(null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "select") {
      finishMove();
      return;
    }

    if (!drawing || tool === "comment") return;

    const { x, y } = getCanvasCoords(e);
    const rw = Math.abs(x - drawing.x);
    const rh = Math.abs(y - drawing.y);
    if (rw < 4 && rh < 4) {
      setDrawing(null);
      setPreviewRect(null);
      return;
    }
    const ann = buildAnnotation(
      tool,
      Math.min(drawing.x, x),
      Math.min(drawing.y, y),
      rw,
      rh
    );
    commitAnnotations((prev) => [...prev, ann]);
    setDrawing(null);
    setPreviewRect(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "comment") return;
    const { x, y } = getCanvasCoords(e);
    const ann = buildAnnotation("comment", x, y, 150, 24, commentText || "Comment");
    commitAnnotations((prev) => [...prev, ann]);
  };

  const handleMouseLeave = () => {
    if (tool === "select") {
      finishMove();
      return;
    }
    if (drawing) {
      setDrawing(null);
      setPreviewRect(null);
    }
  };

  const overlayCursor =
    tool === "select" ? (moving ? "grabbing" : "default") : "crosshair";

  return (
    <ToolWorkspace
      toolId="annotate-pdf"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const data = await applyAnnotations(files[0], annotations);
        downloadPdf(data, files[0].name.replace(/\.pdf$/i, "_annotated.pdf"));
        setResult(`Applied ${annotations.length} annotation${annotations.length !== 1 ? "s" : ""}`);
      }}
      processLabel="Download annotated PDF"
      disabled={!file || annotations.length === 0}
    >
      {file && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {TOOLS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={tool === t.id ? "default" : "outline"}
                onClick={() => {
                  setTool(t.id);
                  if (t.id !== "select") setSelectedId(null);
                }}
              >
                {t.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={undoStack.length === 0}
              onClick={undo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="mr-1.5 h-4 w-4" />
              Undo
            </Button>
          </div>

          {tool === "select" && (
            <p className="text-sm text-muted">
              Click an annotation to select it, then drag to reposition. Use Undo or Ctrl+Z to revert
              changes.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="h-6 w-6 rounded-full border-2 border-border"
                style={{
                  backgroundColor: c,
                  outline: color === c ? "2px solid var(--color-primary)" : "none",
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          {tool === "comment" && (
            <input
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Comment text"
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pageNum <= 1}
              onClick={() => setPageNum((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {pageNum} / {totalPages}
              {loading && " · loading..."}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pageNum >= totalPages}
              onClick={() => setPageNum((p) => p + 1)}
            >
              Next
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                commitAnnotations((prev) => {
                  const next = prev.filter((a) => a.page !== pageNum);
                  setSelectedId((id) => (id && next.some((a) => a.id === id) ? id : null));
                  return next;
                });
              }}
            >
              Clear page
            </Button>
          </div>

          <div className="relative inline-block max-w-full overflow-auto rounded-lg border border-border bg-slate-100">
            <canvas ref={pdfCanvasRef} className="block max-w-full" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute left-0 top-0 max-w-full"
              style={{ cursor: overlayCursor }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onClick={handleCanvasClick}
            />
          </div>

          <p className="text-sm text-muted">
            {annotations.length} annotation{annotations.length !== 1 ? "s" : ""} total
            {selectedId ? " · 1 selected" : ""}
          </p>
        </div>
      )}
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}

function hitBounds(ann: Annotation) {
  if (ann.type === "underline") {
    const lineY = ann.y + ann.height;
    return {
      x: ann.x,
      y: lineY - MIN_HIT / 2,
      width: ann.width,
      height: MIN_HIT,
    };
  }
  if (ann.type === "strikethrough") {
    const lineY = ann.y + ann.height / 2;
    return {
      x: ann.x,
      y: lineY - MIN_HIT / 2,
      width: ann.width,
      height: MIN_HIT,
    };
  }
  return { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
}

function hitTest(page: number, x: number, y: number, annotations: Annotation[]): Annotation | null {
  const onPage = annotations.filter((a) => a.page === page);
  for (let i = onPage.length - 1; i >= 0; i--) {
    const ann = onPage[i];
    const b = hitBounds(ann);
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
      return ann;
    }
  }
  return null;
}

function repositionAnnotation(
  ann: Annotation,
  x: number,
  y: number,
  viewport: PageViewport
): Annotation {
  const pdf = canvasRectToPdf(
    (px, py) => viewport.convertToPdfPoint(px, py) as [number, number],
    x,
    y,
    ann.width,
    ann.height
  );
  return { ...ann, x, y, ...pdf };
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Pick<Annotation, "type" | "x" | "y" | "width" | "height" | "color" | "text">,
  selected: boolean
) {
  const color = ann.color ?? "#FFFF00";
  ctx.save();
  if (ann.type === "highlight") {
    ctx.fillStyle = color + "66";
    ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
  } else if (ann.type === "underline") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ann.x, ann.y + ann.height);
    ctx.lineTo(ann.x + ann.width, ann.y + ann.height);
    ctx.stroke();
  } else if (ann.type === "strikethrough") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ann.x, ann.y + ann.height / 2);
    ctx.lineTo(ann.x + ann.width, ann.y + ann.height / 2);
    ctx.stroke();
  } else if (ann.type === "comment" && ann.text) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
    ctx.strokeStyle = color;
    ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
    ctx.fillStyle = "#333";
    ctx.font = "12px sans-serif";
    ctx.fillText(ann.text, ann.x + 4, ann.y + 16);
  }

  if (selected) {
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const b = hitBounds(ann as Annotation);
    ctx.strokeRect(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
    ctx.setLineDash([]);
  }

  ctx.restore();
}
