import type { PDFPageProxy } from "pdfjs-dist";
import { initPdfJs } from "./pdfjs-config";
import { PdfToolError } from "./errors";

export interface ExtractedImage {
  blob: Blob;
  page: number;
  width: number;
  height: number;
}

interface PdfImageData {
  data?: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  bitmap?: ImageBitmap;
}

/** Render page so XObject images are decoded into objs/commonObjs. */
async function warmPage(page: PDFPageProxy): Promise<void> {
  const viewport = page.getViewport({ scale: 1 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
}

function objectStore(page: PDFPageProxy, objId: string) {
  return objId.startsWith("g_") ? page.commonObjs : page.objs;
}

/** Wait for an XObject to resolve (sync get throws if not ready yet). */
function resolvePdfObject(page: PDFPageProxy, objId: string): Promise<PdfImageData | null> {
  const store = objectStore(page, objId);
  return new Promise((resolve) => {
    store.get(objId, (obj: PdfImageData | null) => {
      resolve(obj ?? null);
    });
  });
}

function isImageOperator(
  fn: number,
  OPS: Awaited<ReturnType<typeof initPdfJs>>["OPS"]
): boolean {
  return (
    fn === OPS.paintImageXObject ||
    fn === OPS.paintImageXObjectRepeat ||
    fn === OPS.paintInlineImageXObject
  );
}

export async function extractImagesFromPdf(file: File): Promise<ExtractedImage[]> {
  const pdfjs = await initPdfJs();
  const pdf = await pdfjs.getDocument({
    data: await file.arrayBuffer(),
    isOffscreenCanvasSupported: false,
  }).promise;

  const images: ExtractedImage[] = [];
  const seenXObjects = new Set<string>();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    await warmPage(page);

    const ops = await page.getOperatorList();
    const { fnArray, argsArray } = ops;

    for (let j = 0; j < fnArray.length; j++) {
      if (!isImageOperator(fnArray[j], pdfjs.OPS)) continue;

      const args = argsArray[j];
      if (!Array.isArray(args) || args.length === 0) continue;

      if (fnArray[j] === pdfjs.OPS.paintInlineImageXObject) {
        const img = args[0] as PdfImageData | undefined;
        if (!img?.width || !img.height) continue;
        const key = `inline:${pageNum}:${j}`;
        if (seenXObjects.has(key)) continue;
        seenXObjects.add(key);
        try {
          const blob = await pdfImageToPng(img);
          images.push({ blob, page: pageNum, width: img.width, height: img.height });
        } catch {
          // skip unsupported inline image
        }
        continue;
      }

      const objId = args[0] as string;
      if (!objId || seenXObjects.has(objId)) continue;
      seenXObjects.add(objId);

      const img = await resolvePdfObject(page, objId);
      if (!img?.width || !img.height) continue;

      try {
        const blob = await pdfImageToPng(img);
        images.push({ blob, page: pageNum, width: img.width, height: img.height });
      } catch {
        // skip unsupported XObject
      }
    }
  }

  if (images.length === 0) {
    throw new PdfToolError(
      "No embedded images found in this PDF. Scanned pages are rendered as content, not extractable images.",
      "NO_IMAGES"
    );
  }

  return images;
}

async function pdfImageToPng(img: PdfImageData): Promise<Blob> {
  if (img.bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d")!.drawImage(img.bitmap, 0, 0);
    return canvasToBlob(canvas);
  }

  if (!img.data) {
    throw new Error("Image has no pixel data");
  }

  return imageDataToPng(img.data, img.width, img.height);
}

async function imageDataToPng(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);
  const pixels = data.length / (width * height);

  if (pixels === 1) {
    for (let i = 0, p = 0; i < data.length; i++, p += 4) {
      const v = data[i];
      imageData.data[p] = v;
      imageData.data[p + 1] = v;
      imageData.data[p + 2] = v;
      imageData.data[p + 3] = 255;
    }
  } else if (pixels === 3) {
    for (let i = 0, p = 0; i < data.length; i += 3, p += 4) {
      imageData.data[p] = data[i];
      imageData.data[p + 1] = data[i + 1];
      imageData.data[p + 2] = data[i + 2];
      imageData.data[p + 3] = 255;
    }
  } else {
    imageData.data.set(data.subarray(0, width * height * 4));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export image"))), "image/png");
  });
}
