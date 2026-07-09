import { NextResponse } from "next/server";

/** @deprecated Use POST /api/jobs for async server conversions. */
export async function POST() {
  return NextResponse.json(
    {
      error: "Sync conversion removed",
      hint: "Use POST /api/jobs with type pdf_to_word, pdf_to_excel, pdf_to_ppt, or word_to_pdf.",
    },
    { status: 410 }
  );
}
