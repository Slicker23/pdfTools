import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TOOLS, type ToolId } from "@/lib/constants";
import { ToolRenderer } from "@/components/tools/tool-renderer";
import { StructuredData } from "@/components/seo/structured-data";

export async function generateStaticParams() {
  const locales = ["en", "de", "fr", "es", "it", "pt", "nl", "pl"];
  return locales.flatMap((locale) =>
    TOOLS.map((tool) => ({ locale, tool }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; tool: string }>;
}): Promise<Metadata> {
  const { locale, tool } = await params;
  const t = await getTranslations({ locale, namespace: "tools" });

  if (!TOOLS.includes(tool as ToolId)) return {};

  return {
    title: `${t(`${tool}.title`)} — PdfFlow`,
    description: t(`${tool}.description`),
    alternates: {
      canonical: `/${locale}/tools/${tool}`,
      languages: Object.fromEntries(
        ["en", "de", "fr", "es", "it", "pt", "nl", "pl"].map((l) => [
          l,
          `/${l}/tools/${tool}`,
        ])
      ),
    },
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ locale: string; tool: string }>;
}) {
  const { locale, tool } = await params;
  setRequestLocale(locale);

  if (!TOOLS.includes(tool as ToolId)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "tools" });
  const tc = await getTranslations({ locale, namespace: "common" });

  return (
    <>
      <StructuredData
        toolId={tool as ToolId}
        locale={locale}
        title={t(`${tool}.title`)}
        description={t(`${tool}.description`)}
      />
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t(`${tool}.title`)}</h1>
          <p className="mt-2 text-muted">{t(`${tool}.description`)}</p>
          <p className="mt-1 text-sm text-primary">{tc("privacyNote")}</p>
        </div>
        <ToolRenderer tool={tool as ToolId} />
        <div className="rounded-xl bg-slate-50 p-4">
          <h2 className="font-medium">How to use</h2>
          <p className="mt-1 text-sm text-muted">{t(`${tool}.howTo`)}</p>
        </div>
      </div>
    </>
  );
}
