"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { FileText, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GoogleSignInButton } from "@/components/auth/google-sign-in";
import { LOCALES } from "@/lib/constants";

export function Header() {
  const t = useTranslations("common");
  const locale = useLocale();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const nav = [
    { href: `/${locale}/tools`, label: t("tools") },
    { href: `/${locale}/pricing`, label: t("pricing") },
    { href: `/${locale}/blog`, label: t("blog") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={`/${locale}`} className="flex items-center gap-2 font-bold text-primary">
          <FileText className="h-6 w-6" />
          {t("brand")}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm hover:text-primary">
              {item.label}
            </Link>
          ))}
          <select
            className="rounded border border-border bg-transparent px-2 py-1 text-sm"
            value={locale}
            onChange={(e) => {
              const path = window.location.pathname.replace(`/${locale}`, `/${e.target.value}`);
              window.location.href = path;
            }}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
          {mounted && session ? (
            <div className="flex items-center gap-3">
              <Link href={`/${locale}/dashboard`} className="text-sm hover:text-primary">
                {t("dashboard")}
              </Link>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                {t("signOut")}
              </Button>
            </div>
          ) : mounted ? (
            <GoogleSignInButton size="sm" callbackUrl={`/${locale}/dashboard`} />
          ) : (
            <span className="inline-block h-8 w-24" aria-hidden="true" />
          )}
        </nav>

        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X /> : <Menu />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border px-4 py-3 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block py-2 text-sm"
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const t = useTranslations("common");
  const locale = useLocale();

  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:justify-between">
        <div>
          <p className="font-bold text-primary">{t("brand")}</p>
          <p className="text-sm text-muted">{t("tagline")}</p>
        </div>
        <div className="flex gap-6 text-sm">
          <Link href={`/${locale}/privacy`}>{t("privacy")}</Link>
          <Link href={`/${locale}/pricing`}>{t("pricing")}</Link>
        </div>
      </div>
    </footer>
  );
}
