"use client";

import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in";
import { Button } from "@/components/ui/button";
import { FREE_DOCUMENT_LIMIT, AI_CREDITS_MONTHLY_LIMIT } from "@/lib/constants";
import { useStripeCheckout, verifyStripePayment } from "@/lib/client-stripe";
import Image from "next/image";

export function DashboardContent() {
  const { data: session, status, update } = useSession();
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const checkout = useStripeCheckout();
  const [aiRemaining, setAiRemaining] = useState<number | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (!session?.user?.paid) return;
    fetch("/api/ai/chat")
      .then((r) => r.json())
      .then((d) => setAiRemaining(d.remaining ?? null))
      .catch(() => setAiRemaining(null));
  }, [session?.user?.paid]);

  useEffect(() => {
    const payment = searchParams.get("payment");
    const sessionId = searchParams.get("session_id");
    if (payment !== "success" || !sessionId) return;

    let cancelled = false;
    (async () => {
      const result = await verifyStripePayment(sessionId);
      if (cancelled) return;

      if (result.paid) {
        await update();
        setPaymentMessage("Payment successful — lifetime access unlocked!");
        window.history.replaceState({}, "", `/${locale}/dashboard`);
      } else {
        setPaymentMessage(result.error ?? "Payment could not be verified yet. Refresh in a moment.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, locale, update]);

  if (status === "loading") {
    return <p className="text-center text-muted">Loading...</p>;
  }

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-md space-y-4 text-center">
        <p>Sign in to view your dashboard</p>
        <GoogleSignInButton callbackUrl={`/${locale}/dashboard`} />
      </div>
    );
  }

  const used = session.user.documentsProcessed ?? 0;
  const remaining = session.user.paid
    ? "Unlimited"
    : Math.max(0, FREE_DOCUMENT_LIMIT - used);

  const handleUpgrade = async () => {
    setUpgrading(true);
    setCheckoutError(null);
    const result = await checkout();
    if (!result.ok) setCheckoutError(result.error ?? "Checkout failed");
    setUpgrading(false);
  };

  return (
    <div className="space-y-8">
      {paymentMessage && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{paymentMessage}</p>
      )}

      <div className="flex items-center gap-4">
        {session.user.image && (
          <Image
            src={session.user.image}
            alt=""
            width={48}
            height={48}
            className="rounded-full"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted">
            {session.user.name ?? session.user.email}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted">{t("documentsUsed")}</p>
          <p className="text-2xl font-bold">{used}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted">{t("status")}</p>
          <p className="text-2xl font-bold">
            {session.user.paid ? t("paid") : t("free")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-sm text-muted">Remaining</p>
          <p className="text-2xl font-bold">{remaining}</p>
        </div>
      </div>

      {session.user.paid && aiRemaining !== null && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-6">
          <p className="text-sm text-violet-800">AI credits this month</p>
          <p className="text-2xl font-bold text-violet-950">
            {aiRemaining} / {AI_CREDITS_MONTHLY_LIMIT}
          </p>
          <p className="mt-1 text-xs text-violet-700">
            Used for Chat with PDF and AI Templates. Resets every 30 days.
          </p>
        </div>
      )}

      {!session.user.paid && (
        <div className="rounded-xl bg-blue-50 p-4 text-center">
          <p className="mb-2">Unlock unlimited access for €1</p>
          {checkoutError && <p className="mb-2 text-sm text-red-700">{checkoutError}</p>}
          <Button onClick={handleUpgrade} disabled={upgrading}>
            {upgrading ? "Redirecting to Stripe…" : "Upgrade now"}
          </Button>
        </div>
      )}
    </div>
  );
}
