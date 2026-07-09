import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { checkUsage, incrementUsage } from "@/lib/usage";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ allowed: false, reason: "Not authenticated" }, { status: 401 });
  }

  const { tool, fileName } = await request.json();
  const check = await checkUsage(session.user.id);

  if (!check.allowed) {
    return NextResponse.json(check, { status: 403 });
  }

  await incrementUsage(session.user.id, tool, fileName);
  return NextResponse.json({ allowed: true, remaining: check.remaining });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false });
  }

  const check = await checkUsage(session.user.id);
  return NextResponse.json({
    authenticated: true,
    paid: session.user.paid,
    documentsProcessed: session.user.documentsProcessed,
    ...check,
  });
}
