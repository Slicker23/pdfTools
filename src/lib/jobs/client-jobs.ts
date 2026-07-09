export type ServerJobType =
  | "pdf_to_word"
  | "pdf_to_excel"
  | "pdf_to_ppt"
  | "word_to_pdf"
  | "ocr"
  | "batch"
  | "redaction"
  | "pdf_edit_extract"
  | "pdf_edit_apply";

export interface JobRecord {
  id: string;
  status: string;
  error?: string | null;
  type: string;
}

export async function submitJob(
  file: File,
  type: ServerJobType,
  metadata?: Record<string, unknown>
): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);
  if (metadata) {
    formData.append("metadata", JSON.stringify(metadata));
  }

  const res = await fetch("/api/jobs", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.reason ?? data.error ?? "Failed to start job");
  }
  return { jobId: data.jobId };
}

export async function pollJob(
  jobId: string,
  onStatus?: (status: string) => void,
  maxAttempts = 45,
  intervalMs = 2000
): Promise<JobRecord> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`/api/jobs?id=${jobId}`);
    const job = (await res.json()) as JobRecord;
    if (!res.ok) {
      throw new Error("Job not found");
    }

    onStatus?.(job.status);

    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(job.error ?? "Job failed");
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Job timed out — try again later");
}

export async function downloadJobResult(
  jobId: string,
  maxAttempts = 8,
  intervalMs = 400
): Promise<Blob> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`/api/jobs/download?id=${jobId}`);
    if (res.ok) return res.blob();

    const data = await res.json().catch(() => ({}));
    const retryable = res.status === 409 && attempt < maxAttempts - 1;
    if (retryable) {
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    throw new Error(data.error ?? `Download failed (${res.status})`);
  }
  throw new Error("Download failed");
}

export const JOB_OUTPUT_EXT: Record<string, string> = {
  pdf_to_word: "docx",
  pdf_to_excel: "xlsx",
  pdf_to_ppt: "pptx",
  word_to_pdf: "pdf",
  ocr: "pdf",
  batch: "zip",
  redaction: "pdf",
  pdf_edit_extract: "json",
  pdf_edit_apply: "pdf",
};

export const JOB_OUTPUT_MIME: Record<string, string> = {
  pdf_to_word: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf_to_excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf_to_ppt: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  word_to_pdf: "application/pdf",
  ocr: "application/pdf",
  batch: "application/zip",
  redaction: "application/pdf",
  pdf_edit_extract: "application/json",
  pdf_edit_apply: "application/pdf",
};

export async function downloadJobJson<T>(jobId: string): Promise<T> {
  const blob = await downloadJobResult(jobId);
  const text = await blob.text();
  return JSON.parse(text) as T;
}

export async function runServerJob(
  file: File,
  type: ServerJobType,
  metadata?: Record<string, unknown>,
  onStatus?: (status: string) => void
): Promise<Blob> {
  onStatus?.("Uploading…");
  const { jobId } = await submitJob(file, type, metadata);
  onStatus?.("Processing on server…");
  await pollJob(jobId, onStatus);
  onStatus?.("Downloading…");
  const blob = await downloadJobResult(jobId);
  const mime = JOB_OUTPUT_MIME[type] ?? "application/octet-stream";
  return new Blob([blob], { type: mime });
}
