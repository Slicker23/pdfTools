import { loadPdfDocument, savePdf } from "./core";

export interface MetadataSnapshot {
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  keywords: string[];
}

export async function readMetadata(file: File): Promise<MetadataSnapshot> {
  const pdf = await loadPdfDocument(file);
  return {
    title: pdf.getTitle() ?? "",
    author: pdf.getAuthor() ?? "",
    subject: pdf.getSubject() ?? "",
    creator: pdf.getCreator() ?? "",
    producer: pdf.getProducer() ?? "",
    keywords: pdf.getKeywords()?.split(",").map((k) => k.trim()).filter(Boolean) ?? [],
  };
}

export async function removeMetadata(file: File): Promise<Uint8Array> {
  const pdf = await loadPdfDocument(file);
  pdf.setTitle("");
  pdf.setAuthor("");
  pdf.setSubject("");
  pdf.setKeywords([]);
  pdf.setProducer("");
  pdf.setCreator("");
  return savePdf(pdf);
}
