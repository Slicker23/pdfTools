import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");

  return (
    <div className="prose mx-auto max-w-3xl">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <h2>Data We Collect</h2>
      <ul>
        <li>Google account email and name (for authentication)</li>
        <li>Usage count (number of documents processed)</li>
        <li>Payment status (via Stripe)</li>
      </ul>
      <h2>Data We Do NOT Collect</h2>
      <ul>
        <li>PDF file contents (for browser-based tools)</li>
        <li>Document metadata from local processing</li>
      </ul>
      <h2>Server Processing</h2>
      <p>
        For server-based conversions (PDF to Word, OCR, etc.), files are temporarily
        stored in EU-region storage and automatically deleted within 1 hour.
      </p>
      <h2>Your Rights (GDPR)</h2>
      <p>
        You have the right to access, rectify, and delete your personal data.
        Contact us to exercise these rights.
      </p>
      <h2>Cookies</h2>
      <p>
        We use essential cookies for authentication and optional analytics cookies
        with your consent.
      </p>
    </div>
  );
}
