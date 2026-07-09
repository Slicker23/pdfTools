import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { initPdfJs } from "./pdfjs-config";
import { PdfToolError } from "./errors";

const SCALE = 1.2;

export interface PageCompareResult {
  page: number;
  match: boolean;
  diffPercent: number;
  width: number;
  height: number;
}

export interface CompareResult {
  pageCountA: number;
  pageCountB: number;
  pages: PageCompareResult[];
  overallMatch: boolean;
}

export async function comparePdfs(fileA: File, fileB: File): Promise<CompareResult> {
  const pdfjs = await initPdfJs();
  const [bytesA, bytesB] = await Promise.all([fileA.arrayBuffer(), fileB.arrayBuffer()]);
  const [pdfA, pdfB] = await Promise.all([
    pdfjs.getDocument({ data: bytesA }).promise,
    pdfjs.getDocument({ data: bytesB }).promise,
  ]);

  const pageCountA = pdfA.numPages;
  const pageCountB = pdfB.numPages;
  const maxPages = Math.max(pageCountA, pageCountB);
  const pages: PageCompareResult[] = [];

  for (let i = 1; i <= maxPages; i++) {
    if (i > pageCountA || i > pageCountB) {
      pages.push({ page: i, match: false, diffPercent: 100, width: 0, height: 0 });
      continue;
    }

    const [pageA, pageB] = await Promise.all([pdfA.getPage(i), pdfB.getPage(i)]);
    const vpA = pageA.getViewport({ scale: SCALE, rotation: pageA.rotate });
    const vpB = pageB.getViewport({ scale: SCALE, rotation: pageB.rotate });

    const w = Math.max(vpA.width, vpB.width);
    const h = Math.max(vpA.height, vpB.height);
    const canvasA = await renderPageToCanvas(pageA, vpA, w, h);
    const canvasB = await renderPageToCanvas(pageB, vpB, w, h);
    const diffPercent = pixelDiffPercent(canvasA, canvasB);
    pages.push({
      page: i,
      match: diffPercent < 0.5,
      diffPercent,
      width: w,
      height: h,
    });
  }

  if (pages.length === 0) {
    throw new PdfToolError("Could not compare these PDFs.", "COMPARE_FAILED");
  }

  return {
    pageCountA,
    pageCountB,
    pages,
    overallMatch: pages.every((p) => p.match),
  };
}

export async function renderCompareDiff(
  fileA: File,
  fileB: File,
  pageNum: number
): Promise<string> {
  const pdfjs = await initPdfJs();
  const [bytesA, bytesB] = await Promise.all([fileA.arrayBuffer(), fileB.arrayBuffer()]);
  const [pdfA, pdfB] = await Promise.all([
    pdfjs.getDocument({ data: bytesA }).promise,
    pdfjs.getDocument({ data: bytesB }).promise,
  ]);

  if (pageNum > pdfA.numPages || pageNum > pdfB.numPages) {
    throw new PdfToolError("Page not available in both documents.", "PAGE_MISSING");
  }

  const [pageA, pageB] = await Promise.all([pdfA.getPage(pageNum), pdfB.getPage(pageNum)]);
  const vpA = pageA.getViewport({ scale: SCALE, rotation: pageA.rotate });
  const vpB = pageB.getViewport({ scale: SCALE, rotation: pageB.rotate });
  const w = Math.max(vpA.width, vpB.width);
  const h = Math.max(vpA.height, vpB.height);

  const canvasA = await renderPageToCanvas(pageA, vpA, w, h);
  const canvasB = await renderPageToCanvas(pageB, vpB, w, h);
  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = w;
  diffCanvas.height = h;
  const ctx = diffCanvas.getContext("2d")!;
  const dataA = canvasA.getContext("2d")!.getImageData(0, 0, w, h);
  const dataB = canvasB.getContext("2d")!.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);

  for (let i = 0; i < dataA.data.length; i += 4) {
    const dr = Math.abs(dataA.data[i] - dataB.data[i]);
    const dg = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
    const db = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);
    const diff = (dr + dg + db) / 3;
    if (diff > 12) {
      out.data[i] = 255;
      out.data[i + 1] = 60;
      out.data[i + 2] = 60;
      out.data[i + 3] = 200;
    } else {
      out.data[i] = dataA.data[i];
      out.data[i + 1] = dataA.data[i + 1];
      out.data[i + 2] = dataA.data[i + 2];
      out.data[i + 3] = 120;
    }
  }

  ctx.putImageData(out, 0, 0);
  return diffCanvas.toDataURL("image/png");
}

async function renderPageToCanvas(
  page: PDFPageProxy,
  viewport: PageViewport,
  w: number,
  h: number
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

function pixelDiffPercent(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
  const w = a.width;
  const h = a.height;
  const dataA = a.getContext("2d")!.getImageData(0, 0, w, h).data;
  const dataB = b.getContext("2d")!.getImageData(0, 0, w, h).data;
  let diffPixels = 0;
  const total = w * h;

  for (let i = 0; i < dataA.length; i += 4) {
    const dr = Math.abs(dataA[i] - dataB[i]);
    const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
    if (dr + dg + db > 30) diffPixels++;
  }

  return (diffPixels / total) * 100;
}
