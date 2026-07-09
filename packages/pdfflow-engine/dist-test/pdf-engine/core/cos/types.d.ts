/**
 * COS object model (Carousel Object System) - the low-level PDF object types.
 *
 * Design notes:
 * - Strings are stored as raw `Uint8Array` (never JS strings) so encryption and
 *   byte-exact round-trips work. `hex` records the original literal/hex syntax.
 * - Names are decoded to JS strings (they are conceptually text keys) but the
 *   `#xx` escapes are resolved on parse and re-applied on serialize.
 * - Reals keep their original textual form in `raw` when available so we can
 *   reproduce them exactly if needed.
 */
export type CosObject = CosNull | CosBool | CosInt | CosReal | CosString | CosName | CosArray | CosDict | CosStream | CosRef;
export interface CosNull {
    readonly type: "null";
}
export interface CosBool {
    readonly type: "bool";
    readonly value: boolean;
}
export interface CosInt {
    readonly type: "int";
    readonly value: number;
}
export interface CosReal {
    readonly type: "real";
    readonly value: number;
    readonly raw?: string;
}
export interface CosString {
    readonly type: "string";
    readonly bytes: Uint8Array;
    /** true if originally written as <hex>, false if a (literal) string. */
    readonly hex: boolean;
}
export interface CosName {
    readonly type: "name";
    readonly name: string;
}
export interface CosArray {
    readonly type: "array";
    readonly items: CosObject[];
}
export interface CosDict {
    readonly type: "dict";
    readonly map: Map<string, CosObject>;
}
export interface CosStream {
    readonly type: "stream";
    readonly dict: CosDict;
    /** Raw (still-encoded, still-encrypted) stream bytes exactly as in the file. */
    readonly raw: Uint8Array;
}
export interface CosRef {
    readonly type: "ref";
    readonly num: number;
    readonly gen: number;
}
export declare const COS_NULL: CosNull;
export declare function cosBool(value: boolean): CosBool;
export declare function cosInt(value: number): CosInt;
export declare function cosReal(value: number, raw?: string): CosReal;
export declare function cosString(bytes: Uint8Array, hex?: boolean): CosString;
export declare function cosName(name: string): CosName;
export declare function cosArray(items: CosObject[]): CosArray;
export declare function cosDict(entries?: Iterable<[string, CosObject]>): CosDict;
export declare function cosStream(dict: CosDict, raw: Uint8Array): CosStream;
export declare function cosRef(num: number, gen: number): CosRef;
export declare function isNull(o: CosObject | undefined): o is CosNull;
export declare function isBool(o: CosObject | undefined): o is CosBool;
export declare function isInt(o: CosObject | undefined): o is CosInt;
export declare function isReal(o: CosObject | undefined): o is CosReal;
export declare function isNumber(o: CosObject | undefined): o is CosInt | CosReal;
export declare function isString(o: CosObject | undefined): o is CosString;
export declare function isName(o: CosObject | undefined): o is CosName;
export declare function isArray(o: CosObject | undefined): o is CosArray;
export declare function isDict(o: CosObject | undefined): o is CosDict;
export declare function isStream(o: CosObject | undefined): o is CosStream;
export declare function isRef(o: CosObject | undefined): o is CosRef;
/** Numeric value of an int/real, else undefined. */
export declare function asNumber(o: CosObject | undefined): number | undefined;
/** Name string of a name object, else undefined. */
export declare function asName(o: CosObject | undefined): string | undefined;
/** Look up a key in a dict (or a stream's dict); returns undefined if absent. */
export declare function dictGet(o: CosObject | undefined, key: string): CosObject | undefined;
//# sourceMappingURL=types.d.ts.map