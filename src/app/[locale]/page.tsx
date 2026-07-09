import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LOCALES } from "@/lib/constants";
import { StructuredData } from "@/components/seo/structured-data";
import { HomeContent } from "./home-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });

  return {
    title: t("hero"),
    description: t("heroSub"),
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });

  return (
    <>
      <StructuredData locale={locale} title={t("hero")} description={t("heroSub")} />
      <HomeContent />
    </>
  );
}
