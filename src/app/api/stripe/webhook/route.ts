import { NextResponse } from "next/server";
import { fulfillCheckoutSession, requireStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = requireStripe();
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const checkoutSession = event.data.object;
    await fulfillCheckoutSession(checkoutSession);
  }

  return NextResponse.json({ received: true });
}
