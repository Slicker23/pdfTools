"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("cookie-consent")) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card p-4 shadow-lg">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
        <p className="text-sm text-muted">
          We use essential cookies for authentication. Optional analytics cookies help us improve PdfFlow.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              localStorage.setItem("cookie-consent", "essential");
              setVisible(false);
            }}
          >
            Essential only
          </Button>
          <Button
            size="sm"
            onClick={() => {
              localStorage.setItem("cookie-consent", "all");
              setVisible(false);
            }}
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
