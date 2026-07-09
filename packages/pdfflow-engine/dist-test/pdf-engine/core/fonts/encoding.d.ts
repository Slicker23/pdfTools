import { type BaseEncodingName } from "./data/encodings";
/** Resolve a glyph name to a Unicode string (AGL + uniXXXX/uXXXXXX + fallbacks). */
export declare function glyphNameToUnicode(name: string): string | undefined;
export interface SimpleEncoding {
    names: (string | undefined)[];
    unicode: (string | undefined)[];
}
export interface EncodingParams {
    /** Base encoding from /Encoding (name) or /BaseEncoding; undefined = default. */
    baseEncoding?: BaseEncodingName;
    /** /Differences overrides: code -> glyph name. */
    differences?: Map<number, string>;
    /** True for symbolic fonts (FontDescriptor /Flags bit 3). */
    symbolic?: boolean;
    /**
     * Default base for standard fonts with a built-in encoding (Symbol /
     * ZapfDingbats), or the nonsymbolic fallback (StandardEncoding). Used only
     * when no explicit base encoding is given.
     */
    standardDefault?: BaseEncodingName;
}
/** Build the code->name and code->unicode tables for a simple font. */
export declare function resolveSimpleEncoding(params: EncodingParams): SimpleEncoding;
/** Map a PDF /Encoding or /BaseEncoding name to a known base encoding. */
export declare function baseEncodingFromName(name: string | undefined): BaseEncodingName | undefined;
//# sourceMappingURL=encoding.d.ts.map