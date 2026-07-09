import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, LOCALES, LIFETIME_PRICE_EUR, type Locale } from "@/lib/constants";
import { fulfillCheckoutSession, isStripeConfigured, requireStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured. Set STRIPE_SECRET_KEY in .env.local." },
      { status: 503 }
    );
  }

  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (session.user.paid) {
    return NextResponse.json(
      { error: "You already have lifetime access." },
      { status: 400 }
    );
  }

  let locale: Locale = DEFAULT_LOCALE;
  try {
    const body = await request.json();
    if (body.locale && LOCALES.includes(body.locale as Locale)) {
      locale = body.locale as Locale;
    }
  } catch {
    // no body — use default locale
  }

  const stripe = requireStripe();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: session.user.email,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: "PdfFlow Lifetime Access",
            description: "Unlimited PDF tools forever. No subscription.",
          },
          unit_amount: LIFETIME_PRICE_EUR * 100,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
    },
    success_url: `${baseUrl}/${locale}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/${locale}/pricing?payment=cancelled`,
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Could not create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
