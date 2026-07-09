import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { checkAiCredits, incrementAiCredits } from "@/lib/usage";
import { detectAndRedactPii } from "@/lib/pii";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const check = await checkAiCredits(session.user.id);
  if (!check.allowed) {
    return NextResponse.json(check, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const text = await file.text();
  const redacted = detectAndRedactPii(text);
  await incrementAiCredits(session.user.id);

  return NextResponse.json({ text: redacted.text, redactions: redacted.redactions, originalLength: text.length });
}
