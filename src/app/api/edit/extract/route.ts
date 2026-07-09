import { NextResponse } from "next/server";
import { pdfEngineExtract } from "@/lib/pdf-engine/run";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Extract a PDF into the editable document model. This runs the from-scratch
 * engine in-process and requires no sign-in: editing/previewing is free, and
 * only the download (apply) is gated behind auth for plan tracking.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 50 MB)." },
        { status: 413 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const document = await pdfEngineExtract(bytes);
    return NextResponse.json({ document });
  } catch (error) {
    console.error("[edit/extract]", error);
    const message = error instanceof Error ? error.message : "Extract failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
