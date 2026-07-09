/**
 * pdf.js init for nested contexts (engine Web Worker).
 * Spawns a dedicated pdf.js worker via `new Worker(new URL(...))` — importing the
 * worker module as a constructor is invalid and triggers the fake-worker fallback.
 */
let initialized = false;
let pdfJsWorker: Worker | null = null;
let pdfjsModule: typeof import("pdfjs-dist") | null = null;

export async function initPdfJsInWorker() {
  if (!pdfjsModule) {
    pdfjsModule = await import("pdfjs-dist");
  }
  const pdfjs = pdfjsModule;

  if (!initialized) {
    if (typeof Worker !== "undefined") {
      try {
        pdfJsWorker = new Worker(
          new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
          { type: "module" }
        );
        pdfjs.GlobalWorkerOptions.workerPort = pdfJsWorker;
      } catch {
        const origin =
          typeof self !== "undefined" && "location" in self && self.location?.origin
            ? self.location.origin
            : "";
        pdfjs.GlobalWorkerOptions.workerSrc = `${origin}/pdfjs/pdf.worker.min.mjs`;
      }
    }
    initialized = true;
  }
  return pdfjs;
}
