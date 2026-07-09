import { pdfJsDocumentInit } from "./pdfjs-load-options";

let workerInitialized = false;

const WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";

export async function initPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerInitialized) {
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    workerInitialized = true;
  }
  return pdfjs;
}

export async function loadPdfJsDocument(file: File) {
  const pdfjs = await initPdfJs();
  const bytes = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument(pdfJsDocumentInit(bytes));
  try {
    return await loadingTask.promise;
  } catch {
    const { PdfToolError } = await import("./errors");
    throw new PdfToolError(
      `"${file.name}" could not be rendered. It may be corrupted or encrypted.`,
      "RENDER_FAILED"
    );
  }
}
