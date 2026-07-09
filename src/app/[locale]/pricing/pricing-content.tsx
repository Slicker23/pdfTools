"use client";

import { useTranslations, useLocale } from "next-intl";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/auth/google-sign-in";
import { useStripeCheckout } from "@/lib/client-stripe";
import { useState } from "react";

export function PricingContent() {
  const t = useTranslations("pricing");
  const locale = useLocale();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const checkout = useStripeCheckout();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelled = searchParams.get("payment") === "cancelled";

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await checkout();
      if (!result.ok) setError(result.error ?? "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 text-center">
      <h1 className="text-3xl font-bold">{t("title")}</h1>

      {cancelled && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Payment cancelled — no charge was made.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold">{t("free")}</h2>
          <p className="mt-2 text-muted">{t("freeDesc")}</p>
          <p className="mt-4 text-3xl font-bold">€0</p>
        </div>
        <div className="rounded-xl border-2 border-primary bg-card p-6">
          <h2 className="text-xl font-bold">{t("lifetime")}</h2>
          <p className="mt-2 text-muted">{t("lifetimeDesc")}</p>
          <p className="mt-4 text-3xl font-bold text-primary">€1</p>
          {session?.user?.paid ? (
            <p className="mt-4 text-sm font-medium text-green-700">You already have lifetime access</p>
          ) : status === "unauthenticated" ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-muted">Sign in to purchase</p>
              <GoogleSignInButton callbackUrl={`/${locale}/pricing`} />
            </div>
          ) : (
            <>
              {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
              <Button className="mt-4 w-full" onClick={handleCheckout} disabled={loading}>
                {loading ? "Redirecting to Stripe…" : t("lifetime")}
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="text-left">
        <h3 className="mb-4 text-lg font-semibold">{t("features")}</h3>
        <ul className="space-y-2">
          {[t("feature1"), t("feature2"), t("feature3"), t("feature4")].map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-600" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
