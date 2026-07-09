import { Suspense } from "react";
import { isGoogleAuthConfigured } from "@/auth";
import { SignInPanel } from "@/components/auth/google-sign-in";

export default function SignInPage() {
  const configured = isGoogleAuthConfigured();

  return (
    <Suspense fallback={<p className="text-center text-muted">Loading...</p>}>
      <SignInPanel configured={configured} />
    </Suspense>
  );
}
