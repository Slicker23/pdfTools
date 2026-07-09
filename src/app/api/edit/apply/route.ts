import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { checkPdfEditJobAccess } from "@/lib/usage";
import { startServerJob } from "@/lib/jobs/start-server-job";
import { parsePdfEditPatch } from "@/lib/pdf/edit-model";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const check = await checkPdfEditJobAccess(session.user.id);
    if (!check.allowed) {
      return NextResponse.json(check, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const patchRaw = formData.get("patch") as string | null;

    if (!file || !patchRaw) {
      return NextResponse.json({ error: "Missing file or patch" }, { status: 400 });
    }

    let patch;
    try {
      patch = parsePdfEditPatch(JSON.parse(patchRaw));
    } catch {
      return NextResponse.json({ error: "Invalid patch JSON" }, { status: 400 });
    }

    const jobId = await startServerJob(
      session.user.id,
      file,
      "pdf_edit_apply",
      JSON.stringify({ patch })
    );

    return NextResponse.json({ jobId, status: "pending" });
  } catch (error) {
    console.error("[edit/apply]", error);
    const message = error instanceof Error ? error.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
