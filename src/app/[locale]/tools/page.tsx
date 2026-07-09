import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LOCALES } from "@/lib/constants";
import { ToolsContent } from "./tools-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tc = await getTranslations({ locale, namespace: "common" });

  return {
    title: tc("allTools"),
    description: tc("privacyNote"),
    alternates: {
      canonical: `/${locale}/tools`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/tools`])),
    },
  };
}

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ToolsContent />;
}
