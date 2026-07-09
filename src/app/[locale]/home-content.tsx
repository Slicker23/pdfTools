"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Shield, Euro, Globe, FileText, Scissors, Minimize2, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIER1_TOOLS } from "@/lib/constants";

export function HomeContent() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const tt = useTranslations("tools");
  const locale = useLocale();

  const icons: Record<string, React.ReactNode> = {
    "merge-pdf": <FileText className="h-6 w-6" />,
    "split-pdf": <Scissors className="h-6 w-6" />,
    "compress-pdf": <Minimize2 className="h-6 w-6" />,
    "pdf-to-jpg": <Image className="h-6 w-6" />,
  };

  return (
    <div className="space-y-16">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t("hero")}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">{t("heroSub")}</p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href={`/${locale}/tools/merge-pdf`}>
            <Button size="lg">{tc("getStarted")}</Button>
          </Link>
          <Link href={`/${locale}/pricing`}>
            <Button variant="outline" size="lg">{tc("learnMore")}</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6">
          <Shield className="mb-3 h-8 w-8 text-primary" />
          <h3 className="font-semibold">{t("featurePrivacy")}</h3>
          <p className="mt-1 text-sm text-muted">{t("featurePrivacyDesc")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <Euro className="mb-3 h-8 w-8 text-primary" />
          <h3 className="font-semibold">{t("featurePrice")}</h3>
          <p className="mt-1 text-sm text-muted">{t("featurePriceDesc")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <Globe className="mb-3 h-8 w-8 text-primary" />
          <h3 className="font-semibold">{t("featureEu")}</h3>
          <p className="mt-1 text-sm text-muted">{t("featureEuDesc")}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold">{tc("tools")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TIER1_TOOLS.map((tool) => (
            <Link
              key={tool}
              href={`/${locale}/tools/${tool}`}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="text-primary">{icons[tool] ?? <FileText className="h-6 w-6" />}</div>
              <div>
                <h3 className="font-medium">{tt(`${tool}.title`)}</h3>
                <p className="text-sm text-muted">{tt(`${tool}.description`)}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-4 text-center">
          <Link href={`/${locale}/tools`} className="text-sm text-primary hover:underline">
            {tc("allTools")} →
          </Link>
        </div>
      </section>
    </div>
  );
}
