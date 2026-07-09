/**
 * Simple (single-byte) fonts: Type1, TrueType, Type3, MMType1 (ISO 32000-1 9.6).
 *
 * Widths come from `/Widths`+`/FirstChar` (with `/MissingWidth` from the font
 * descriptor), falling back to base-14 AFM metrics keyed by glyph name when the
 * font has no `/Widths`. Unicode comes from `/ToUnicode` when present, otherwise
 * from the resolved encoding via the Adobe Glyph List. Type3 widths are scaled
 * by `/FontMatrix` into the shared 1000-units-per-em convention.
 */
import type { CosDocument } from "../document";
import {
  asName,
  asNumber,
  dictGet,
  isArray,
  isDict,
  isName,
  isStream,
  type CosDict,
  type CosObject,
} from "../cos/types";
import type { EncodeResult, Font, Glyph, StreamBytes } from "./types";
import {
  baseEncodingFromName,
  resolveSimpleEncoding,
  type EncodingParams,
} from "./encoding";
import type { BaseEncodingName } from "./data/encodings";
import { BASE14_METRICS, BASE14_WIDTHS } from "./data/standard-metrics";
import { mapBase14 } from "./base14";
import { parseToUnicode, type ToUnicodeMap } from "./tounicode";

function readNumberArray(doc: CosDocument, obj: CosObject | undefined): number[] | undefined {
  const arr = doc.resolve(obj);
  if (!isArray(arr)) return undefined;
  return arr.items.map((it) => asNumber(doc.resolve(it)) ?? 0);
}

function readMatrix6(doc: CosDocument, obj: CosObject | undefined): number[] | undefined {
  const arr = doc.resolve(obj);
  if (!isArray(arr) || arr.items.length < 6) return undefined;
  const nums = arr.items.slice(0, 6).map((it) => asNumber(doc.resolve(it)));
  if (nums.some((n) => n == null)) return undefined;
  return nums as number[];
}

function readDifferences(doc: CosDocument, obj: CosObject | undefined): Map<number, string> | undefined {
  const arr = doc.resolve(obj);
  if (!isArray(arr)) return undefined;
  const out = new Map<number, string>();
  let code = 0;
  for (const item of arr.items) {
    const r = doc.resolve(item);
    if (r.type === "int" || r.type === "real") {
      code = Math.round(r.value);
    } else if (isName(r)) {
      out.set(code, r.name);
      code++;
    }
  }
  return out.size > 0 ? out : undefined;
}

