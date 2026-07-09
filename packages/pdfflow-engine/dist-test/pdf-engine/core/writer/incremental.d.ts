import type { DeflateFn } from "../platform";
import { type CosArray, type CosObject, type CosRef } from "../cos/types";
export interface IncrementalObject {
    num: number;
    gen: number;
    obj: CosObject;
}
export interface WriteIncrementalOptions {
    /** Original file bytes (copied verbatim). */
    original: Uint8Array;
    /** Objects to replace or add. */
    updates: IncrementalObject[];
    /** Catalog reference for the trailer /Root. */
    root: CosRef;
    /** /Size of the base document (max existing object number + 1). */
    size: number;
    /** /ID array, carried through when present. */
    id?: CosArray;
    /** /Encrypt reference, carried through when present. */
    encrypt?: CosRef;
    /** Byte offset of the file's previous xref (its last `startxref` value). */
    prevStartxref: number;
    /** Match the source's newest xref section: true = XRef stream, false = classic. */
    useXrefStream: boolean;
    /**
     * zlib deflate, required when `useXrefStream` is true (the XRef stream parser
     * always Flate-decodes the body). When absent, an XRef-stream file falls back
     * to appending a classic `xref` table, which readers still follow via /Prev.
     */
    deflate?: DeflateFn;
    /**
     * Recovered-file mode: the source's own xref/`/Prev` chain is untrustworthy, so
     * emit a single self-contained classic xref that lists *every* object (originals
     * at `baseOffsets`, changed ones at their appended offsets) with no `/Prev`.
     * The original bytes are still appended verbatim, so untouched objects keep
     * their positions. Requires `baseOffsets`.
     */
    standalone?: boolean;
    /** All existing in-use objects: num -> {offset, gen}. Used when `standalone`. */
    baseOffsets?: Map<number, {
        offset: number;
        gen: number;
    }>;
}
export declare function writeIncrementalUpdate(opts: WriteIncrementalOptions): Promise<Uint8Array>;
//# sourceMappingURL=incremental.d.ts.map