import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { jobs } from "@/db/schema";
import { checkServerJobLimit, incrementServerJobs } from "@/lib/usage";
import { createJob, processJob } from "@/lib/jobs/processor";
import { enqueueJob } from "@/lib/jobs/queue";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const check = await checkServerJobLimit(session.user.id);
  if (!check.allowed) {
    return NextResponse.json(check, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = formData.get("type") as string;
  const metadata = formData.get("metadata") as string | null;

  if (!file || !type) {
    return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
  }

  if (metadata) {
    try {
      JSON.parse(metadata);
    } catch {
      return NextResponse.json({ error: "Invalid metadata JSON" }, { status: 400 });
    }
  }

  const jobId = await createJob(session.user.id, type, file, metadata ?? undefined);
  await incrementServerJobs(session.user.id);

  try {
    await enqueueJob(jobId);
  } catch (err) {
    console.error("Queue unavailable, processing inline:", err);
    processJob(jobId).catch(console.error);
  }

  return NextResponse.json({ jobId, status: "pending" });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("id");
  if (!jobId) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const database = requireDb();
  const [job] = await database
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
