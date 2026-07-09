import Stripe from "stripe";

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return stripe;
}

/** Mark user paid from a completed Stripe Checkout session (idempotent). */
export async function fulfillCheckoutSession(
  checkoutSession: Stripe.Checkout.Session
): Promise<boolean> {
  const userId = checkoutSession.metadata?.userId;
  if (!userId || !checkoutSession.id) return false;
  if (checkoutSession.payment_status !== "paid") return false;

  const { markUserPaid } = await import("@/lib/usage");
  await markUserPaid(userId, checkoutSession.id, {
    paymentIntentId:
      typeof checkoutSession.payment_intent === "string"
        ? checkoutSession.payment_intent
        : checkoutSession.payment_intent?.id,
    customerId:
      typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : checkoutSession.customer?.id,
  });
  return true;
}
