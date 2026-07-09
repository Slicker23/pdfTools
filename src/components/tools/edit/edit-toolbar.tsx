"use client";

import {
  MousePointer2,
  Type,
  Highlighter,
  ImagePlus,
  Underline,
  Strikethrough,
  Paintbrush,
  Square,
  Circle,
  Minus,
  Eraser,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FONT_FAMILIES, type FontFamily, type TextAlign } from "@/lib/pdf";

export type EditToolMode =
  | "select"
  | "text"
  | "highlight"
  | "underline"
  | "strikethrough"
  | "brush"
  | "rect"
  | "ellipse"
  | "line"
  | "image"
  | "eraser";

const PRIMARY_TOOLS: { id: EditToolMode; label: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Edit text", icon: MousePointer2 },
  { id: "text", label: "Add text", icon: Type },
  { id: "highlight", label: "Highlight", icon: Highlighter },
  { id: "image", label: "Image", icon: ImagePlus },
];

const MORE_TOOLS: { id: EditToolMode; label: string; icon: typeof Underline }[] = [
  { id: "underline", label: "Underline", icon: Underline },
  { id: "strikethrough", label: "Strikethrough", icon: Strikethrough },
  { id: "brush", label: "Draw", icon: Paintbrush },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "line", label: "Line", icon: Minus },
  { id: "eraser", label: "Eraser", icon: Eraser },
];

const COLORS = ["#111111", "#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#ffff00", "#ffffff"];
const FONT_SIZES = [8, 10, 12, 14, 16, 18, 24, 32, 48];

interface EditSideToolbarProps {
  tool: EditToolMode;
  showMore: boolean;
  onToggleMore: () => void;
  onSelectTool: (tool: EditToolMode) => void;
}

export function EditSideToolbar({ tool, showMore, onToggleMore, onSelectTool }: EditSideToolbarProps) {
  const moreActive = MORE_TOOLS.some((t) => t.id === tool);

  return (
    <>
      {PRIMARY_TOOLS.map(({ id, label, icon: Icon }) => (
        <ToolIconButton
          key={id}
          active={tool === id}
          label={label}
          onClick={() => onSelectTool(id)}
        >
          <Icon className="h-5 w-5" />
        </ToolIconButton>
      ))}
      <ToolIconButton
        active={showMore || moreActive}
        label="More tools"
        onClick={onToggleMore}
      >
        <MoreHorizontal className="h-5 w-5" />
      </ToolIconButton>
      {showMore &&
        MORE_TOOLS.map(({ id, label, icon: Icon }) => (
          <ToolIconButton
            key={id}
            active={tool === id}
            label={label}
            onClick={() => onSelectTool(id)}
            nested
          >
            <Icon className="h-4 w-4" />
          </ToolIconButton>
        ))}
    </>
  );
}

function ToolIconButton({
  active,
  label,
  onClick,
  nested,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  nested?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-lg transition-colors",
        nested ? "h-9 w-9" : "h-10 w-10",
        active
          ? "bg-[#2563eb] text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      {children}
    </button>
  );
}

interface EditFormatBarProps {
  color: string;
  fontFamily: FontFamily;
  fontSize: number;
  align: TextAlign;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  showStroke?: boolean;
  strokeWidth?: number;
  fillEnabled?: boolean;
  showFill?: boolean;
  compact?: boolean;
  onColorChange: (color: string) => void;
  onFontFamilyChange?: (family: FontFamily) => void;
  onFontSizeChange?: (size: number) => void;
  onAlignChange?: (align: TextAlign) => void;
  onBoldToggle?: () => void;
  onItalicToggle?: () => void;
  onUnderlineToggle?: () => void;
  onStrokeWidthChange?: (width: number) => void;
  onFillToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}

