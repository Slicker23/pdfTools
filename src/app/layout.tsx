import type { Metadata } from "next";
import "./globals.css";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pdfflow.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "PdfFlow — Free Private PDF Tools",
    template: "%s — PdfFlow",
  },
  description:
    "Merge, split, compress, and convert PDFs privately in your browser. First 3 documents free, then €1 lifetime access. No subscription.",
  applicationName: "PdfFlow",
  keywords: [
    "PDF tools",
    "merge PDF",
    "split PDF",
    "compress PDF",
    "PDF to Word",
    "PDF to JPG",
    "edit PDF",
    "free PDF editor",
    "online PDF",
    "PDF converter",
  ],
  authors: [{ name: "PdfFlow" }],
  creator: "PdfFlow",
  publisher: "PdfFlow",
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: "website",
    siteName: "PdfFlow",
    title: "PdfFlow — Free Private PDF Tools",
    description:
      "Merge, split, compress, and convert PDFs privately in your browser. €1 lifetime access, no subscription.",
    url: baseUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "PdfFlow — Free Private PDF Tools",
    description:
      "Merge, split, compress, and convert PDFs privately in your browser. €1 lifetime access.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
