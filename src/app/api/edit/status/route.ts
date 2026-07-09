import { NextResponse } from "next/server";
import {
  PDF_ENGINE_SETUP_HINT,
  pdfEngineConfigured,
} from "@/lib/pdf-engine/run";

export async function GET() {
  const configured = await pdfEngineConfigured();
  return NextResponse.json({
    configured,
    hint: configured ? undefined : PDF_ENGINE_SETUP_HINT,
  });
}
