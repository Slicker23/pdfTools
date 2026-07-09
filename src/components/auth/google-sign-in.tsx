"use client";

import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "Server auth misconfigured. Check AUTH_SECRET and Google credentials in .env.local.",
  AccessDenied: "Access denied. You cancelled sign-in or your account is not allowed.",
  Verification: "Sign-in link expired or already used.",
  OAuthSignin: "Could not start Google sign-in. Check GOOGLE_CLIENT_ID and redirect URI.",
  OAuthCallback: "Google callback failed. Verify redirect URI in Google Cloud Console.",
  OAuthAccountNotLinked: "This email is already linked to another sign-in method.",
  Default: "Something went wrong during sign-in. Try again.",
};

interface GoogleSignInButtonProps {
  callbackUrl?: string;
  size?: "default" | "sm" | "lg";
  className?: string;
  configured?: boolean;
}

export function GoogleSignInButton({
  callbackUrl,
  size = "lg",
  className,
  configured = true,
}: GoogleSignInButtonProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  const defaultCallback = callbackUrl ?? `/${locale}/dashboard`;

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      onClick={() => {
        if (!configured) return;
        signIn("google", { callbackUrl: defaultCallback });
      }}
      disabled={!configured}
    >
      <GoogleIcon />
      {t("signIn")}
    </Button>
  );
}

interface SignInPanelProps {
  configured?: boolean;
}

export function SignInPanel({ configured = true }: SignInPanelProps) {
  const t = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? `/${locale}/dashboard`;

  return (
    <div className="mx-auto max-w-md space-y-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">{t("signIn")}</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with Google to track your free documents and unlock lifetime access.
        </p>
      </div>

      {!configured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
          <p className="font-medium">Google auth not configured yet</p>
          <p className="mt-1">
            Add <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_ID</code> and{" "}
            <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_SECRET</code> to{" "}
            <code className="rounded bg-amber-100 px-1">.env.local</code>, then restart{" "}
            <code className="rounded bg-amber-100 px-1">npm run dev</code>.
          </p>
          <p className="mt-2">See <strong>docs/GOOGLE_AUTH.md</strong> for setup steps.</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default}
        </div>
      )}

      <GoogleSignInButton
        callbackUrl={callbackUrl}
        configured={configured}
        className="w-full bg-white hover:bg-slate-50"
      />

      <p className="text-xs text-muted">
        We only store your email, name, and usage count. PDF files stay in your browser.
      </p>
    </div>
  );
}
