import JSZip from "jszip";
import { downloadBlob } from "@/lib/utils";

export function downloadPdf(data: Uint8Array, filename: string) {
  downloadBlob(new Blob([new Uint8Array(data)], { type: "application/pdf" }), filename);
}

export function downloadImages(blobs: Blob[], baseName: string, ext: string) {
  blobs.forEach((blob, i) => {
    downloadBlob(blob, `${baseName}_page_${i + 1}.${ext}`);
  });
}

export async function downloadPdfsAsZip(
  files: { name: string; data: Uint8Array }[],
  zipName = "pdfflow-output.zip"
) {
  if (files.length === 1) {
    downloadPdf(files[0].data, files[0].name);
    return;
  }

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.data);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

export async function downloadImagesAsZip(blobs: Blob[], zipName = "images.zip") {
  if (blobs.length === 1) {
    downloadBlob(blobs[0], "image.png");
    return;
  }
  const zip = new JSZip();
  blobs.forEach((blob, i) => {
    zip.file(`image_${i + 1}.png`, blob);
  });
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipName);
}

export interface ProcessResult {
  outputSize: number;
  inputSize: number;
  pageCount?: number;
  fileCount?: number;
}

export function formatResultSummary(result: ProcessResult): string {
  const saved =
    result.inputSize > result.outputSize
      ? `${Math.round((1 - result.outputSize / result.inputSize) * 100)}% smaller`
      : `${Math.round((result.outputSize / result.inputSize - 1) * 100)}% larger`;
  const parts = [`Output: ${formatBytes(result.outputSize)} (${saved})`];
  if (result.pageCount) parts.push(`${result.pageCount} pages`);
  if (result.fileCount && result.fileCount > 1) parts.push(`${result.fileCount} files`);
  return parts.join(" · ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
