import { type CosDict } from "../cos/types";
import type { XrefEntry } from "./entries";
export interface ClassicXref {
    entries: XrefEntry[];
    trailer: CosDict;
}
/** Parse a classic xref section that begins (at `offset`) with the `xref` keyword. */
export declare function parseClassicXref(buf: Uint8Array, offset: number): ClassicXref;
//# sourceMappingURL=classic.d.ts.map