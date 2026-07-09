"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FREE_DOCUMENT_LIMIT } from "@/lib/constants";
import { useStripeCheckout } from "@/lib/client-stripe";

interface PaywallProps {
  onUnlock?: () => void;
}

export function Paywall({ onUnlock }: PaywallProps) {
  const t = useTranslations("paywall");
  const checkout = useStripeCheckout();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await checkout();
      if (!result.ok) {
        setError(result.error ?? "Checkout failed");
      } else {
        onUnlock?.();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <Lock className="mx-auto mb-3 h-8 w-8 text-amber-600" />
      <h3 className="mb-2 text-lg font-semibold">{t("title")}</h3>
      <p className="mb-4 text-sm text-muted">{t("description")}</p>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <Button onClick={handleUnlock} disabled={loading} size="lg">
        {loading ? "..." : t("cta")}
      </Button>
    </div>
  );
}

export function UsageBanner() {
  const { data: session } = useSession();
  const t = useTranslations("common");

  if (!session?.user || session.user.paid) return null;

  const remaining = FREE_DOCUMENT_LIMIT - (session.user.documentsProcessed ?? 0);

  return (
    <div className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-800">
      {t("freeDocsRemaining", { count: remaining })}
    </div>
  );
}

export interface UsageRecordResult {
  allowed: boolean;
  reason?: string;
  requiresSignIn?: boolean;
  requiresPayment?: boolean;
}

interface UsageGateProps {
  toolId: string;
  children: (props: {
    canProcess: boolean;
    recordUsage: () => Promise<UsageRecordResult>;
  }) => React.ReactNode;
}

export function UsageGate({ toolId, children }: UsageGateProps) {
  const { data: session, status } = useSession();
  const [blocked, setBlocked] = useState(false);

  const canProcess =
    status === "authenticated" &&
    (session?.user?.paid ||
      (session?.user?.documentsProcessed ?? 0) < FREE_DOCUMENT_LIMIT);

  const recordUsage = async (): Promise<UsageRecordResult> => {
    if (status === "loading") {
      return {
        allowed: false,
        reason: "Checking sign-in status…",
      };
    }

    if (!session?.user) {
      return {
        allowed: false,
        reason: "Please sign in to download results.",
        requiresSignIn: true,
      };
    }

    const res = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: toolId }),
    });

    let data: {
      allowed?: boolean;
      reason?: string;
      requiresPayment?: boolean;
    } = {};

    try {
      data = await res.json();
    } catch {
      return {
        allowed: false,
        reason: "Could not verify usage limit. Please try again.",
      };
    }

    if (!data.allowed) {
      if (data.requiresPayment || res.status === 403) {
        setBlocked(true);
        return {
          allowed: false,
          reason: data.reason ?? "Free document limit reached.",
          requiresPayment: true,
        };
      }

      return {
        allowed: false,
        reason: data.reason ?? "Not authorized to download.",
        requiresSignIn: res.status === 401,
      };
    }

    return { allowed: true };
  };

  if (blocked || (status === "authenticated" && !canProcess)) {
    return <Paywall />;
  }

  return <>{children({ canProcess: !!canProcess, recordUsage })}</>;
}
