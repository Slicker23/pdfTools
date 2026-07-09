import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LOCALES } from "@/lib/constants";
import { PricingContent } from "./pricing-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });

  return {
    title: t("title"),
    description: t("lifetimeDesc"),
    alternates: {
      canonical: `/${locale}/pricing`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/pricing`])),
    },
  };
}

export default function PricingPage() {
  return (
    <Suspense fallback={<p className="text-center text-muted">Loading...</p>}>
      <PricingContent />
    </Suspense>
  );
}
