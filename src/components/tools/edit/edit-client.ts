"use client";

import type { PdfEditDocument, PdfEditPatch, PdfEditTextBlock } from "@/lib/pdf/edit-model";
import { parsePdfEditDocument } from "@/lib/pdf/edit-model";
import { downloadJobResult, pollJob } from "@/lib/jobs/client-jobs";
import { hitTestBlockAtPdfPoint, interactionBounds } from "./block-bounds";

export async function submitEditExtract(
  file: File,
  onStatus?: (status: string) => void
): Promise<PdfEditDocument> {
  onStatus?.("Analyzing text…");
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/edit/extract", { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.reason ?? data.error ?? `Extract request failed (${res.status})`
    );
  }

  return parsePdfEditDocument(data.document);
}

export async function submitEditApply(
  file: File,
  patch: PdfEditPatch,
  onStatus?: (status: string) => void
): Promise<Blob> {
  onStatus?.("Uploading…");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("patch", JSON.stringify(patch));
  const res = await fetch("/api/edit/apply", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.reason ?? data.error ?? "Apply failed");
  }

  onStatus?.("Applying edits on server…");
  await pollJob(data.jobId, onStatus);
  onStatus?.("Downloading…");
  return downloadJobResult(data.jobId);
}

export function allBlocks(document: PdfEditDocument): PdfEditTextBlock[] {
  return document.pages.flatMap((p) => p.blocks);
}

export function findBlockAtPdfPoint(
  document: PdfEditDocument,
  pageNum: number,
  pdfX: number,
  pdfY: number,
  isContentEdited?: (id: string) => boolean
): PdfEditTextBlock | null {
  const page = document.pages.find((p) => p.number === pageNum);
  if (!page) return null;

  let best: PdfEditTextBlock | null = null;
  let bestArea = Infinity;

  for (const block of page.blocks) {
    const contentEdited = isContentEdited?.(block.id) ?? false;
    if (!hitTestBlockAtPdfPoint(block, pdfX, pdfY, contentEdited)) continue;
    const b = interactionBounds(block, contentEdited);
    const area = b.pw * b.ph;
    if (area < bestArea) {
      best = block;
      bestArea = area;
    }
  }
  return best;
}
