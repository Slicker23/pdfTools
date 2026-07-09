import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";

const POSTS: Record<string, { title: string; content: string }> = {
  "merge-pdf-without-upload": {
    title: "How to Merge PDFs Without Uploading to a Server",
    content: `Privacy matters when handling sensitive documents. With PdfFlow, you can merge multiple PDF files entirely in your browser — no upload, no waiting, no risk.

## Steps
1. Open the Merge PDF tool
2. Select or drag your PDF files
3. Reorder if needed
4. Click Merge and download

Your files never leave your device. This makes PdfFlow ideal for legal, medical, and financial documents.`,
  },
  "compress-pdf-guide": {
    title: "Complete Guide to Compressing PDF Files",
    content: `Large PDF files are difficult to email and slow to share. Compression reduces file size while keeping documents readable.

## Tips
- Use 80% quality for most documents
- Image-heavy PDFs benefit most from compression
- Always keep an original backup

PdfFlow compresses locally in your browser for maximum privacy.`,
  },
  "pdf-privacy-eu": {
    title: "PDF Privacy in the EU: What You Need to Know",
    content: `Under GDPR, document processing services must minimize data collection. Browser-based PDF tools like PdfFlow process files locally, eliminating unnecessary data transfers to third-party servers.

For server-based conversions, PdfFlow uses temporary EU-hosted storage with automatic deletion after 1 hour.`,
  },
  "pdf-to-word-free": {
    title: "Convert PDF to Word for Free",
    content: `Need to edit a PDF? Converting to Word (.docx) lets you modify text, tables, and formatting.

PdfFlow offers high-quality server conversion for paid users, with fair-use limits to keep the service sustainable at €1 lifetime pricing.`,
  },
  "remove-pdf-metadata": {
    title: "How to Remove Hidden Metadata from PDFs",
    content: `PDFs contain hidden metadata: author name, creation date, software used, and more. Before sharing sensitive documents, strip this metadata using PdfFlow's Remove Metadata tool — processed entirely in your browser.`,
  },
  "ocr-scanned-pdf": {
    title: "OCR for Scanned PDFs: Make Text Searchable",
    content: `Scanned documents are images, not text. OCR (Optical Character Recognition) converts images of text into selectable, searchable content.

PdfFlow offers browser-based OCR using Tesseract.js, with optional server OCR for faster processing.`,
  },
};

export function generateStaticParams() {
  const locales = ["en", "de", "fr", "es", "it", "pt", "nl", "pl"];
  return locales.flatMap((locale) =>
    Object.keys(POSTS).map((slug) => ({ locale, slug }))
  );
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const post = POSTS[slug];
  if (!post) notFound();

  return (
    <article className="prose mx-auto max-w-3xl">
      <Link href={`/${locale}/blog`} className="text-sm text-primary no-underline">
        ← Back to blog
      </Link>
      <h1 className="mt-4">{post.title}</h1>
      {post.content.split("\n\n").map((para, i) => {
        if (para.startsWith("## ")) {
          return <h2 key={i}>{para.replace("## ", "")}</h2>;
        }
        if (para.startsWith("- ")) {
          return (
            <ul key={i}>
              {para.split("\n").map((item, j) => (
                <li key={j}>{item.replace("- ", "")}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{para}</p>;
      })}
    </article>
  );
}