export function loadSimpleFont(
  doc: CosDocument,
  dict: CosDict,
  getStreamBytes: StreamBytes
): Font {
  const subtype = asName(dictGet(dict, "Subtype")) ?? "Type1";
  const baseFont = asName(dictGet(dict, "BaseFont"));
  const isType3 = subtype === "Type3";

  const firstChar = asNumber(doc.resolve(dictGet(dict, "FirstChar")));
  const widths = readNumberArray(doc, dictGet(dict, "Widths"));

  const descriptor = doc.resolve(dictGet(dict, "FontDescriptor"));
  const flags = asNumber(doc.resolve(dictGet(descriptor, "Flags"))) ?? 0;
  const symbolic = (flags & 4) !== 0 && (flags & 32) === 0;
  const descMissingWidth = asNumber(doc.resolve(dictGet(descriptor, "MissingWidth")));

  // Type3 font matrix scales glyph-space widths into text space; normalise to the
  // shared 1000-units-per-em convention so the interpreter math is uniform.
  const fontMatrix = isType3
    ? readMatrix6(doc, dictGet(dict, "FontMatrix")) ?? [0.001, 0, 0, 0.001, 0, 0]
    : undefined;
  const type3Scale = fontMatrix ? fontMatrix[0]! * 1000 : 1;

  // base-14 metric fallback (also the width source when /Widths is absent).
  const afmKey = mapBase14(baseFont);
  const afmWidths = afmKey ? BASE14_WIDTHS[afmKey] : undefined;
  const afmMetrics = afmKey ? BASE14_METRICS[afmKey] : undefined;

  // Encoding: base + differences.
  const encObj = doc.resolve(dictGet(dict, "Encoding"));
  let baseEncoding: BaseEncodingName | undefined;
  let differences: Map<number, string> | undefined;
  if (isName(encObj)) {
    baseEncoding = baseEncodingFromName(encObj.name);
  } else if (isDict(encObj)) {
    baseEncoding = baseEncodingFromName(asName(dictGet(encObj, "BaseEncoding")));
    differences = readDifferences(doc, dictGet(encObj, "Differences"));
  }
  let standardDefault: BaseEncodingName | undefined;
  if (afmKey === "Symbol") standardDefault = "Symbol";
  else if (afmKey === "ZapfDingbats") standardDefault = "ZapfDingbats";

  const encParams: EncodingParams = { baseEncoding, differences, symbolic, standardDefault };
  const { names, unicode: encUnicode } = resolveSimpleEncoding(encParams);

  // ToUnicode overrides encoding-derived Unicode.
  let toUnicode: ToUnicodeMap | undefined;
  const tuObj = doc.resolve(dictGet(dict, "ToUnicode"));
  if (isStream(tuObj)) {
    const bytes = getStreamBytes(tuObj);
    if (bytes) toUnicode = parseToUnicode(bytes);
  }

  const missingWidth = descMissingWidth ?? 0;

  const widthOfCode = (code: number): number => {
    if (widths && firstChar != null && code >= firstChar && code < firstChar + widths.length) {
      const w = widths[code - firstChar]!;
      return isType3 ? w * type3Scale : w;
    }
    const name = names[code];
    if (afmWidths && name && afmWidths[name] != null) return afmWidths[name]!;
    if (descMissingWidth != null) return descMissingWidth;
    // Base-14 default: space width is a reasonable last resort.
    if (afmWidths && afmWidths["space"] != null) return afmWidths["space"]!;
    return missingWidth;
  };

  const ascent =
    asNumber(doc.resolve(dictGet(descriptor, "Ascent"))) ?? afmMetrics?.ascent;
  const descent =
    asNumber(doc.resolve(dictGet(descriptor, "Descent"))) ?? afmMetrics?.descent;
  const fontBBox =
    (readMatrix6BBox(doc, dictGet(descriptor, "FontBBox")) ?? afmMetrics?.bbox) as
      | [number, number, number, number]
      | undefined;

  const decode = (codes: Uint8Array): Glyph[] => {
    const out: Glyph[] = new Array(codes.length);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!;
      const uni = toUnicode?.lookup(code) ?? encUnicode[code];
      out[i] = {
        code,
        unicode: uni,
        width: widthOfCode(code),
        bytes: codes.subarray(i, i + 1),
      };
    }
    return out;
  };

  // Reverse map (Unicode -> single-byte code) for in-place editing. Prefer the
  // ToUnicode mapping, then the encoding; lower codes win on ties.
  const inverse = new Map<string, number>();
  for (let code = 0; code < 256; code++) {
    const uni = toUnicode?.lookup(code) ?? encUnicode[code];
    if (uni && uni.length > 0 && !inverse.has(uni)) inverse.set(uni, code);
  }

  const encode = (text: string): EncodeResult => {
    const codes: number[] = [];
    const unencodable: string[] = [];
    for (const ch of text) {
      const code = inverse.get(ch);
      if (code == null) {
        unencodable.push(ch);
        continue;
      }
      codes.push(code);
    }
    return { bytes: Uint8Array.from(codes), codes, unencodable };
  };

  return {
    subtype,
    isType0: false,
    decode,
    encode,
    widthOfCode,
    missingWidth,
    ascent,
    descent,
    fontBBox,
  };
}

function readMatrix6BBox(
  doc: CosDocument,
  obj: CosObject | undefined
): [number, number, number, number] | undefined {
  const arr = doc.resolve(obj);
  if (!isArray(arr) || arr.items.length < 4) return undefined;
  const nums = arr.items.slice(0, 4).map((it) => asNumber(doc.resolve(it)));
  if (nums.some((n) => n == null)) return undefined;
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
}
