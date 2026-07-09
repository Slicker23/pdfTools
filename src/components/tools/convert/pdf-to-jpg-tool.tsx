"use client";

import { useCallback, useState } from "react";
import JSZip from "jszip";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { PageRangeInput, ResultBanner } from "@/components/tools/shared/tool-ui";
import { downloadBlob } from "@/lib/utils";
import { getPdfPageCount, pdfToJpg, pdfToPng } from "@/lib/pdf";

export function PdfToJpgTool() {
  const [format, setFormat] = useState<"jpg" | "png">("jpg");
  const [scale, setScale] = useState(2);
  const [pages, setPages] = useState("");
  const [totalPages, setTotalPages] = useState<number | undefined>();
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    if (files.length === 0) {
      setTotalPages(undefined);
      return;
    }
    try {
      const count = await getPdfPageCount(files[0]);
      setTotalPages(count);
    } catch {
      setTotalPages(undefined);
    }
  }, []);

  return (
    <ToolWorkspace
      toolId="pdf-to-jpg"
      onFilesChange={handleFilesChange}
      onProcess={async (files) => {
        setResult(null);
        const pageList = pages.trim()
          ? pages.split(",").map((p) => parseInt(p.trim(), 10)).filter((n) => !isNaN(n))
          : undefined;

        const { blobs, names } =
          format === "jpg"
            ? await pdfToJpg(files[0], { scale, pages: pageList })
            : await pdfToPng(files[0], scale);

        if (blobs.length === 1) {
          downloadBlob(blobs[0], names[0]);
        } else {
          const zip = new JSZip();
          blobs.forEach((blob, i) => zip.file(names[i], blob));
          const zipBlob = await zip.generateAsync({ type: "blob" });
          downloadBlob(zipBlob, `${files[0].name.replace(/\.pdf$/i, "")}_images.zip`);
        }

        setResult(`Converted ${blobs.length} page${blobs.length !== 1 ? "s" : ""} to ${format.toUpperCase()}`);
      }}
      processLabel={`Convert to ${format.toUpperCase()}`}
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Output format</span>
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={format}
            onChange={(e) => setFormat(e.target.value as "jpg" | "png")}
          >
            <option value="jpg">JPG (smaller)</option>
            <option value="png">PNG (lossless)</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Resolution scale: {scale}x</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.5}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="mt-1 w-full"
          />
        </label>

        <PageRangeInput
          value={pages}
          onChange={setPages}
          totalPages={totalPages}
          label="Pages (optional — leave empty for all)"
          hint="e.g. 1, 3, 5 or leave blank"
        />

        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
