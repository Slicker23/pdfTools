import { rgb, StandardFonts } from "pdf-lib";
import { loadPdfDocument, savePdf } from "./core";

export type PageNumberFormat = "number" | "page-n" | "n-of-t";
export type PageNumberPosition =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center";

export interface PageNumberOptions {
  format: PageNumberFormat;
  position: PageNumberPosition;
  startAt: number;
  fontSize: number;
  margin: number;
}

function formatLabel(format: PageNumberFormat, n: number, total: number): string {
  if (format === "page-n") return `Page ${n}`;
  if (format === "n-of-t") return `${n} of ${total}`;
  return `${n}`;
}

export async function addPageNumbers(
  file: File,
  options: Partial<PageNumberOptions> = {}
): Promise<Uint8Array> {
  const opts: PageNumberOptions = {
    format: options.format ?? "number",
    position: options.position ?? "bottom-center",
    startAt: options.startAt ?? 1,
    fontSize: options.fontSize ?? 10,
    margin: options.margin ?? 24,
  };
  const pdf = await loadPdfDocument(file);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const total = pages.length;

  pages.forEach((page, index) => {
    const n = opts.startAt + index;
    const label = formatLabel(opts.format, n, opts.startAt + total - 1);
    const textWidth = font.widthOfTextAtSize(label, opts.fontSize);
    const { width, height } = page.getSize();
    const m = opts.margin;

    let x = width / 2 - textWidth / 2;
    let y = m;

    if (opts.position === "bottom-left") {
      x = m;
      y = m;
    } else if (opts.position === "bottom-right") {
      x = width - textWidth - m;
      y = m;
    } else if (opts.position === "bottom-center") {
      x = width / 2 - textWidth / 2;
      y = m;
    } else if (opts.position === "top-center") {
      x = width / 2 - textWidth / 2;
      y = height - opts.fontSize - m;
    }

    page.drawText(label, {
      x,
      y,
      size: opts.fontSize,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
  });

  return savePdf(pdf);
}
