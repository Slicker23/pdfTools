export {
  addWatermark,
  type WatermarkOptions,
  type WatermarkPosition,
} from "./watermark";

export { removeMetadata, readMetadata } from "./remove-metadata";

export {
  addPageNumbers,
  type PageNumberOptions,
  type PageNumberFormat,
  type PageNumberPosition,
} from "./page-numbers";

export { passwordProtect } from "./password-protect";

export { createFormPdf, type FormField } from "./form";

import { addSignature as addSignatureImpl } from "./sign";
import { extractImagesFromPdf as extractImagesImpl } from "./extract-images";

/** Legacy positional API — expects PDF user-space coords (bottom-left origin) */
export async function addSignature(
  file: File,
  signatureDataUrl: string,
  page: number,
  pdfX: number,
  pdfY: number,
  pdfWidth: number,
  pdfHeight: number
) {
  return addSignatureImpl(file, signatureDataUrl, {
    page,
    pdfX,
    pdfY,
    pdfWidth,
    pdfHeight,
  });
}

/** Legacy API returning Blob[] instead of ExtractedImage[] */
export async function extractImagesFromPdf(file: File) {
  const images = await extractImagesImpl(file);
  return images.map((img) => img.blob);
}
