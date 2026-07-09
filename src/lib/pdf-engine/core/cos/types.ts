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

export type CosObject =
  | CosNull
  | CosBool
  | CosInt
  | CosReal
  | CosString
  | CosName
  | CosArray
  | CosDict
  | CosStream
  | CosRef;

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

export const COS_NULL: CosNull = { type: "null" };

export function cosBool(value: boolean): CosBool {
  return { type: "bool", value };
}
export function cosInt(value: number): CosInt {
  return { type: "int", value };
}
export function cosReal(value: number, raw?: string): CosReal {
  return { type: "real", value, raw };
}
export function cosString(bytes: Uint8Array, hex = false): CosString {
  return { type: "string", bytes, hex };
}
export function cosName(name: string): CosName {
  return { type: "name", name };
}
export function cosArray(items: CosObject[]): CosArray {
  return { type: "array", items };
}
export function cosDict(entries?: Iterable<[string, CosObject]>): CosDict {
  return { type: "dict", map: new Map(entries) };
}
export function cosStream(dict: CosDict, raw: Uint8Array): CosStream {
  return { type: "stream", dict, raw };
}
export function cosRef(num: number, gen: number): CosRef {
  return { type: "ref", num, gen };
}

export function isNull(o: CosObject | undefined): o is CosNull {
  return !!o && o.type === "null";
}
export function isBool(o: CosObject | undefined): o is CosBool {
  return !!o && o.type === "bool";
}
export function isInt(o: CosObject | undefined): o is CosInt {
  return !!o && o.type === "int";
}
export function isReal(o: CosObject | undefined): o is CosReal {
  return !!o && o.type === "real";
}
export function isNumber(o: CosObject | undefined): o is CosInt | CosReal {
  return !!o && (o.type === "int" || o.type === "real");
}
export function isString(o: CosObject | undefined): o is CosString {
  return !!o && o.type === "string";
}
export function isName(o: CosObject | undefined): o is CosName {
  return !!o && o.type === "name";
}
export function isArray(o: CosObject | undefined): o is CosArray {
  return !!o && o.type === "array";
}
export function isDict(o: CosObject | undefined): o is CosDict {
  return !!o && o.type === "dict";
}
export function isStream(o: CosObject | undefined): o is CosStream {
  return !!o && o.type === "stream";
}
export function isRef(o: CosObject | undefined): o is CosRef {
  return !!o && o.type === "ref";
}

/** Numeric value of an int/real, else undefined. */
export function asNumber(o: CosObject | undefined): number | undefined {
  return isNumber(o) ? o.value : undefined;
}

/** Name string of a name object, else undefined. */
export function asName(o: CosObject | undefined): string | undefined {
  return isName(o) ? o.name : undefined;
}

/** Look up a key in a dict (or a stream's dict); returns undefined if absent. */
export function dictGet(o: CosObject | undefined, key: string): CosObject | undefined {
  if (isDict(o)) return o.map.get(key);
  if (isStream(o)) return o.dict.map.get(key);
  return undefined;
}
