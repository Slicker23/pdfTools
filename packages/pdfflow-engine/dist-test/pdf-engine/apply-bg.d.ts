import type { PdfEditBBox } from "@/lib/pdf/edit-model";
/** Sample background RGB (0–1) just outside a bbox via pdfium-native render. */
export declare function sampleBgRgb(input: Buffer, pageIdx: number, bbox: PdfEditBBox, pageHeight: number): Promise<{
    r: number;
    g: number;
    b: number;
}>;
//# sourceMappingURL=apply-bg.d.ts.map