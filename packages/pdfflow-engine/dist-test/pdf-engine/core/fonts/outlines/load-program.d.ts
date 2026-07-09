/**
 * Load embedded font programs from a PDF FontDescriptor (M6).
 */
import type { CosDocument } from "../../document";
import { type CosObject } from "../../cos/types";
import type { StreamBytes } from "../types";
export interface FontProgram {
    /** Raw FontFile2 or FontFile3 bytes (decoded). */
    bytes: Uint8Array;
    /** FontFile2 (TrueType) or FontFile3 (CFF/Type1). */
    kind: "FontFile2" | "FontFile3";
}
export declare function loadFontProgram(doc: CosDocument, descriptor: CosObject | undefined, getStreamBytes: StreamBytes): FontProgram | undefined;
//# sourceMappingURL=load-program.d.ts.map