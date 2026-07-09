import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const database = requireDb();
  const memberships = await database
    .select({
      teamId: teams.id,
      teamName: teams.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, session.user.id));

  return NextResponse.json({ teams: memberships });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { name } = await request.json();
  const database = requireDb();

  const [team] = await database
    .insert(teams)
    .values({ name, ownerId: session.user.id })
    .returning();

  await database.insert(teamMembers).values({
    teamId: team.id,
    userId: session.user.id,
    role: "owner",
  });

  return NextResponse.json({ team });
}
