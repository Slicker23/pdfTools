/**
 * CosDocument - the read model for a parsed PDF.
 *
 * Responsibilities:
 *  - build the xref chain and trailer
 *  - lazily resolve indirect objects (from offsets or object streams)
 *  - transparently decrypt strings/streams when the file is encrypted
 *  - expose the catalog and a flattened page list (with inherited MediaBox)
 *
 * Object bytes for untouched objects can be copied verbatim via
 * `rawIndirectObjectBytes`, which is what guarantees byte-stable round-trips.
 */
import type { InflateFn } from "./platform";
import { type CosDict, type CosObject, type CosRef } from "./cos/types";
import type { Matrix } from "./content/matrix";
import type { PageTextContent } from "./content/types";
import type { Font } from "./fonts/types";
import { type OutlineFont } from "./fonts/outline-font";
import type { XrefEntry } from "./xref/entries";
export interface OpenOptions {
    inflate: InflateFn;
    /** User or owner password. Defaults to the empty password. */
    password?: string;
    /** Optional bundled TTF bytes for base-14 outline fallback (M9). */
    bundledOutlineFont?: (base14Key: string) => Uint8Array | undefined;
}
export interface PageNode {
    ref?: CosRef;
    dict: CosDict;
    mediaBox: [number, number, number, number];
    width: number;
    height: number;
    rotate: number;
    /** Effective (inheritance-resolved) /Resources dict; empty when absent. */
    resources: CosDict;
}
export declare class CosDocument {
    readonly bytes: Uint8Array;
    readonly trailer: CosDict;
    readonly encrypted: boolean;
    /** True when the document was opened via the xref-recovery fallback. */
    recovered: boolean;
    private readonly xref;
    private readonly inflateFn;
    private readonly bundledOutlineFont?;
    private readonly cache;
    private readonly objStmCache;
    private security?;
    private encryptObjNum;
    private constructor();
    static open(bytes: Uint8Array, options: OpenOptions): Promise<CosDocument>;
    private static openRecovered;
    /** Throws if the catalog / page tree cannot be resolved. */
    private validate;
    private repairRootIfNeeded;
    /** Async-decode every referenced object stream and cache its contents. */
    private prefetchObjectStreams;
    private setupEncryption;
    /** Inflate provided data using the document's platform adapter. */
    inflate(data: Uint8Array): Uint8Array | Promise<Uint8Array>;
    /** Follow indirect references until a direct object is reached. */
    resolve(obj: CosObject | undefined): CosObject;
    /** Look up a dict key and resolve it in one step. */
    get(obj: CosObject | undefined, key: string): CosObject;
    /** Fetch an indirect object by number (generation is informational). */
    getObject(num: number, _gen?: number): CosObject;
    private parseInUse;
    private parseCompressed;
    private loadObjectStream;
    /**
     * Decode a stream body synchronously (Flate + LZW + ASCII85/Hex + RunLength;
     * image codecs pass through). Requires a synchronous inflate adapter; used
     * only as the fallback object-stream path (open() prefetches async).
     */
    private decodeStreamSync;
    /** Fully decode a stream object through its filter chain. */
    decodeStream(stream: CosObject): Promise<Uint8Array>;
    private decryptObject;
    /** The document catalog (/Root). */
    get catalog(): CosDict;
    /** Flattened list of pages with inherited attributes resolved. */
    pages(): PageNode[];
    get pageCount(): number;
    /**
     * The page's decoded content split per source stream. /Contents may be a lone
     * stream, an array of streams, or an indirect reference to either. Each segment
     * carries its content-stream object number (when it came from an indirect
     * reference) so edits can be written back to the exact object.
     */
    pageContentSegments(page: PageNode): Promise<{
        streamNum?: number;
        decoded: Uint8Array;
    }[]>;
    /**
     * The page's decoded content as a single byte stream. Multiple streams are
     * concatenated with a newline between them so that lexical tokens cannot merge
     * across a stream boundary (ISO 32000-1, 7.8.2).
     */
    pageContent(page: PageNode): Promise<Uint8Array>;
    /**
     * Positioned text spans for a page (M3). Interprets the page content stream
     * (and any Form XObjects it invokes) into per-show {@link TextSpan}s carrying
     * page-space origin, text matrix, font ref/size, render mode, fill color, and
     * the raw shown codes. Glyph widths/advances and Unicode are deferred to M4.
     */
    pageSpans(page: PageNode): Promise<PageTextContent>;
    /**
     * CTM within a single content stream immediately before the operator at
     * `regionInStream`. Matches how spans inside that stream are interpreted.
     */
    streamContentStateAt(page: PageNode, streamNum: number, regionInStream: number): Promise<Matrix>;
    /**
     * Build a measured {@link Font} (with reverse encoder) for a resolved /Font
     * dictionary, pre-decoding the streams it needs (/ToUnicode, embedded CMaps).
     * Used by the in-place text editor (M5) to encode replacement text.
     */
    buildFontForDict(dict: CosDict): Promise<Font>;
    /** Build an {@link OutlineFont} with embedded program streams pre-decoded (M6). */
    buildOutlineFontForDict(dict: CosDict): Promise<OutlineFont>;
    /**
     * Build a {@link Font} for every /Font resource reachable from `resources`
     * (including through Form XObjects), pre-decoding the streams each font needs
     * so the synchronous interpreter can measure text. Fonts are keyed by the
     * resolved dict's object identity (stable via the object cache).
     */
    private buildFonts;
    /** Pre-decode a font's /ToUnicode, embedded CMaps, and font program streams. */
    private predecodeFontStreams;
    /** Recursively decode every Form XObject reachable from `resources`. */
    private collectFormXObjects;
    /** Resolve a named XObject for the interpreter (form bytes pre-decoded). */
    private lookupXObject;
    private readMatrix;
    private readRect;
    /**
     * Raw bytes of an indirect object's full "<num> <gen> obj ... endobj" span,
     * copied verbatim from the source (for byte-stable round-trips). Only works
     * for uncompressed objects.
     */
    rawIndirectObjectBytes(num: number): Uint8Array | undefined;
    /** All in-use (uncompressed + compressed) object numbers, ascending. */
    objectNumbers(): number[];
    xrefEntry(num: number): XrefEntry | undefined;
}
//# sourceMappingURL=document.d.ts.map