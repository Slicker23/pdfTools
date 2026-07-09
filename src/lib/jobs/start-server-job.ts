import { createJob, processJob } from "@/lib/jobs/processor";
import { enqueueJob } from "@/lib/jobs/queue";
import { incrementServerJobs } from "@/lib/usage";

export async function startServerJob(
  userId: string,
  file: File,
  type: "pdf_edit_extract" | "pdf_edit_apply",
  metadata?: string
): Promise<string> {
  const jobId = await createJob(userId, type, file, metadata);
  await incrementServerJobs(userId);

  try {
    await enqueueJob(jobId);
  } catch (err) {
    console.error("Queue unavailable, processing inline:", err);
    await processJob(jobId);
  }

  return jobId;
}
