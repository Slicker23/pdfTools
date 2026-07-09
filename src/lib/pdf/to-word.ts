import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";
import {
  extractPdfPageLayouts,
  type LayoutImage,
  type LayoutLine,
  type PageLayout,
} from "./layout-extract";

const PT_TO_TWIP = 20;
const PT_TO_PX = 96 / 72;

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

function ptToTwip(pt: number): number {
  return Math.round(pt * PT_TO_TWIP);
}

function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

function ptToPixel(pt: number): number {
  return Math.max(1, Math.round(pt * PT_TO_PX));
}

function imageRunType(mime: LayoutImage["mime"]): "png" | "jpg" {
  return mime === "jpeg" ? "jpg" : "png";
}

function lineToParagraph(
  line: LayoutLine,
  spacingBefore: number,
  opts?: { lightText?: boolean }
): Paragraph {
  const tabStops: { type: (typeof TabStopType)["LEFT"]; position: number }[] = [];
  const children: (TextRun | Tab)[] = [];
  let lastEndX = 0;

  for (let i = 0; i < line.spans.length; i++) {
    const span = line.spans[i];
    const gap = span.x - lastEndX;
    const needsTab = i === 0 ? span.x > 1 : gap > span.fontSize * 0.2;

    if (needsTab) {
      tabStops.push({ type: TabStopType.LEFT, position: ptToTwip(span.x) });
      children.push(new Tab());
    } else if (i > 0 && gap > span.fontSize * 0.06) {
      children.push(new TextRun({ text: " " }));
    }

    const text = span.text.trim();
    if (!text || (text === "•" && line.spans.length === 1)) continue;

    children.push(
      new TextRun({
        text: span.text,
        size: ptToHalfPoints(span.fontSize),
        bold: span.bold || (opts?.lightText && span.fontSize > 11),
        font: span.fontFamily,
        color: opts?.lightText ? "FFFFFF" : undefined,
      })
    );

    lastEndX = span.x + span.width;
  }

  if (children.length === 0) {
    return new Paragraph({ spacing: { before: spacingBefore, after: 0 } });
  }

  return new Paragraph({
    tabStops,
    spacing: {
      before: spacingBefore,
      after: 0,
      line: ptToTwip(line.lineHeight * 1.12),
    },
    children,
  });
}

function linesToParagraphs(
  lines: LayoutLine[],
  opts?: { lightText?: boolean }
): Paragraph[] {
  const sorted = [...lines].sort((a, b) => b.top - a.top);
  const paragraphs: Paragraph[] = [];
  let prevBottom: number | null = null;

  for (const line of sorted) {
    const rawGap = prevBottom === null ? 0 : Math.max(0, prevBottom - line.top);
    const gap = Math.min(ptToTwip(rawGap), 240);
    paragraphs.push(lineToParagraph(line, gap, opts));
    prevBottom = line.bottom;
  }

  return paragraphs;
}

function photoParagraph(img: LayoutImage, columnWidth: number): Paragraph {
  const widthPx = ptToPixel(Math.min(img.width, columnWidth - 16));
  const heightPx = ptToPixel(img.height * (widthPx / ptToPixel(img.width)));

  return new Paragraph({
    spacing: { before: 80, after: 80 },
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: imageRunType(img.mime),
        data: img.data,
        transformation: { width: widthPx, height: heightPx },
      }),
    ],
  });
}

/** Merge lines and images in vertical reading order (top → bottom). */
function buildColumnContent(
  lines: LayoutLine[],
  images: LayoutImage[],
  columnWidth: number,
  opts?: { lightText?: boolean }
): Paragraph[] {
  type Entry = { key: number; para: Paragraph };
  const entries: Entry[] = [];

  const sortedLines = [...lines].sort((a, b) => b.top - a.top);
  let prevBottom: number | null = null;
  for (const line of sortedLines) {
    const gap = prevBottom === null ? 0 : Math.max(0, prevBottom - line.top);
    entries.push({
      key: line.top,
      para: lineToParagraph(line, ptToTwip(Math.min(gap, 12)), opts),
    });
    prevBottom = line.bottom;
  }

  const sortedImages = [...images].sort(
    (a, b) => b.y + b.height - (a.y + a.height)
  );
  for (const img of sortedImages) {
    entries.push({
      key: img.y + img.height,
      para: photoParagraph(img, columnWidth),
    });
  }

  entries.sort((a, b) => b.key - a.key);
  return entries.map((e) => e.para);
}

