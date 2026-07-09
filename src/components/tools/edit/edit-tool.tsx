"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadPdf } from "@/components/tools/tool-workspace";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { UsageGate, UsageBanner } from "@/components/tools/paywall";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { EditEditorShell } from "./edit-editor-shell";
import {
  EditFormatBar,
  EditSideToolbar,
  MarkupToolOptions,
  EDIT_COLORS,
  MARKUP_COLORS,
  type EditToolMode,
} from "./edit-toolbar";
import { initPdfJs, parseFontTraits, toUserMessage, applyEdits, createObjectId, type FontFamily } from "@/lib/pdf";
import { pdfJsDocumentInit } from "@/lib/pdf/pdfjs-load-options";
import { findBlockAtPdfPoint, submitEditApply, submitEditExtract } from "./edit-client";
import { applyTextPatchInBrowser } from "@/lib/pdf-engine/browser/apply-client";
import { usePdfDocument } from "./use-pdf-document";
import { useEditor } from "./use-editor";
import { BlocksPanel } from "./blocks-panel";
import { BlockHighlightLayer } from "./block-highlight-layer";
import { useBlockPlans } from "./use-block-plans";
import { useEnginePreview } from "./use-engine-preview";
import { useEngineWorker } from "@/lib/pdf-engine/browser/client";
import { MarkupLayer, isMarkupTool } from "./markup-layer";
import type { PdfEditTextBlock } from "@/lib/pdf/edit-model";

