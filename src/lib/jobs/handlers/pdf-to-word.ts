import { convertWithLibreOffice } from "@/lib/jobs/libreoffice";
import { analyzePdfColumns } from "@/lib/jobs/pdf-detect";
import { fixCvDocxSidebarBuffer } from "@/lib/convert/fix-cv-docx";
import { extractPdfPageLayoutsOnServer } from "@/lib/pdf/layout-extract.server";
import { buildDocxBufferFromLayouts } from "@/lib/pdf/to-word";

const CV_SIDEBAR_FILL = "2C3E50";

/**
 * Server PDF→Word: LibreOffice for fidelity (especially CVs), layout rebuild as fallback.
 * CV two-column PDFs get a dark sidebar rectangle so white sidebar text is visible.
 */
export async function handlePdfToWordJob(input: Buffer): Promise<Buffer> {
  const columns = await analyzePdfColumns(input);

  const lo = await convertWithLibreOffice(input, "pdf_to_word");
  if (lo && lo.length > 0) {
    if (columns.twoColumn) {
      return fixCvDocxSidebarBuffer(lo, CV_SIDEBAR_FILL, {
        sidebarWidthPt: columns.splitX,
        pageHeightPt: columns.pageHeight,
      });
    }
    return lo;
  }

  const { layouts } = await extractPdfPageLayoutsOnServer(new Uint8Array(input));
  return buildDocxBufferFromLayouts(layouts);
}
