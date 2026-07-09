import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

const POSTS = [
  {
    slug: "merge-pdf-without-upload",
    title: "How to Merge PDFs Without Uploading to a Server",
    excerpt: "Keep your documents private by merging PDFs entirely in your browser.",
  },
  {
    slug: "compress-pdf-guide",
    title: "Complete Guide to Compressing PDF Files",
    excerpt: "Reduce PDF file size while maintaining visual quality for email and web.",
  },
  {
    slug: "pdf-privacy-eu",
    title: "PDF Privacy in the EU: What You Need to Know",
    excerpt: "GDPR-compliant PDF processing and why browser-based tools matter.",
  },
  {
    slug: "pdf-to-word-free",
    title: "Convert PDF to Word for Free",
    excerpt: "Best methods to convert PDF documents to editable Word format.",
  },
  {
    slug: "remove-pdf-metadata",
    title: "How to Remove Hidden Metadata from PDFs",
    excerpt: "Protect your privacy by stripping author, title, and other metadata.",
  },
  {
    slug: "ocr-scanned-pdf",
    title: "OCR for Scanned PDFs: Make Text Searchable",
    excerpt: "Turn scanned documents into searchable, selectable text with OCR.",
  },
];

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("blog");

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">{t("title")}</h1>
      <div className="grid gap-6 md:grid-cols-2">
        {POSTS.map((post) => (
          <Link
            key={post.slug}
            href={`/${locale}/blog/${post.slug}`}
            className="rounded-xl border border-border bg-card p-6 hover:shadow-md"
          >
            <h2 className="font-semibold">{post.title}</h2>
            <p className="mt-2 text-sm text-muted">{post.excerpt}</p>
            <span className="mt-3 inline-block text-sm text-primary">{t("readMore")} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
