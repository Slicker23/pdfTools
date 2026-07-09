import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { cloudTokens } from "@/db/schema";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider") ?? "google";

  const database = requireDb();
  const [token] = await database
    .select()
    .from(cloudTokens)
    .where(eq(cloudTokens.userId, session.user.id))
    .limit(1);

  return NextResponse.json({
    connected: !!token,
    provider,
    authUrl: `/api/cloud/${provider}/auth`,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { provider, accessToken, refreshToken } = await request.json();
  const database = requireDb();

  await database.insert(cloudTokens).values({
    userId: session.user.id,
    provider,
    accessToken,
    refreshToken,
  });

  return NextResponse.json({ connected: true });
}
