import pptxgen from "pptxgenjs";
import { bytesToBase64, renderPdfPagesToPng } from "./render-pages";

/**
 * Browser fallback: one slide per PDF page with a sharp full-page image.
 */
export async function pdfToPptx(file: File): Promise<Blob> {
  const rendered = await renderPdfPagesToPng(file, 2);
  const pptx = new pptxgen();

  if (rendered.length > 0) {
    const first = rendered[0];
    const slideW = 10;
    const slideH = (first.height / first.width) * slideW;
    pptx.defineLayout({ name: "PDF_PAGE", width: slideW, height: slideH });
    pptx.layout = "PDF_PAGE";
  } else {
    pptx.layout = "LAYOUT_16x9";
  }

  const slideW = pptx.layout === "PDF_PAGE" ? 10 : 10;
  const slideH =
    pptx.layout === "PDF_PAGE" && rendered[0]
      ? (rendered[0].height / rendered[0].width) * slideW
      : 5.625;

  for (const { png, width, height } of rendered) {
    const slide = pptx.addSlide();
    slide.addImage({
      data: `image/png;base64,${bytesToBase64(png)}`,
      x: 0,
      y: 0,
      w: slideW,
      h: (height / width) * slideW,
    });
  }

  const output = await pptx.write({ outputType: "blob" });
  return output as Blob;
}
