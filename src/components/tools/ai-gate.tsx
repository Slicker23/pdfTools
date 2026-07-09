"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Sparkles } from "lucide-react";
import { Paywall } from "@/components/tools/paywall";
import { AI_CREDITS_MONTHLY_LIMIT } from "@/lib/constants";

interface AiCreditsState {
  loading: boolean;
  paid: boolean;
  allowed: boolean;
  remaining: number;
  ollamaAvailable: boolean;
  ollamaModel: string;
  reason?: string;
  requiresPayment?: boolean;
}

export function useAiCredits() {
  const { status } = useSession();
  const [state, setState] = useState<AiCreditsState>({
    loading: true,
    paid: false,
    allowed: false,
    remaining: 0,
    ollamaAvailable: false,
    ollamaModel: "llama3.2",
  });

  const refresh = useCallback(async () => {
    if (status !== "authenticated") {
      setState({
        loading: false,
        paid: false,
        allowed: false,
        remaining: 0,
        ollamaAvailable: false,
        ollamaModel: "llama3.2",
        reason: "Please sign in to use AI tools.",
      });
      return;
    }

    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/ai/chat");
      const data = await res.json();
      setState({
        loading: false,
        paid: Boolean(data.paid),
        allowed: Boolean(data.allowed),
        remaining: data.remaining ?? 0,
        ollamaAvailable: Boolean(data.ollamaAvailable),
        ollamaModel: data.ollamaModel ?? "llama3.2",
        reason: data.reason,
        requiresPayment: data.requiresPayment,
      });
    } catch {
      setState({
        loading: false,
        paid: false,
        allowed: false,
        remaining: 0,
        ollamaAvailable: false,
        ollamaModel: "llama3.2",
        reason: "Could not load AI credits.",
      });
    }
  }, [status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}

interface AiCreditsBannerProps {
  remaining: number;
  loading?: boolean;
  ollamaAvailable?: boolean;
  ollamaModel?: string;
}

export function AiCreditsBanner({
  remaining,
  loading,
  ollamaAvailable,
  ollamaModel,
}: AiCreditsBannerProps) {
  if (loading) {
    return (
      <div className="rounded-lg bg-violet-50 px-4 py-2 text-sm text-violet-800">
        Checking AI credits…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-4 py-2 text-sm text-violet-900">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span>
          {remaining} of {AI_CREDITS_MONTHLY_LIMIT} AI credits remaining this month
        </span>
      </div>
      {!ollamaAvailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Ollama is not running. Install free local AI:{" "}
          <code className="text-xs">./scripts/setup-ollama-fedora.sh</code>
          {ollamaModel ? ` (model: ${ollamaModel})` : ""}
        </div>
      )}
    </div>
  );
}

interface AiGateProps {
  children: React.ReactNode;
}

/** Blocks AI tools for unsigned-in, unpaid, or out-of-credits users. */
export function AiGate({ children }: AiGateProps) {
  const { status } = useSession();
  const { loading, paid, allowed, reason, requiresPayment, refresh } = useAiCredits();

  if (status === "loading" || loading) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="rounded-xl border border-border bg-slate-50 p-6 text-center text-sm">
        Sign in with Google to use AI tools. Lifetime access (€1) includes{" "}
        {AI_CREDITS_MONTHLY_LIMIT} AI operations per month.
      </div>
    );
  }

  if (requiresPayment || !paid) {
    return <Paywall />;
  }

  if (!allowed) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm text-amber-900">
          {reason ?? "Monthly AI credit limit reached."}
        </p>
        <p className="mt-2 text-xs text-amber-800">
          Credits reset every 30 days. You get {AI_CREDITS_MONTHLY_LIMIT} per month with lifetime
          access.
        </p>
        <button
          type="button"
          className="mt-3 text-sm text-primary underline"
          onClick={() => refresh()}
        >
          Refresh
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