export function EditFormatBar({
  color,
  fontFamily,
  fontSize,
  align,
  bold,
  italic,
  underline,
  showStroke,
  strokeWidth,
  fillEnabled,
  showFill,
  compact,
  onColorChange,
  onFontFamilyChange,
  onFontSizeChange,
  onAlignChange,
  onBoldToggle,
  onItalicToggle,
  onUnderlineToggle,
  onStrokeWidthChange,
  onFillToggle,
  onDelete,
}: EditFormatBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white",
        compact ? "gap-1.5 px-2 py-1.5 shadow-none" : "gap-2 rounded-xl px-3 py-2 shadow-lg"
      )}
    >
      <div className="flex items-center gap-0.5">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={cn(
              "rounded-full border border-slate-200",
              compact ? "h-4 w-4" : "h-5 w-5"
            )}
            style={{
              backgroundColor: c,
              outline: color === c ? "2px solid #2563eb" : "none",
              outlineOffset: 1,
            }}
            onClick={() => onColorChange(c)}
            aria-label={`Color ${c}`}
          />
        ))}
      </div>

      {onFontFamilyChange && onFontSizeChange && onAlignChange && (
        <>
          <select
            className={cn(
              "rounded-md border border-border py-0.5",
              compact ? "max-w-[5.5rem] px-1 text-xs" : "px-2 py-1 text-sm"
            )}
            value={fontFamily}
            onChange={(e) => onFontFamilyChange(e.target.value as FontFamily)}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={4}
            max={200}
            step={0.5}
            className={cn(
              "rounded-md border border-border py-0.5",
              compact ? "w-14 px-1 text-xs" : "w-16 px-2 py-1 text-sm"
            )}
            value={fontSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0) onFontSizeChange(n);
            }}
            aria-label="Font size"
          />
          <div className="flex gap-0.5">
            <Button
              type="button"
              size="sm"
              variant={bold ? "default" : "outline"}
              className={cn("px-0", compact ? "h-7 w-7" : "h-8 w-8")}
              onClick={onBoldToggle}
            >
              <span className="font-bold text-xs">B</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={italic ? "default" : "outline"}
              className={cn("px-0", compact ? "h-7 w-7" : "h-8 w-8")}
              onClick={onItalicToggle}
            >
              <span className="italic text-xs">I</span>
            </Button>
            {!compact && (
              <Button
                type="button"
                size="sm"
                variant={underline ? "default" : "outline"}
                className="h-8 w-8 px-0"
                onClick={onUnderlineToggle}
              >
                <span className="underline">U</span>
              </Button>
            )}
          </div>
          {!compact && (
            <select
              className="rounded-md border border-border px-2 py-1 text-sm"
              value={align}
              onChange={(e) => onAlignChange(e.target.value as TextAlign)}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          )}
        </>
      )}

      {showStroke && onStrokeWidthChange && (
        <label className="flex items-center gap-2 text-sm text-muted">
          Width
          <input
            type="range"
            min={1}
            max={12}
            value={strokeWidth ?? 2}
            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          />
          {strokeWidth}
        </label>
      )}

      {showFill && onFillToggle && (
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={fillEnabled}
            onChange={(e) => onFillToggle(e.target.checked)}
          />
          Fill
        </label>
      )}

      {onDelete && (
        <Button type="button" size="sm" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

const MARKUP_COLORS = ["#FFFF00", "#FF9999", "#2563eb", "#e11d48", "#16a34a", "#111111"];

interface MarkupToolOptionsProps {
  tool: EditToolMode;
  color: string;
  strokeWidth: number;
  shapeFill: boolean;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onShapeFillToggle: (enabled: boolean) => void;
}

export function MarkupToolOptions({
  tool,
  color,
  strokeWidth,
  shapeFill,
  onColorChange,
  onStrokeWidthChange,
  onShapeFillToggle,
}: MarkupToolOptionsProps) {
  const showStroke =
    tool === "brush" || tool === "rect" || tool === "ellipse" || tool === "line";
  const showFill = tool === "rect" || tool === "ellipse";

  if (
    tool === "select" ||
    tool === "text" ||
    tool === "image" ||
    tool === "eraser"
  ) {
    return null;
  }

  return (
    <div className="mt-2 flex w-10 flex-col items-center gap-2 rounded-lg border border-border bg-white p-1.5 shadow-sm">
      {MARKUP_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="h-4 w-4 rounded-full border border-slate-200"
          style={{
            backgroundColor: c,
            outline: color === c ? "2px solid #2563eb" : "none",
            outlineOffset: 1,
          }}
          onClick={() => onColorChange(c)}
          aria-label={`Markup color ${c}`}
        />
      ))}
      {showStroke && (
        <input
          type="range"
          min={1}
          max={12}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="h-16 w-full [writing-mode:vertical-lr] [direction:rtl]"
          title="Stroke width"
          aria-label="Stroke width"
        />
      )}
      {showFill && (
        <label className="flex cursor-pointer flex-col items-center gap-0.5 text-[9px] text-muted">
          <input
            type="checkbox"
            checked={shapeFill}
            onChange={(e) => onShapeFillToggle(e.target.checked)}
            className="h-3 w-3"
          />
          Fill
        </label>
      )}
    </div>
  );
}

export { COLORS as EDIT_COLORS, FONT_SIZES as EDIT_FONT_SIZES, MARKUP_COLORS };
