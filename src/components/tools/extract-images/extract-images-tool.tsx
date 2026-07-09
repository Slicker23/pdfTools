"use client";

import { useCallback, useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import {
  baseName,
  downloadImagesAsZip,
  extractImagesFromPdf,
  type ExtractedImage,
} from "@/lib/pdf";

export function ExtractImagesTool() {
  const [images, setImages] = useState<ExtractedImage[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleFilesChange = useCallback(async (files: File[]) => {
    setResult(null);
    setImages(null);
    if (files.length === 0) return;

    setScanning(true);
    try {
      const found = await extractImagesFromPdf(files[0]);
      setImages(found);
    } catch {
      setImages([]);
    } finally {
      setScanning(false);
    }
  }, []);

  return (
    <ToolWorkspace
      toolId="extract-images"
      onProcess={async (files) => {
        setResult(null);
        const found = images ?? (await extractImagesFromPdf(files[0]));
        await downloadImagesAsZip(
          found.map((img) => img.blob),
          `${baseName(files[0].name)}_images.zip`
        );
        setResult(`Downloaded ${found.length} image${found.length !== 1 ? "s" : ""} as ZIP`);
      }}
      processLabel="Extract images"
      disabled={images !== null && images.length === 0}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Extracts embedded images from the PDF. Scanned pages (full-page renders) are not included.
        </p>

        {scanning && <p className="text-sm text-muted">Scanning for images…</p>}

        {images && images.length > 0 && (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-sm">
            {images.map((img, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>Image {i + 1}</span>
                <span className="text-muted">
                  page {img.page} · {img.width}×{img.height}
                </span>
              </li>
            ))}
          </ul>
        )}

        {images && images.length === 0 && (
          <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
            No embedded images found in this PDF.
          </p>
        )}

        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
