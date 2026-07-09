"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { Button } from "@/components/ui/button";
import {
  FORM_FIELD_TYPES,
  baseName,
  canvasRectToPdf,
  createFormFieldId,
  createFormPdf,
  defaultFieldSize,
  downloadPdf,
  fieldTypeColor,
  initPdfJs,
  parseOptionsInput,
  type FormField,
  type FormFieldType,
} from "@/lib/pdf";

const SCALE = 1.5;

type EditorMode = "add" | "select";

interface PlacedField extends FormField {
  id: string;
  canvasX: number;
  canvasY: number;
  canvasWidth: number;
  canvasHeight: number;
}

function fieldLabel(field: PlacedField): string {
  if (field.type === "button") return field.buttonLabel || field.name;
  if (field.type === "radio") return `${field.name}: ${field.radioOption || "?"}`;
  return field.name;
}

function typeNeedsOptions(type: FormFieldType): boolean {
  return type === "dropdown" || type === "option-list";
}

export function FormTool() {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<PageViewport | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [mode, setMode] = useState<EditorMode>("add");
  const [fieldType, setFieldType] = useState<FormFieldType>("text");
  const [fieldName, setFieldName] = useState("email");
  const [optionsInput, setOptionsInput] = useState("Option A\nOption B\nOption C");
  const [buttonLabel, setButtonLabel] = useState("Submit");
  const [radioOption, setRadioOption] = useState("Yes");
  const [defaultValue, setDefaultValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moving, setMoving] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const selectedTypeMeta = FORM_FIELD_TYPES.find((t) => t.id === fieldType);

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

    for (const field of fields.filter((f) => f.page === pageNum)) {
      const selected = field.id === selectedId;
      const color = fieldTypeColor(field.type);
      ctx.strokeStyle = selected ? "#2563eb" : color;
      ctx.lineWidth = 2;
      if (selected) ctx.setLineDash([6, 4]);
      ctx.strokeRect(field.canvasX, field.canvasY, field.canvasWidth, field.canvasHeight);
      ctx.setLineDash([]);
      ctx.fillStyle = selected ? "rgba(37, 99, 235, 0.15)" : `${color}14`;
      ctx.fillRect(field.canvasX, field.canvasY, field.canvasWidth, field.canvasHeight);
      ctx.fillStyle = "#1e293b";
      ctx.font = "11px sans-serif";
      const label = fieldLabel(field);
      ctx.fillText(label, field.canvasX + 4, field.canvasY - 4);
      ctx.fillStyle = color;
      ctx.font = "10px sans-serif";
      ctx.fillText(field.type, field.canvasX + 4, field.canvasY + field.canvasHeight + 12);
    }
  }, [fields, pageNum, loading, selectedId]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const toPdfCoords = (canvasX: number, canvasY: number, w: number, h: number) => {
    const viewport = viewportRef.current!;
    return canvasRectToPdf(
      (px, py) => viewport.convertToPdfPoint(px, py) as [number, number],
      canvasX,
      canvasY,
      w,
      h
    );
  };

  const repositionField = (field: PlacedField, canvasX: number, canvasY: number): PlacedField => {
    const pdf = toPdfCoords(canvasX, canvasY, field.canvasWidth, field.canvasHeight);
    return {
      ...field,
      canvasX,
      canvasY,
      x: pdf.pdfX,
      y: pdf.pdfY,
      width: pdf.pdfWidth,
      height: pdf.pdfHeight,
    };
  };

  const validateAdd = (): string | null => {
    const name = fieldName.trim();
    if (!name) return "Enter a field name";

    if (fieldType === "radio") {
      if (!radioOption.trim()) return "Enter a radio option label";
      return null;
    }

    if (fieldType === "button") {
      if (!buttonLabel.trim()) return "Enter button label text";
    }

    if (typeNeedsOptions(fieldType)) {
      const options = parseOptionsInput(optionsInput);
      if (options.length === 0) return "Add at least one option (one per line)";
    }

    if (fields.some((f) => f.type !== "radio" && f.name === name)) {
      return `Field name "${name}" is already used — choose a unique name`;
    }

    return null;
  };

  const addFieldAt = (x: number, y: number) => {
    const err = validateAdd();
    if (err) {
      setAddError(err);
      return;
    }
    setAddError(null);

    const { w, h } = defaultFieldSize(fieldType);
    const canvasX = x - w / 2;
    const canvasY = y - h / 2;
    const pdf = toPdfCoords(canvasX, canvasY, w, h);
    const name = fieldName.trim();
    const options = typeNeedsOptions(fieldType) ? parseOptionsInput(optionsInput) : undefined;

    const base: PlacedField = {
      id: createFormFieldId(),
      type: fieldType,
      name,
      page: pageNum,
      canvasX,
      canvasY,
      canvasWidth: w,
      canvasHeight: h,
      x: pdf.pdfX,
      y: pdf.pdfY,
      width: pdf.pdfWidth,
      height: pdf.pdfHeight,
      options,
      buttonLabel: fieldType === "button" ? buttonLabel.trim() : undefined,
      radioOption: fieldType === "radio" ? radioOption.trim() : undefined,
      defaultValue: defaultValue.trim() || undefined,
    };

    setFields((prev) => [...prev, base]);

    if (fieldType === "radio") {
      setRadioOption("");
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);

    if (mode === "select") {
      const hit = hitTest(pageNum, x, y, fields);
      if (hit) {
        setSelectedId(hit.id);
        setMoving({
          id: hit.id,
          startMouseX: x,
          startMouseY: y,
          origX: hit.canvasX,
          origY: hit.canvasY,
        });
      } else {
        setSelectedId(null);
      }
      return;
    }

    addFieldAt(x, y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== "select" || !moving) return;
    const { x, y } = getCanvasCoords(e);
    const dx = x - moving.startMouseX;
    const dy = y - moving.startMouseY;

    setFields((prev) =>
      prev.map((field) => {
        if (field.id !== moving.id) return field;
        return repositionField(field, moving.origX + dx, moving.origY + dy);
      })
    );
  };

  const overlayCursor =
    mode === "select" ? (moving ? "grabbing" : "default") : "crosshair";

  return (
    <ToolWorkspace
      toolId="form-pdf"
      onFilesChange={(files) => {
        setResult(null);
        setFields([]);
        setSelectedId(null);
        setAddError(null);
        setFile(files[0] ?? null);
        setPageNum(1);
      }}
      onProcess={async (files) => {
        if (fields.length === 0) throw new Error("Add at least one form field");
        setResult(null);
        const data = await createFormPdf(files[0], fields);
        downloadPdf(data, `${baseName(files[0].name)}_form.pdf`);
        setResult(`Created ${fields.length} form field${fields.length !== 1 ? "s" : ""}`);
      }}
      processLabel="Create form PDF"
      disabled={!file || fields.length === 0}
    >
      {file && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "add" ? "default" : "outline"}
              onClick={() => {
                setMode("add");
                setSelectedId(null);
              }}
            >
              Add field
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "select" ? "default" : "outline"}
              onClick={() => setMode("select")}
            >
              Select / Move
            </Button>
          </div>

          {mode === "select" ? (
            <p className="text-sm text-muted">
              Click a field to select it, then drag to reposition.
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="font-medium">Field type</span>
                <select
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                  value={fieldType}
                  onChange={(e) => {
                    setFieldType(e.target.value as FormFieldType);
                    setAddError(null);
                  }}
                >
                  {FORM_FIELD_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {selectedTypeMeta && (
                  <span className="mt-1 block text-muted">{selectedTypeMeta.description}</span>
                )}
              </label>

              <label className="block text-sm">
                <span className="font-medium">
                  {fieldType === "radio" ? "Group name" : "Field name"}
                </span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
                  value={fieldName}
                  onChange={(e) => {
                    setFieldName(e.target.value);
                    setAddError(null);
                  }}
                  placeholder={fieldType === "radio" ? "payment_method" : "email"}
                />
              </label>

              {fieldType === "button" && (
                <label className="block text-sm">
                  <span className="font-medium">Button label</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                    value={buttonLabel}
                    onChange={(e) => setButtonLabel(e.target.value)}
                    placeholder="Submit"
                  />
                </label>
              )}

              {fieldType === "radio" && (
                <label className="block text-sm">
                  <span className="font-medium">Option label</span>
                  <span className="ml-1 text-muted">
                    (use the same group name for each radio in a set)
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                    value={radioOption}
                    onChange={(e) => setRadioOption(e.target.value)}
                    placeholder="Credit card"
                  />
                </label>
              )}

              {typeNeedsOptions(fieldType) && (
                <label className="block text-sm">
                  <span className="font-medium">Options</span>
                  <span className="ml-1 text-muted">(one per line)</span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
                    rows={4}
                    value={optionsInput}
                    onChange={(e) => setOptionsInput(e.target.value)}
                  />
                </label>
              )}

              {(fieldType === "text" ||
                fieldType === "textarea" ||
                fieldType === "password" ||
                fieldType === "dropdown" ||
                fieldType === "option-list") && (
                <label className="block text-sm">
                  <span className="font-medium">Default value</span>
                  <span className="ml-1 text-muted">(optional)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                    value={defaultValue}
                    onChange={(e) => setDefaultValue(e.target.value)}
                    placeholder={
                      typeNeedsOptions(fieldType) ? "Must match an option" : "Prefilled text"
                    }
                  />
                </label>
              )}

              {addError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{addError}</p>
              )}

              <p className="text-sm text-muted">Click on the PDF to place this field.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pageNum <= 1}
              onClick={() => {
                setPageNum((p) => p - 1);
                setSelectedId(null);
              }}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {pageNum} / {totalPages}
              {loading && " · loading…"}
              {selectedId ? " · 1 selected" : ""}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pageNum >= totalPages}
              onClick={() => {
                setPageNum((p) => p + 1);
                setSelectedId(null);
              }}
            >
              Next
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setFields((prev) => prev.filter((f) => f.page !== pageNum));
                setSelectedId(null);
              }}
            >
              Clear page fields
            </Button>
          </div>

          <div className="relative inline-block max-w-full overflow-auto rounded-lg border border-border bg-slate-100">
            <canvas ref={pdfCanvasRef} className="block max-w-full" />
            <canvas
              ref={overlayRef}
              className="absolute left-0 top-0 max-w-full"
              style={{ cursor: overlayCursor }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={() => setMoving(null)}
              onMouseLeave={() => setMoving(null)}
            />
          </div>

          {fields.length > 0 && (
            <ul className="space-y-1 text-sm">
              {fields.map((f) => (
                <li
                  key={f.id}
                  className={`flex items-center justify-between gap-2 rounded border px-3 py-1.5 ${
                    f.id === selectedId ? "border-primary bg-blue-50" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setMode("select");
                      setSelectedId(f.id);
                      setPageNum(f.page);
                    }}
                  >
                    <span className="font-medium">{FORM_FIELD_TYPES.find((t) => t.id === f.type)?.label ?? f.type}</span>
                    {" · "}
                    <span className="font-mono">{fieldLabel(f)}</span>
                    {" · page "}
                    {f.page}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-muted hover:text-red-600"
                    onClick={() => {
                      setFields((prev) => prev.filter((x) => x.id !== f.id));
                      if (selectedId === f.id) setSelectedId(null);
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}

function hitTest(
  page: number,
  x: number,
  y: number,
  fields: PlacedField[]
): PlacedField | null {
  const onPage = fields.filter((f) => f.page === page);
  for (let i = onPage.length - 1; i >= 0; i--) {
    const f = onPage[i];
    if (
      x >= f.canvasX &&
      x <= f.canvasX + f.canvasWidth &&
      y >= f.canvasY &&
      y <= f.canvasY + f.canvasHeight
    ) {
      return f;
    }
  }
  return null;
}
