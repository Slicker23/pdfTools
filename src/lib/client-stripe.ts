"use client";

import { useLocale } from "next-intl";

export async function startStripeCheckout(locale: string): Promise<{ url?: string; error?: string }> {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });

  let data: { url?: string; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    return { error: "Could not start checkout. Try again." };
  }

  if (!res.ok) {
    return { error: data.error ?? "Checkout failed" };
  }

  if (!data.url) {
    return { error: "No checkout URL returned" };
  }

  return { url: data.url };
}

export function useStripeCheckout() {
  const locale = useLocale();

  return async (): Promise<{ ok: boolean; error?: string }> => {
    const { url, error } = await startStripeCheckout(locale);
    if (error) return { ok: false, error };
    if (url) window.location.href = url;
    return { ok: true };
  };
}

/** After Stripe redirect — confirm payment and refresh session. */
export async function verifyStripePayment(
  sessionId: string
): Promise<{ paid: boolean; error?: string }> {
  const res = await fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`);
  const data = await res.json();
  if (!res.ok) {
    return { paid: false, error: data.error ?? "Payment verification failed" };
  }
  return { paid: Boolean(data.paid) };
}