function buildTwoColumnTable(page: PageLayout): Table {
  const col = page.columns!;
  const leftWidth = col.splitX;
  const rightWidth = page.width - col.splitX;

  const leftChildren = buildColumnContent(
    col.leftLines,
    col.leftImages,
    leftWidth,
    { lightText: true }
  );

  const rightChildren = buildColumnContent(
    col.rightLines,
    col.rightImages,
    rightWidth
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: col.leftWidthPct, type: WidthType.PERCENTAGE },
            shading: {
              fill: col.sidebarColor ?? "2C3E50",
              type: ShadingType.CLEAR,
            },
            margins: { top: 100, bottom: 100, left: 140, right: 100 },
            children: leftChildren.length ? leftChildren : [new Paragraph("")],
          }),
          new TableCell({
            width: { size: 100 - col.leftWidthPct, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 220, right: 140 },
            children: rightChildren.length ? rightChildren : [new Paragraph("")],
          }),
        ],
      }),
    ],
  });
}

function buildSingleColumnContent(page: PageLayout): Paragraph[] {
  const contentBlocks: { top: number; paragraph: Paragraph }[] = [];
  let prevLineBottom: number | null = null;

  for (const line of page.lines) {
    const gap = prevLineBottom === null ? 0 : Math.max(0, prevLineBottom - line.top);
    contentBlocks.push({
      top: line.top,
      paragraph: lineToParagraph(line, ptToTwip(gap)),
    });
    prevLineBottom = line.bottom;
  }

  for (const img of page.images) {
    const topFromPageTop = page.height - (img.y + img.height);
    contentBlocks.push({
      top: img.y + img.height,
      paragraph: new Paragraph({
        spacing: { before: ptToTwip(Math.max(topFromPageTop, 0)), after: 0 },
        indent: { left: ptToTwip(Math.max(img.x, 0)) },
        children: [
          new ImageRun({
            type: imageRunType(img.mime),
            data: img.data,
            transformation: {
              width: ptToPixel(Math.min(img.width, page.width)),
              height: ptToPixel(img.height),
            },
          }),
        ],
      }),
    });
  }

  contentBlocks.sort((a, b) => b.top - a.top);
  return contentBlocks.map((b) => b.paragraph);
}

/**
 * Build DOCX bytes from extracted page layouts (browser or worker).
 */
export async function buildDocxBufferFromLayouts(
  layouts: PageLayout[]
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  for (let pageIndex = 0; pageIndex < layouts.length; pageIndex++) {
    const page = layouts[pageIndex];

    if (page.columns) {
      children.push(buildTwoColumnTable(page));
    } else {
      children.push(...buildSingleColumnContent(page));
    }

    if (pageIndex < layouts.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  const first = layouts[0];
  const buffer = await Packer.toBuffer(
    new Document({
      sections: [
        {
          properties: {
            page: {
              size: {
                width: ptToTwip(first.width),
                height: ptToTwip(first.height),
              },
              margin: { top: 0, right: 0, bottom: 0, left: 0 },
            },
          },
          children,
        },
      ],
    })
  );

  return Buffer.from(buffer);
}

/** Browser fallback: build an editable Word document from a PDF file. */
export async function pdfToDocx(file: File): Promise<Blob> {
  const { layouts } = await extractPdfPageLayouts(file);
  const buffer = await buildDocxBufferFromLayouts(layouts);
  return new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
