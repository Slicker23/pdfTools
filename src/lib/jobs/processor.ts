import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { jobs } from "@/db/schema";
import { uploadTempFile, downloadTempFile, deleteTempFile } from "@/lib/storage";
import { handleLibreOfficeJob } from "@/lib/jobs/handlers/libreoffice";
import { handlePdfToWordJob } from "@/lib/jobs/handlers/pdf-to-word";
import { handleOcrJob } from "@/lib/jobs/handlers/ocr";
import { handleBatchJob } from "@/lib/jobs/handlers/batch";
import { handleRedactionJob } from "@/lib/jobs/handlers/redaction";
import {
  handlePdfEditApplyJob,
  handlePdfEditExtractJob,
  type PdfEditApplyMetadata,
} from "@/lib/jobs/handlers/pdf-edit";
import { isLibreOfficeJob } from "@/lib/jobs/libreoffice";
import { randomUUID } from "crypto";

export async function createJob(
  userId: string,
  type: string,
  file: File,
  metadata?: string
): Promise<string> {
  const database = requireDb();
  const jobId = randomUUID();
  const inputKey = `jobs/${userId}/${jobId}/input`;

  await uploadTempFile(inputKey, Buffer.from(await file.arrayBuffer()));

  await database.insert(jobs).values({
    id: jobId,
    userId,
    type: type as typeof jobs.$inferInsert.type,
    status: "pending",
    inputKey,
    metadata: metadata ?? null,
  });

  return jobId;
}

export async function processJob(jobId: string) {
  const database = requireDb();
  const [job] = await database
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!job || !job.inputKey) return;

  await database
    .update(jobs)
    .set({ status: "processing" })
    .where(eq(jobs.id, jobId));

  try {
    const input = await downloadTempFile(job.inputKey);
    const outputKey = job.inputKey.replace("/input", "/output");
    const meta = job.metadata ? JSON.parse(job.metadata) : {};

    const output = await runConversion(input, job.type, meta);
    await uploadTempFile(outputKey, output);

    await database
      .update(jobs)
      .set({
        status: "completed",
        outputKey,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  } catch (error) {
    await database
      .update(jobs)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  } finally {
    if (job.inputKey) {
      await deleteTempFile(job.inputKey).catch(() => {});
    }
  }
}

async function runConversion(
  input: Buffer,
  type: string,
  metadata: Record<string, unknown>
): Promise<Buffer> {
  if (type === "pdf_to_word") {
    return handlePdfToWordJob(input);
  }

  if (isLibreOfficeJob(type)) {
    return handleLibreOfficeJob(input, type);
  }

  switch (type) {
    case "ocr":
      return handleOcrJob(input, metadata);
    case "batch":
      return handleBatchJob(input, metadata);
    case "redaction":
      return handleRedactionJob(input, metadata);
    case "pdf_edit_extract":
      return handlePdfEditExtractJob(input);
    case "pdf_edit_apply":
      return handlePdfEditApplyJob(input, metadata as unknown as PdfEditApplyMetadata);
    default:
      throw new Error(`Unsupported job type: ${type}`);
  }
}
