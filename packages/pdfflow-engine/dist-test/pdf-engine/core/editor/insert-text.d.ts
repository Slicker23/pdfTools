/**
 * Native text insertion (M5): append BT…ET runs to a page content stream.
 */
import type { DeflateFn, InflateFn } from "../platform";
import type { PdfEditBlockPatch } from "@/lib/pdf/edit-model";
export interface InsertResult {
    output: Uint8Array;
    inserted: number;
    skipped: number;
    insertedIds: string[];
    skippedIds: string[];
}
/** Apply user-created text blocks by appending native content-stream operators. */
export declare function insertTextBlocks(input: Uint8Array, blocks: PdfEditBlockPatch[], deflate?: DeflateFn, inflate?: InflateFn): Promise<InsertResult>;
//# sourceMappingURL=insert-text.d.ts.map