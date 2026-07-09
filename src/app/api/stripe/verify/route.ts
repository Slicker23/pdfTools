import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { fulfillCheckoutSession, isStripeConfigured, requireStripe } from "@/lib/stripe";

/** Confirm payment after redirect — works even when webhooks are not forwarded (local dev). */
export async function GET(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const stripe = requireStripe();
  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

  if (checkoutSession.metadata?.userId !== session.user.id) {
    return NextResponse.json({ error: "Session does not belong to this user" }, { status: 403 });
  }

  const fulfilled = await fulfillCheckoutSession(checkoutSession);

  return NextResponse.json({
    paid: fulfilled || session.user.paid,
    paymentStatus: checkoutSession.payment_status,
  });
}
