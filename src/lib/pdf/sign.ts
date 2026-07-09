import { loadPdfDocument, savePdf } from "./core";

export interface SignaturePlacement {
  page: number;
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfHeight: number;
}

export async function addSignature(
  file: File,
  signatureDataUrl: string,
  placement: SignaturePlacement
): Promise<Uint8Array> {
  const pdf = await loadPdfDocument(file);
  const pages = pdf.getPages();
  const targetPage = pages[placement.page - 1];
  if (!targetPage) return savePdf(pdf);

  const imageBytes = await fetch(signatureDataUrl).then((r) => r.arrayBuffer());
  const image = await pdf.embedPng(imageBytes);

  targetPage.drawImage(image, {
    x: placement.pdfX,
    y: placement.pdfY,
    width: placement.pdfWidth,
    height: placement.pdfHeight,
  });

  return savePdf(pdf);
}
