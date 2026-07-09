import { loadPdfDocument, savePdf } from "./core";

export interface FlattenResult {
  data: Uint8Array;
  flattenedFields: number;
}

export async function flattenPdf(file: File): Promise<FlattenResult> {
  const pdf = await loadPdfDocument(file);
  let flattenedFields = 0;

  try {
    const form = pdf.getForm();
    const fields = form.getFields();
    flattenedFields = fields.length;
    if (fields.length > 0) {
      form.flatten();
    }
  } catch {
    flattenedFields = 0;
  }

  return { data: await savePdf(pdf), flattenedFields };
}
