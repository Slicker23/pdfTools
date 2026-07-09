/** Shared cross-reference entry types produced by classic tables and xref streams. */
import type { CosDict } from "../cos/types";
export interface XrefInUse {
    kind: "inuse";
    num: number;
    gen: number;
    offset: number;
}
export interface XrefCompressed {
    kind: "compressed";
    num: number;
    /** object number of the /ObjStm that contains this object */
    streamNum: number;
    /** index of this object within the object stream */
    index: number;
}
export interface XrefFree {
    kind: "free";
    num: number;
    gen: number;
}
export type XrefEntry = XrefInUse | XrefCompressed | XrefFree;
export interface XrefResult {
    entries: Map<number, XrefEntry>;
    trailer: CosDict;
}
//# sourceMappingURL=entries.d.ts.map