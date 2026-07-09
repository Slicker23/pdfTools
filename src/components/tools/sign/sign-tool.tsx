"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { Button } from "@/components/ui/button";
import {
  addSignature,
  baseName,
  canvasRectToPdf,
  downloadPdf,
  initPdfJs,
} from "@/lib/pdf";

const SCALE = 1.5;
const SIG_W = 200;
const SIG_H = 60;

export function SignTool() {
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const drawingRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [placement, setPlacement] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const renderPage = useCallback(async (pdfFile: File, page: number) => {
    setLoading(true);
    try {
      const pdfjs = await initPdfJs();
      const pdf = await pdfjs.getDocument({ data: await pdfFile.arrayBuffer() }).promise;
      setTotalPages(pdf.numPages);
      const pdfPage: PDFPageProxy = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: SCALE, rotation: pdfPage.rotate });
      viewportRef.current = viewport;

      const canvas = pdfCanvasRef.current;
      const overlay = overlayRef.current;
      if (!canvas || !overlay) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      overlay.width = viewport.width;
      overlay.height = viewport.height;

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (file) renderPage(file, pageNum);
  }, [file, pageNum, renderPage]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (placement && signature) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(placement.x, placement.y, SIG_W, SIG_H);
      ctx.setLineDash([]);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, placement.x, placement.y, SIG_W, SIG_H);
      img.src = signature;
    }
  }, [placement, signature, pageNum, loading]);

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setSignature(null);
    setPlacement(null);
  };

  useEffect(() => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startSigDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    drawingRef.current = true;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(x, y);

    const draw = (ev: MouseEvent) => {
      if (!drawingRef.current) return;
      const mx = ((ev.clientX - rect.left) / rect.width) * canvas.width;
      const my = ((ev.clientY - rect.top) / rect.height) * canvas.height;
      ctx.lineTo(mx, my);
      ctx.stroke();
    };
    const stop = () => {
      drawingRef.current = false;
      setSignature(canvas.toDataURL("image/png"));
      window.removeEventListener("mousemove", draw);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stop);
  };

  const handlePlaceClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!signature) return;
    const canvas = overlayRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    setPlacement({ x: x - SIG_W / 2, y: y - SIG_H / 2 });
  };

  return (
    <ToolWorkspace
      toolId="sign-pdf"
      onFilesChange={(files) => {
        setResult(null);
        setPlacement(null);
        setFile(files[0] ?? null);
        setPageNum(1);
      }}
      onProcess={async (files) => {
        if (!signature) throw new Error("Draw your signature first");
        if (!placement) throw new Error("Click on the PDF to place your signature");
        const viewport = viewportRef.current;
        if (!viewport) throw new Error("PDF preview not ready — wait for the page to load");

        setResult(null);

        const pdfCoords = canvasRectToPdf(
          (px, py) => viewport.convertToPdfPoint(px, py) as [number, number],
          placement.x,
          placement.y,
          SIG_W,
          SIG_H
        );

        const data = await addSignature(files[0], signature, {
          page: pageNum,
          ...pdfCoords,
        });

        downloadPdf(data, `${baseName(files[0].name)}_signed.pdf`);
        setResult("Signature applied");
      }}
      processLabel="Sign PDF"
      disabled={!file || !signature || !placement}
    >
      {file && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">1. Draw signature</p>
            <canvas
              ref={sigCanvasRef}
              width={320}
              height={100}
              className="cursor-crosshair rounded-lg border border-border bg-white"
              onMouseDown={startSigDraw}
            />
            <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={clearSignature}>
              Clear signature
            </Button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              2. Place on PDF {signature ? "(click on page)" : "(draw signature first)"}
            </p>
            <div className="mb-2 flex items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pageNum <= 1}
                onClick={() => {
                  setPageNum((p) => p - 1);
                  setPlacement(null);
                }}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {pageNum} / {totalPages}
                {loading && " · loading…"}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pageNum >= totalPages}
                onClick={() => {
                  setPageNum((p) => p + 1);
                  setPlacement(null);
                }}
              >
                Next
              </Button>
            </div>
            <div className="relative inline-block max-w-full overflow-auto rounded-lg border border-border bg-slate-100">
              <canvas ref={pdfCanvasRef} className="block max-w-full" />
              <canvas
                ref={overlayRef}
                className="absolute left-0 top-0 max-w-full"
                style={{ cursor: signature ? "crosshair" : "default" }}
                onClick={handlePlaceClick}
              />
            </div>
          </div>
        </div>
      )}
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}
