import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { users, payments } from "@/db/schema";
import {
  AI_CREDITS_MONTHLY_LIMIT,
  FREE_DOCUMENT_LIMIT,
  LIFETIME_PRICE_EUR,
  SERVER_JOBS_DAILY_LIMIT,
} from "@/lib/constants";

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

async function resetServerJobsIfNeeded(
  userId: string,
  user: { serverJobsToday: number; serverJobsResetAt: Date | null }
): Promise<number> {
  const now = new Date();
  if (user.serverJobsResetAt && isSameCalendarDay(user.serverJobsResetAt, now)) {
    return user.serverJobsToday;
  }

  const database = requireDb();
  await database
    .update(users)
    .set({
      serverJobsToday: 0,
      serverJobsResetAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  return 0;
}

export interface UsageCheck {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  requiresPayment?: boolean;
}

export async function getUserByEmail(email: string) {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user;
}

export async function checkUsage(userId: string): Promise<UsageCheck> {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { allowed: false, reason: "User not found" };
  }

  if (user.paid) {
    return { allowed: true, remaining: Infinity };
  }

  const remaining = FREE_DOCUMENT_LIMIT - user.documentsProcessed;
  if (remaining <= 0) {
    return {
      allowed: false,
      reason: "Free limit reached",
      requiresPayment: true,
      remaining: 0,
    };
  }

  return { allowed: true, remaining };
}

export async function incrementUsage(
  userId: string,
  tool: string,
  fileName?: string
) {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  if (!user.paid) {
    await database
      .update(users)
      .set({
        documentsProcessed: user.documentsProcessed + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  const { usageEvents } = await import("@/db/schema");
  await database.insert(usageEvents).values({
    userId,
    tool,
    fileName: fileName ?? null,
  });
}

export async function checkServerJobLimit(userId: string): Promise<UsageCheck> {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { allowed: false, reason: "User not found" };
  if (!user.paid) {
    return { allowed: false, reason: "Payment required", requiresPayment: true };
  }

  const jobsToday = await resetServerJobsIfNeeded(userId, user);
  const remaining = SERVER_JOBS_DAILY_LIMIT - jobsToday;
  if (remaining <= 0) {
    return {
      allowed: false,
      reason: "Daily server job limit reached",
      remaining: 0,
    };
  }

  return { allowed: true, remaining };
}

/** PDF edit extract/apply — any signed-in user (not paywalled). */
export async function checkPdfEditJobAccess(userId: string): Promise<UsageCheck> {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { allowed: false, reason: "User not found" };
  return { allowed: true };
}

export async function incrementServerJobs(userId: string) {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  const jobsToday = await resetServerJobsIfNeeded(userId, user);
  const now = new Date();

  await database
    .update(users)
    .set({
      serverJobsToday: jobsToday + 1,
      serverJobsResetAt: user.serverJobsResetAt ?? now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
}

export async function checkAiCredits(userId: string): Promise<UsageCheck> {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { allowed: false, reason: "User not found" };
  if (!user.paid) {
    return { allowed: false, reason: "Payment required", requiresPayment: true };
  }

  const now = new Date();
  let creditsUsed = user.aiCreditsUsed;

  if (
    !user.aiCreditsResetAt ||
    now.getTime() - user.aiCreditsResetAt.getTime() > 30 * 24 * 60 * 60 * 1000
  ) {
    creditsUsed = 0;
    await database
      .update(users)
      .set({ aiCreditsUsed: 0, aiCreditsResetAt: now })
      .where(eq(users.id, userId));
  }

  const remaining = AI_CREDITS_MONTHLY_LIMIT - creditsUsed;
  if (remaining <= 0) {
    return { allowed: false, reason: "Monthly AI credit limit reached", remaining: 0 };
  }

  return { allowed: true, remaining };
}

export async function incrementAiCredits(userId: string) {
  const database = requireDb();
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  await database
    .update(users)
    .set({
      aiCreditsUsed: user.aiCreditsUsed + 1,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function markUserPaid(
  userId: string,
  stripeSessionId: string,
  opts: { paymentIntentId?: string; customerId?: string } = {}
) {
  const database = requireDb();

  const [existingPayment] = await database
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.stripeSessionId, stripeSessionId))
    .limit(1);

  if (existingPayment) return;

  await database
    .update(users)
    .set({
      paid: true,
      ...(opts.customerId ? { stripeCustomerId: opts.customerId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await database.insert(payments).values({
    userId,
    stripeSessionId,
    stripePaymentIntentId: opts.paymentIntentId ?? null,
    amount: LIFETIME_PRICE_EUR * 100,
    currency: "eur",
    status: "completed",
  });
}
