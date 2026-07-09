import { Queue } from "bullmq";

export const JOB_QUEUE_NAME = "pdfflow-jobs";

export function getRedisConnectionOptions() {
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  return { url, maxRetriesPerRequest: null as null };
}

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(JOB_QUEUE_NAME, { connection: getRedisConnectionOptions() });
  }
  return queue;
}

export async function enqueueJob(jobId: string): Promise<void> {
  await getQueue().add(
    "process",
    { jobId },
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }
  );
}
