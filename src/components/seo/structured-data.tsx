import { ToolId } from "@/lib/constants";

/** Site-wide Organization + WebSite JSON-LD, rendered once per page in the locale layout. */
export function SiteStructuredData({ locale }: { locale: string }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfflow.app";

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PdfFlow",
    url: baseUrl,
    logo: `${baseUrl}/icon.png`,
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PdfFlow",
    url: `${baseUrl}/${locale}`,
    inLanguage: locale,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/${locale}/tools?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}

interface StructuredDataProps {
  toolId?: ToolId;
  locale: string;
  title: string;
  description: string;
}

export function StructuredData({ toolId, locale, title, description }: StructuredDataProps) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfflow.app";

  const webApp = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: title,
    description,
    url: toolId ? `${baseUrl}/${locale}/tools/${toolId}` : `${baseUrl}/${locale}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
    },
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Are my files uploaded to your servers?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "For basic tools, files are processed in your browser and never uploaded.",
        },
      },
      {
        "@type": "Question",
        name: "What does the €1 lifetime plan include?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Unlimited browser tools plus fair-use server conversions and AI features.",
        },
      },
    ],
  };

  const howTo = toolId
    ? {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: title,
        description,
        step: [
          {
            "@type": "HowToStep",
            name: "Upload file",
            text: "Select or drop your PDF file",
          },
          {
            "@type": "HowToStep",
            name: "Process",
            text: "Configure options and process",
          },
          {
            "@type": "HowToStep",
            name: "Download",
            text: "Download the result",
          },
        ],
      }
    : null;

  const breadcrumb = toolId
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${baseUrl}/${locale}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Tools",
            item: `${baseUrl}/${locale}/tools`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: title,
            item: `${baseUrl}/${locale}/tools/${toolId}`,
          },
        ],
      }
    : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApp) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
      {howTo && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howTo) }}
        />
      )}
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
      )}
    </>
  );
}
