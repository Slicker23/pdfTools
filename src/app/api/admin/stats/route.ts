import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { payments, usageEvents, users } from "@/db/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email?.endsWith("@admin.pdfflow.app")) {
    // Simple admin gate; configure ADMIN_EMAILS in production
    const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").filter(Boolean);
    if (!adminEmails.includes(session?.user?.email ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const database = requireDb();

  const [stats] = await database
    .select({
      totalUsers: sql<number>`count(*)::int`,
      paidUsers: sql<number>`count(*) filter (where ${users.paid} = true)::int`,
    })
    .from(users);

  const recentPayments = await database
    .select()
    .from(payments)
    .orderBy(sql`${payments.createdAt} desc`)
    .limit(10);

  const recentUsage = await database
    .select()
    .from(usageEvents)
    .orderBy(sql`${usageEvents.createdAt} desc`)
    .limit(20);

  const conversionRate =
    stats.totalUsers > 0
      ? ((stats.paidUsers / stats.totalUsers) * 100).toFixed(1)
      : "0";

  return NextResponse.json({
    stats: { ...stats, conversionRate: `${conversionRate}%` },
    recentPayments,
    recentUsage,
  });
}
