import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireDb } from "@/db";
import { jobs } from "@/db/schema";
import { downloadTempFile } from "@/lib/storage";
import { JOB_OUTPUT_EXT, JOB_OUTPUT_MIME } from "@/lib/jobs/client-jobs";

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

  if (job.status !== "completed" || !job.outputKey) {
    return NextResponse.json({ error: "Job output not ready" }, { status: 409 });
  }

  try {
    const data = await downloadTempFile(job.outputKey);
    const mime = JOB_OUTPUT_MIME[job.type] ?? "application/octet-stream";
    const ext = JOB_OUTPUT_EXT[job.type] ?? "bin";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="job-${jobId}.${ext}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Output file expired or missing" }, { status: 410 });
  }
}