function blockWithinPage(
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

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

/** pdf.js may transfer/detach the buffer passed to getDocument — always pass a copy. */
function pdfJsDataCopy(bytes: ArrayBuffer): Uint8Array {
  return new Uint8Array(bytes.slice(0));
}

export function EditTool() {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderGenRef = useRef(0);

  const editor = useEditor();
  const { data: session } = useSession();
  const isSignedIn = Boolean(session?.user?.id);

  const [file, setFile] = useState<File | null>(null);
  const [originalBytes, setOriginalBytes] = useState<ArrayBuffer | null>(null);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [resultVariant, setResultVariant] = useState<"success" | "error">("success");
  const [engineConfigured, setEngineConfigured] = useState<boolean | null>(null);
  const [engineWarning, setEngineWarning] = useState<string | null>(null);
  const [showAllPages, setShowAllPages] = useState(false);
  const [placingText, setPlacingText] = useState(false);
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const isDraggingBlockRef = useRef(false);
  const suppressNextCanvasClickRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageAnchorRef = useRef<{ px: number; py: number } | null>(null);

  const [toolMode, setToolMode] = useState<EditToolMode>("select");
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [markupColor, setMarkupColor] = useState(MARKUP_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [shapeFill, setShapeFill] = useState(false);

  const [color, setColor] = useState(EDIT_COLORS[0]);
  const [fontFamily, setFontFamily] = useState<FontFamily>("Helvetica");
  const [fontSize, setFontSize] = useState(14);

  const renderPage = useCallback(async (page: number, useScale: number) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return;
    const gen = ++renderGenRef.current;
    try {
      const pdfPage = await pdf.getPage(page);
      if (gen !== renderGenRef.current) return;
      const vp = pdfPage.getViewport({ scale: useScale, rotation: pdfPage.rotate });
      const canvas = pdfCanvasRef.current;
      if (!canvas) return;
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      await pdfPage.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      if (gen === renderGenRef.current) setViewport(vp);
    } catch {
      // Stale render cancelled by a newer generation.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadFile() {
      if (!file) return;
      setLoadingPdf(true);
      setPdfReady(false);
      try {
        const bytes = await file.arrayBuffer();
        if (cancelled) return;
        setOriginalBytes(bytes.slice(0));
        setPageNum(1);
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    }
    loadFile();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const engineWorker = useEngineWorker(originalBytes);
  const pdfDoc = usePdfDocument(engineWorker);
  const markupRevision = editor.objects.length;
  const { previewBytes, updating: previewUpdating, revision: previewRevision, isFresh, lastError, resetPreview, getDownloadBytes } =
    useEnginePreview({
      worker: engineWorker,
      sessionReady: pdfDoc.sessionReady,
      originalBytes,
      hasChanges: pdfDoc.hasChanges,
      editedCount: pdfDoc.editedCount,
      markupObjects: editor.objects,
      markupRevision,
      fileName: file?.name ?? "document.pdf",
      refreshToken: previewRefreshToken,
    });

  const displayBytes = previewBytes ?? originalBytes;

  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      if (!displayBytes) return;
      setLoadingPdf(true);
      setPdfReady(false);
      try {
        const pdfjs = await initPdfJs();
        const pdf = await pdfjs
          .getDocument(pdfJsDocumentInit(pdfJsDataCopy(displayBytes)))
          .promise;
        if (cancelled) return;
        await (pdfDocRef.current as { destroy?: () => Promise<void> } | null)?.destroy?.();
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setPdfReady(true);
      } catch (err) {
        console.error("[edit-tool] preview PDF load failed", err);
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    }
    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [displayBytes, previewRevision]);

  useEffect(() => {
    if (displayBytes && pdfDocRef.current && pdfReady && !loadingPdf) {
      renderPage(pageNum, scale);
    }
  }, [displayBytes, file, pageNum, scale, renderPage, pdfReady, loadingPdf]);

  useEffect(() => {
    pdfDoc.setActiveBlockId(null);
    setHoverBlockId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clear selection when page changes
  }, [pageNum]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/edit/status")
      .then((res) => res.json())
      .then((data: { configured?: boolean; hint?: string }) => {
        if (cancelled) return;
        const ok = Boolean(data.configured);
        setEngineConfigured(ok);
        setEngineWarning(
          ok
            ? null
            : `Server PDF engine not available. ${data.hint ?? "Run: npm install"}`
        );
      })
      .catch(() => {
        if (!cancelled) {
          setEngineConfigured(false);
          setEngineWarning("Server PDF engine status unknown. Text editing may be unavailable.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function extractDoc() {
      if (!file || !originalBytes || engineConfigured === false) return;
      if (engineConfigured === null) return;
      if (pdfDoc.document) return;
      setExtractingDoc(true);
      setStatusHint(null);
      try {
        const doc = await submitEditExtract(file, (s) => {
          if (!cancelled) setStatusHint(s);
        });
        if (!cancelled) {
          pdfDoc.setDocument(doc);
          setStatusHint(null);
        }
      } catch (err) {
        if (!cancelled) {
          setResult(err instanceof Error ? err.message : "Server extract failed.");
          setResultVariant("error");
          setStatusHint(null);
        }
      } finally {
        if (!cancelled) {
          setExtractingDoc(false);
          setStatusHint(null);
        }
      }
    }
    extractDoc();
    return () => {
      cancelled = true;
    };
  }, [file, originalBytes, engineConfigured, pdfDoc.document, pdfDoc]);

  const handleFilesChange = useCallback(
    (files: File[]) => {
      setResult(null);
      setResultVariant("success");
      setStatusHint(null);
      pdfDoc.reset();
      editor.reset();
      setToolMode("select");
      setShowMoreTools(false);
      setPlacingText(false);
      pdfDocRef.current = null;
      setPdfReady(false);
      setViewport(null);
      setOriginalBytes(null);
      resetPreview();
      setPreviewRefreshToken(0);
      setFile(files[0] ?? null);
    },
    [pdfDoc, editor, resetPreview]
  );

  const activeBlockId = pdfDoc.activeBlockId;
  const activeBlock = activeBlockId ? pdfDoc.getBlock(activeBlockId) : null;

  useEffect(() => {
    if (!activeBlockId) return;
    const block = pdfDoc.getBlock(activeBlockId);
    if (!block) return;
    const traits = parseFontTraits(block.font.name);
    setFontFamily(traits.family);
    setFontSize(block.font.size);
    setColor(block.font.color);
  }, [
    activeBlockId,
    activeBlock?.font.color,
    activeBlock?.font.size,
    activeBlock?.font.name,
    activeBlock?.font.bold,
    activeBlock?.font.italic,
  ]);

  const panelBlocks = useMemo(() => {
    if (!pdfDoc.document) return [];
    if (showAllPages) {
      return pdfDoc.document.pages.flatMap((p) =>
        p.blocks.filter((b) => blockWithinPage(b, p.width, p.height))
      );
    }
    const page = pdfDoc.document.pages.find((p) => p.number === pageNum);
    if (!page) return [];
    return page.blocks.filter((b) => blockWithinPage(b, page.width, page.height));
  }, [pdfDoc.document, pageNum, showAllPages]);

  const { getApplyPlan } = useBlockPlans(
    engineWorker,
    panelBlocks,
    pdfDoc.getOriginalSnapshot
  );

  const markupModeActive = isMarkupTool(toolMode);
  const textEditingEnabled = toolMode === "select" && !placingText;

  const downloadDisabled =
    !file ||
    loadingPdf ||
    extractingDoc ||
    !pdfDoc.sessionReady ||
    (!pdfDoc.hasChanges && editor.objects.length === 0);

  const handleDownload = async (files: File[]) => {
    setResult(null);
    setResultVariant("success");
    setDownloadError(null);
    const hasTextChanges = pdfDoc.hasChanges;
    const hasMarkup = editor.objects.length > 0;

    if (!hasTextChanges && !hasMarkup) {
      throw new Error("No changes to apply.");
    }

    let data: Uint8Array;
    if (previewBytes && isFresh && !lastError) {
      data = pdfJsDataCopy(previewBytes);
    } else {
      try {
        data = await getDownloadBytes();
      } catch (err) {
        console.error("[handleDownload] worker preview failed", err);
        const patch = pdfDoc.buildPatch();
        if (hasTextChanges && patch && originalBytes) {
          try {
            data = await applyTextPatchInBrowser(new Uint8Array(originalBytes), patch);
            if (hasMarkup) {
              data = await applyEdits(
                new File([new Uint8Array(data)], files[0].name, { type: "application/pdf" }),
                editor.objects
              );
            }
          } catch (clientErr) {
            console.error("[handleDownload] client apply failed", clientErr);
            const blob = await submitEditApply(files[0], patch, (s) => setStatusHint(s));
            data = new Uint8Array(await blob.arrayBuffer());
            if (hasMarkup) {
              data = await applyEdits(
                new File([new Uint8Array(data)], files[0].name, { type: "application/pdf" }),
                editor.objects
              );
            }
          }
        } else {
          throw err;
        }
      }
    }

    downloadPdf(data, files[0].name.replace(/\.pdf$/i, "_edited.pdf"));

    const parts: string[] = [];
    if (hasTextChanges) {
      const patch = pdfDoc.buildPatch();
      if (patch?.blocks.length) {
        parts.push(`${patch.blocks.length} text edit${patch.blocks.length !== 1 ? "s" : ""}`);
      }
    }
    if (hasMarkup) {
      parts.push(`${editor.objects.length} markup item${editor.objects.length !== 1 ? "s" : ""}`);
    }
    setResult(`Applied ${parts.join(" and ")}`);
    setStatusHint(null);
  };

  const updateBlockStyle = useCallback(
    (patch: Partial<{ color: string; size: number; bold: boolean; italic: boolean; fontName: string }>) => {
      if (!activeBlockId) return;
      pdfDoc.updateBlockStyle(activeBlockId, patch);
    },
    [activeBlockId, pdfDoc]
  );

  const handleSelectTool = useCallback((tool: EditToolMode) => {
    setToolMode(tool);
    if (tool === "text") {
      setPlacingText(true);
      editor.setSelectedId(null);
    } else {
      setPlacingText(false);
    }
    if (tool !== "select") {
      pdfDoc.setActiveBlockId(null);
    }
  }, [editor, pdfDoc]);

  const handleRequestImage = useCallback((px: number, py: number) => {
    imageAnchorRef.current = { px, py };
    imageInputRef.current?.click();
  }, []);

  const handleImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const imageFile = e.target.files?.[0];
      e.target.value = "";
      const anchor = imageAnchorRef.current;
      imageAnchorRef.current = null;
      if (!imageFile || !anchor) return;

      const bytes = new Uint8Array(await imageFile.arrayBuffer());
      const mime = imageFile.type === "image/jpeg" ? "jpeg" : "png";
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(imageFile);
      });

      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = dataUrl;
      });

      const pw = 120;
      const ph = dims.h > 0 ? (pw * dims.h) / dims.w : 80;
      editor.add({
        id: createObjectId(),
        page: pageNum,
        type: "image",
        px: anchor.px,
        py: anchor.py,
        pw,
        ph,
        bytes,
        mime,
        dataUrl,
      });
      pdfDoc.setActiveBlockId(null);
    },
    [editor, pageNum, pdfDoc]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (!editor.canUndo) return;
      e.preventDefault();
      editor.undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (markupModeActive) return;
      if (!placingText && !textEditingEnabled) return;
      if (isDraggingBlockRef.current || suppressNextCanvasClickRef.current) {
        suppressNextCanvasClickRef.current = false;
        return;
      }
      if (!viewport || !pdfDoc.document) return;
      const canvas = pdfCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const sy = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const [px, py] = viewport.convertToPdfPoint(sx, sy);

      if (placingText) {
        const size = fontSize;
        const page = pdfDoc.document?.pages.find((p) => p.number === pageNum);
        const margin = 12;
        const columnW = page
          ? Math.min(120, Math.max(48, page.width - px - margin))
          : 120;
        const id = `new:p${pageNum}:${crypto.randomUUID().slice(0, 8)}`;
        pdfDoc.addBlock({
          id,
          page: pageNum,
          text: "New text",
          created: true,
          modified: true,
          insertAt: { px, py },
          bbox: { px, py: py - size * 0.2, pw: columnW, ph: size * 1.2 },
          baselineY: py,
          lineCount: 1,
          font: {
            name: fontFamily,
            size,
            bold: false,
            italic: false,
            color,
          },
        });
        setPlacingText(false);
        setToolMode("select");
        return;
      }

      editor.setSelectedId(null);
      const hit = findBlockAtPdfPoint(
        pdfDoc.document,
        pageNum,
        px,
        py,
        pdfDoc.isBlockContentEdited
      );
      if (hit) {
        pdfDoc.setActiveBlockId(hit.id);
      } else {
        pdfDoc.setActiveBlockId(null);
      }
    },
    [textEditingEnabled, markupModeActive, placingText, viewport, pdfDoc, pageNum, fontSize, fontFamily, color, editor]
  );

  const selectedMarkup = editor.selected;
  const markupFormatBar =
    selectedMarkup && toolMode === "select" ? (
      <EditFormatBar
        color={
          selectedMarkup.type === "shape"
            ? selectedMarkup.stroke
            : selectedMarkup.type === "brush" ||
                selectedMarkup.type === "highlight" ||
                selectedMarkup.type === "underline" ||
                selectedMarkup.type === "strikethrough"
              ? selectedMarkup.color
              : selectedMarkup.type === "text"
                ? selectedMarkup.color
                : markupColor
        }
        fontFamily={fontFamily}
        fontSize={fontSize}
        align="left"
        showStroke={
          selectedMarkup.type === "brush" ||
          selectedMarkup.type === "shape"
        }
        strokeWidth={
          selectedMarkup.type === "brush" || selectedMarkup.type === "shape"
            ? selectedMarkup.strokeWidth
            : strokeWidth
        }
        compact
        onColorChange={(c) => {
          if (selectedMarkup.type === "shape") {
            editor.update(selectedMarkup.id, { stroke: c, fill: shapeFill ? c : undefined });
          } else if (
            selectedMarkup.type === "brush" ||
            selectedMarkup.type === "highlight" ||
            selectedMarkup.type === "underline" ||
            selectedMarkup.type === "strikethrough" ||
            selectedMarkup.type === "text"
          ) {
            editor.update(selectedMarkup.id, { color: c });
          }
        }}
        onStrokeWidthChange={(w) => {
          if (selectedMarkup.type === "brush" || selectedMarkup.type === "shape") {
            editor.update(selectedMarkup.id, { strokeWidth: w });
          }
        }}
        onDelete={() => editor.remove(selectedMarkup.id)}
      />
    ) : null;

  const formatBarProps = activeBlock
    ? {
        color,
        fontFamily,
        fontSize,
        bold: activeBlock.font.bold ?? false,
        italic: activeBlock.font.italic ?? false,
        onColorChange: (c: string) => {
          setColor(c);
          updateBlockStyle({ color: c });
        },
        onFontFamilyChange: (f: FontFamily) => {
          setFontFamily(f);
          updateBlockStyle({ fontName: f });
        },
        onFontSizeChange: (s: number) => {
          setFontSize(s);
          updateBlockStyle({ size: s });
        },
        onBoldToggle: () => updateBlockStyle({ bold: !activeBlock.font.bold }),
        onItalicToggle: () => updateBlockStyle({ italic: !activeBlock.font.italic }),
      }
    : null;

  const blocksPanel = pdfDoc.document ? (
    <BlocksPanel
      pageNum={pageNum}
      totalPages={totalPages}
      blocks={panelBlocks}
      activeBlock={activeBlock ?? undefined}
      activeBlockId={pdfDoc.activeBlockId}
      editedCount={pdfDoc.editedCount}
      getApplyPlan={getApplyPlan}
      getOriginalSnapshot={pdfDoc.getOriginalSnapshot}
      getOriginalText={pdfDoc.getOriginalText}
      isEdited={pdfDoc.isBlockEdited}
      showAllPages={showAllPages}
      onShowAllPagesChange={setShowAllPages}
      onDeselect={() => {
        pdfDoc.setActiveBlockId(null);
        editor.setSelectedId(null);
      }}
      onChangeText={(id, text) => pdfDoc.updateBlockText(id, text)}
      onDeleteBlock={(id) => {
        pdfDoc.removeBlock(id);
        if (pdfDoc.activeBlockId === id) pdfDoc.setActiveBlockId(null);
      }}
      onRestoreBlock={(id) => pdfDoc.resetBlock(id)}
      onToggleFlatten={(id, flatten) => pdfDoc.updateBlockFlattenToPath(id, flatten)}
      onResetAll={() => {
        pdfDoc.resetAll();
        pdfDoc.setActiveBlockId(null);
        resetPreview();
        setPreviewRefreshToken(0);
      }}
      onAddText={() => {
        setToolMode("text");
        setPlacingText(true);
      }}
      addTextHint={placingText ? "Click on the PDF to place new text" : null}
      formatBar={formatBarProps}
      markupInspector={
        markupFormatBar ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Selected markup</p>
            <p className="text-[10px] text-muted">Drag on the PDF to move or resize.</p>
            {markupFormatBar}
          </div>
        ) : null
      }
    />
  ) : undefined;

  const canvas = file ? (
    <div
      className="relative mx-auto shadow-lg"
      style={{ width: viewport?.width ?? 0, height: viewport?.height ?? 0 }}
    >
      <canvas
        ref={pdfCanvasRef}
        className={cn(
          "block bg-white",
          (placingText || markupModeActive) && "cursor-crosshair"
        )}
        onClick={handleCanvasClick}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleImageFile}
      />
      {viewport && pdfDoc.document && !loadingPdf && (
        <>
          <BlockHighlightLayer
            blocks={panelBlocks}
            viewport={viewport}
            activeBlockId={pdfDoc.activeBlockId}
            hoverBlockId={hoverBlockId}
            placingText={placingText}
            markupMode={markupModeActive}
            isContentEdited={pdfDoc.isBlockContentEdited}
            onHoverBlock={textEditingEnabled ? setHoverBlockId : () => {}}
            onSelectBlock={(id) => {
              editor.setSelectedId(null);
              pdfDoc.setActiveBlockId(id);
            }}
            onMoveBlock={(id, position) => pdfDoc.updateBlockPosition(id, position)}
            onDragStateChange={(dragging) => {
              if (dragging) {
                isDraggingBlockRef.current = true;
              } else if (isDraggingBlockRef.current) {
                isDraggingBlockRef.current = false;
                suppressNextCanvasClickRef.current = true;
                setPreviewRefreshToken((t) => t + 1);
              }
            }}
          />
          <MarkupLayer
            viewport={viewport}
            pageNum={pageNum}
            scale={scale}
            toolMode={toolMode}
            markupColor={markupColor}
            strokeWidth={strokeWidth}
            shapeFill={shapeFill}
            editor={editor}
            markupInteractive={Boolean(viewport)}
            onClearTextSelection={() => pdfDoc.setActiveBlockId(null)}
            onRequestImage={handleRequestImage}
          />
        </>
      )}
      {loadingPdf && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading PDF…
        </div>
      )}
      {extractingDoc && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Analyzing text…
        </div>
      )}
      {previewUpdating && !loadingPdf && !extractingDoc && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/50 text-sm text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Updating preview…
        </div>
      )}
      {lastError && !previewUpdating && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
          Preview: {lastError}
        </div>
      )}
    </div>
  ) : null;

  return (
    <UsageGate toolId="edit-pdf">
      {({ recordUsage }) => (
        <div className="space-y-4">
          <UsageBanner />

          {!file ? (
            <FileDropzone
              accept=".pdf"
              files={[]}
              onFilesChange={handleFilesChange}
              label="Drop your PDF here to edit text"
            />
          ) : (
            <EditEditorShell
              fileName={file.name}
              onChangeFile={() => handleFilesChange([])}
              onUndo={editor.undo}
              canUndo={editor.canUndo}
              leftToolbar={
                <>
                  <EditSideToolbar
                    tool={toolMode}
                    showMore={showMoreTools}
                    onToggleMore={() => setShowMoreTools((v) => !v)}
                    onSelectTool={handleSelectTool}
                  />
                  <MarkupToolOptions
                    tool={toolMode}
                    color={markupColor}
                    strokeWidth={strokeWidth}
                    shapeFill={shapeFill}
                    onColorChange={setMarkupColor}
                    onStrokeWidthChange={setStrokeWidth}
                    onShapeFillToggle={setShapeFill}
                  />
                </>
              }
              onDownload={async () => {
                if (!file) return;
                setDownloading(true);
                setDownloadError(null);
                try {
                  const usage = await recordUsage();
                  if (!usage.allowed) {
                    if (usage.requiresSignIn) {
                      const callbackUrl =
                        typeof window !== "undefined" ? window.location.pathname : "/";
                      signIn("google", { callbackUrl });
                      return;
                    }
                    setDownloadError(usage.reason ?? "Could not download.");
                    return;
                  }
                  await handleDownload([file]);
                } catch (e) {
                  setDownloadError(toUserMessage(e));
                } finally {
                  setDownloading(false);
                }
              }}
              downloading={downloading}
              downloadDisabled={downloadDisabled}
              downloadHint={downloadError}
              scale={scale}
              onZoomIn={() => setScale((s) => Math.min(MAX_SCALE, +(s + 0.2).toFixed(2)))}
              onZoomOut={() => setScale((s) => Math.max(MIN_SCALE, +(s - 0.2).toFixed(2)))}
              pageNum={pageNum}
              totalPages={totalPages}
              onPrevPage={() => setPageNum((p) => p - 1)}
              onNextPage={() => setPageNum((p) => p + 1)}
              rightPanel={blocksPanel}
              footer={
                engineWarning ? (
                  <ResultBanner message={engineWarning} variant="error" />
                ) : pdfDoc.document ? (
                  <p className="border-t border-border bg-white px-4 py-2 text-center text-xs text-muted">
                    {markupModeActive
                      ? `Draw on the PDF with ${toolMode} · switch to Select to edit text`
                      : placingText
                        ? "Click on the PDF to place new text"
                        : "Click text to edit · use toolbar for highlight, draw, shapes, and more"}
                    {!isSignedIn ? " · Sign in required to download" : ""}
                  </p>
                ) : statusHint ? (
                  <p className="border-t border-border bg-white px-4 py-2 text-center text-xs text-muted">
                    {statusHint}
                  </p>
                ) : null
              }
            >
              {canvas}
            </EditEditorShell>
          )}

          {result && <ResultBanner message={result} variant={resultVariant} />}
        </div>
      )}
    </UsageGate>
  );
}
