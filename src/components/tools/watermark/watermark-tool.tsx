"use client";

import { useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  addWatermark,
  baseName,
  downloadPdf,
  formatResultSummary,
  type WatermarkPosition,
} from "@/lib/pdf";

export function WatermarkTool() {
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(30);
  const [fontSize, setFontSize] = useState(48);
  const [rotation, setRotation] = useState(45);
  const [position, setPosition] = useState<WatermarkPosition>("diagonal");
  const [inputSize, setInputSize] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  return (
    <ToolWorkspace
      toolId="watermark-pdf"
      onFilesChange={(files) => {
        setResult(null);
        setInputSize(files[0]?.size ?? 0);
      }}
      onProcess={async (files) => {
        setResult(null);
        const data = await addWatermark(files[0], {
          text,
          opacity,
          fontSize,
          rotation,
          position,
        });
        downloadPdf(data, `${baseName(files[0].name)}_watermarked.pdf`);
        setResult(formatResultSummary({ inputSize: files[0].size, outputSize: data.length }));
      }}
      processLabel="Add watermark"
      disabled={!text.trim()}
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Watermark text</span>
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="CONFIDENTIAL"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Position</span>
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={position}
            onChange={(e) => setPosition(e.target.value as WatermarkPosition)}
          >
            <option value="diagonal">Diagonal (center)</option>
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Opacity: {opacity}%</span>
          <input
            type="range"
            min={5}
            max={80}
            value={opacity}
            onChange={(e) => setOpacity(parseInt(e.target.value, 10))}
            className="mt-2 w-full"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">Font size: {fontSize}pt</span>
          <input
            type="range"
            min={24}
            max={96}
            step={4}
            value={fontSize}
            onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
            className="mt-2 w-full"
          />
        </label>

        {position === "center" && (
          <label className="block text-sm">
            <span className="font-medium">Rotation: {rotation}°</span>
            <input
              type="range"
              min={-90}
              max={90}
              step={5}
              value={rotation}
              onChange={(e) => setRotation(parseInt(e.target.value, 10))}
              className="mt-2 w-full"
            />
          </label>
        )}

        {inputSize > 0 && (
          <p className="text-sm text-muted">Applied to all pages · input {(inputSize / 1024 / 1024).toFixed(2)} MB</p>
        )}
        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
