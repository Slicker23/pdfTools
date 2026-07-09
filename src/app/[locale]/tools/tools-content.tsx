"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useLocale } from "next-intl";
import { TOOLS } from "@/lib/constants";

export function ToolsContent() {
  const t = useTranslations("tools");
  const tc = useTranslations("common");
  const locale = useLocale();

  return (
    <div>
      <h1 className="mb-2 text-3xl font-bold">{tc("allTools")}</h1>
      <p className="mb-8 text-muted">{tc("privacyNote")}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool}
            href={`/${locale}/tools/${tool}`}
            className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
          >
            <h2 className="font-medium">{t(`${tool}.title`)}</h2>
            <p className="mt-1 text-sm text-muted">{t(`${tool}.description`)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
