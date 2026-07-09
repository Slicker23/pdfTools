import type { MetadataRoute } from "next";
import { TOOLS, LOCALES } from "@/lib/constants";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfflow.app";

const blogSlugs = [
  "merge-pdf-without-upload",
  "compress-pdf-guide",
  "pdf-privacy-eu",
  "pdf-to-word-free",
  "remove-pdf-metadata",
  "ocr-scanned-pdf",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of LOCALES) {
    entries.push({
      url: `${baseUrl}/${locale}`,
      changeFrequency: "weekly",
      priority: 1,
    });
    entries.push({
      url: `${baseUrl}/${locale}/tools`,
      changeFrequency: "weekly",
      priority: 0.9,
    });
    entries.push({
      url: `${baseUrl}/${locale}/pricing`,
      changeFrequency: "monthly",
      priority: 0.8,
    });
    entries.push({
      url: `${baseUrl}/${locale}/blog`,
      changeFrequency: "weekly",
      priority: 0.7,
    });

    for (const tool of TOOLS) {
      entries.push({
        url: `${baseUrl}/${locale}/tools/${tool}`,
        changeFrequency: "monthly",
        priority: 0.8,
      });
    }

    for (const slug of blogSlugs) {
      entries.push({
        url: `${baseUrl}/${locale}/blog/${slug}`,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
