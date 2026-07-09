import "dotenv/config";
import { config } from "dotenv";
import path from "path";
import { Worker } from "bullmq";
import { JOB_QUEUE_NAME, getRedisConnectionOptions } from "@/lib/jobs/queue";
import { processJob } from "@/lib/jobs/processor";

config({ path: path.resolve(process.cwd(), ".env.local") });

const worker = new Worker(
  JOB_QUEUE_NAME,
  async (job) => {
    const { jobId } = job.data as { jobId: string };
    if (!jobId) throw new Error("Missing jobId in queue payload");
    await processJob(jobId);
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 2,
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

async function shutdown() {
  console.log("[worker] Shutting down…");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[worker] PdfFlow worker listening on queue:", JOB_QUEUE_NAME);
