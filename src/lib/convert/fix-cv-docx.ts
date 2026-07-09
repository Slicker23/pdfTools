import JSZip from "jszip";

/** 1 pt = 12700 EMU in WordprocessingML. */
function ptToEmu(pt: number): number {
  return Math.round(pt * 12700);
}

const DEFAULT_SIDEBAR_FILL = "2C3E50";

export interface CvSidebarOptions {
  sidebarWidthPt?: number;
  pageHeightPt?: number;
  fillColor?: string;
}

function buildSidebarParagraph(fill: string, widthPt: number, heightPt: number): string {
  const w = ptToEmu(widthPt);
  const h = ptToEmu(heightPt);

  return `<w:p><w:pPr><w:spacing w:after="0" w:before="0"/></w:pPr><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="1" locked="1" layoutInCell="0" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${w}" cy="${h}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="9001" name="PdfFlowSidebar"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln w="0"><a:noFill/></a:ln></wps:spPr><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
}

async function applySidebarFix(
  docx: Buffer | ArrayBuffer,
  opts: CvSidebarOptions = {}
): Promise<Buffer> {
  const fill = (opts.fillColor ?? DEFAULT_SIDEBAR_FILL).replace("#", "").toUpperCase().slice(0, 6);
  const sidebarWidthPt = opts.sidebarWidthPt ?? 226;
  const pageHeightPt = opts.pageHeightPt ?? 842;

  const zip = await JSZip.loadAsync(docx);
  const docPath = "word/document.xml";
  const file = zip.file(docPath);
  if (!file) return Buffer.isBuffer(docx) ? docx : Buffer.from(docx);

  let xml = await file.async("string");
  if (xml.includes('name="PdfFlowSidebar"')) {
    return Buffer.isBuffer(docx) ? docx : Buffer.from(docx);
  }

  xml = xml.replace(
    "<w:body>",
    `<w:body>${buildSidebarParagraph(fill, sidebarWidthPt, pageHeightPt)}`
  );

  zip.file(docPath, xml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

/**
 * LibreOffice PDF import keeps sidebar text (white) but drops the dark background.
 * Inject a full-height sidebar rectangle aligned to the PDF column split.
 */
export async function fixCvDocxSidebar(
  docxBlob: Blob,
  fillColor = DEFAULT_SIDEBAR_FILL,
  opts: Omit<CvSidebarOptions, "fillColor"> = {}
): Promise<Blob> {
  const out = await applySidebarFix(await docxBlob.arrayBuffer(), {
    ...opts,
    fillColor,
  });
  return new Blob([new Uint8Array(out)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/** Node/worker variant — same sidebar injection on raw DOCX bytes. */
export async function fixCvDocxSidebarBuffer(
  docx: Buffer,
  fillColor = DEFAULT_SIDEBAR_FILL,
  opts: Omit<CvSidebarOptions, "fillColor"> = {}
): Promise<Buffer> {
  return applySidebarFix(docx, { ...opts, fillColor });
}
