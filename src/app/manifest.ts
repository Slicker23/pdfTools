import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PdfFlow — Private PDF Tools",
    short_name: "PdfFlow",
    description:
      "Merge, split, compress, and convert PDFs privately in your browser. €1 lifetime access.",
    start_url: "/en",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
