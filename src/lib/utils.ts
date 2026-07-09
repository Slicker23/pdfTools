import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Sanitize a filename for use in the download attribute. */
export function safeDownloadName(filename: string): string {
  return filename.replace(/[/\\?%*:|"<>]/g, "_");
}

/**
 * Trigger a browser download from a Blob.
 * Creates the object URL at click time and does not revoke it immediately —
 * revoking too early causes "Check internet connection" failures in Chrome/Firefox.
 */
export function downloadBlob(blob: Blob, filename: string) {
  if (blob.size === 0) {
    throw new Error(`Cannot download empty file "${filename}"`);
  }

  const safeName = safeDownloadName(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  // Remove the anchor after a tick; keep the blob URL alive for the download.
  window.setTimeout(() => {
    a.remove();
  }, 1000);
}

export interface DownloadLink {
  filename: string;
  label: string;
  mime: string;
  blob: Blob;
  size: number;
}

export function createDownloadLink(
  parts: BlobPart[],
  filename: string,
  label: string,
  mime: string
): DownloadLink {
  const blob = new Blob(parts, { type: mime });
  if (blob.size === 0) {
    throw new Error(`Generated file "${filename}" is empty`);
  }
  return {
    filename: safeDownloadName(filename),
    label,
    mime,
    blob,
    size: blob.size,
  };
}

export async function saveBlobAs(blob: Blob, filename: string): Promise<void> {
  downloadBlob(blob, filename);
}
