import { degrees, rgb, StandardFonts } from "pdf-lib";
import { loadPdfDocument, savePdf } from "./core";

export type WatermarkPosition = "center" | "diagonal" | "top" | "bottom";

export interface WatermarkOptions {
  text: string;
  opacity: number;
  rotation: number;
  fontSize: number;
  position: WatermarkPosition;
}

export async function addWatermark(
  file: File,
  textOrOptions: string | WatermarkOptions
): Promise<Uint8Array> {
  const options: WatermarkOptions =
    typeof textOrOptions === "string"
      ? {
          text: textOrOptions,
          opacity: 30,
          rotation: 45,
          fontSize: 48,
          position: "diagonal",
        }
      : textOrOptions;
  const { text, opacity, rotation, fontSize, position } = options;
  if (!text.trim()) {
    throw new Error("Enter watermark text");
  }

  const pdf = await loadPdfDocument(file);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const textWidth = font.widthOfTextAtSize(text, fontSize);

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    let x = width / 2 - textWidth / 2;
    let y = height / 2;
    let rotate = rotation;

    if (position === "diagonal") {
      rotate = 45;
      x = width / 2 - textWidth / 2;
      y = height / 2;
    } else if (position === "top") {
      rotate = 0;
      y = height - fontSize - 40;
    } else if (position === "bottom") {
      rotate = 0;
      y = 40;
    } else {
      rotate = position === "center" ? rotation : rotation;
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.55, 0.55, 0.55),
      opacity: Math.max(0.05, Math.min(1, opacity / 100)),
      rotate: degrees(rotate),
    });
  }

  return savePdf(pdf);
}
