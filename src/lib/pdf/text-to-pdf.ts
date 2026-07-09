import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const LINE_HEIGHT = FONT_SIZE * 1.35;

function wrapParagraph(text: string, font: PDFFont, maxWidth: number): string[] {
  if (!text.trim()) return [""];

  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    let width: number;
    try {
      width = font.widthOfTextAtSize(candidate, FONT_SIZE);
    } catch {
      width = maxWidth + 1;
    }

    if (width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function wrapText(text: string, font: PDFFont, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    lines.push(...wrapParagraph(paragraph, font, maxWidth));
  }
  return lines.length > 0 ? lines : [""];
}

function safeDrawText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  x: number,
  y: number,
  font: PDFFont
) {
  try {
    page.drawText(text, { x, y, size: FONT_SIZE, font });
  } catch {
    const ascii = text.replace(/[^\x20-\x7E]/g, "?");
    page.drawText(ascii, { x, y, size: FONT_SIZE, font });
  }
}

/** Convert plain text into a multi-page A4 PDF. */
export async function textToPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const lines = wrapText(text, font, maxWidth);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  for (const line of lines) {
    if (y < MARGIN + LINE_HEIGHT) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    if (line) safeDrawText(page, line, MARGIN, y, font);
    y -= LINE_HEIGHT;
  }

  return pdf.save();
}
