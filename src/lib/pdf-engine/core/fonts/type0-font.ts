/**
 * Type0 composite fonts with a CIDFont descendant (ISO 32000-1, 9.7).
 *
 * The `/Encoding` CMap maps multi-byte character codes to CIDs; `/W` and `/DW`
 * on the descendant CIDFont give per-CID advance widths. Unicode comes from
 * `/ToUnicode` (predefined CID->Unicode CMaps are deferred). Latin/European
 * usage is typically Identity-H with an embedded font and a ToUnicode map.
 */
import type { CosDocument } from "../document";
import {
  asName,
  asNumber,
  dictGet,
  isArray,
  isName,
  isStream,
  type CosDict,
  type CosObject,
} from "../cos/types";
import type { EncodeResult, Font, Glyph, StreamBytes } from "./types";
import { identityCMap, parseCMapStream, predefinedCMap, type CMap } from "./cmap";
import { parseToUnicode, type ToUnicodeMap } from "./tounicode";

function buildWidths(doc: CosDocument, wArr: CosObject | undefined): Map<number, number> {
  const map = new Map<number, number>();
  const arr = doc.resolve(wArr);
  if (!isArray(arr)) return map;
  const items = arr.items;
  let i = 0;
  while (i < items.length) {
    const first = asNumber(doc.resolve(items[i]));
    i++;
    if (first == null) break;
    const second = doc.resolve(items[i]);
    if (isArray(second)) {
      for (let j = 0; j < second.items.length; j++) {
        const w = asNumber(doc.resolve(second.items[j]));
        if (w != null) map.set(first + j, w);
      }
      i++;
    } else {
      const last = asNumber(second);
      i++;
      const w = asNumber(doc.resolve(items[i]));
      i++;
      if (last == null || w == null) break;
      for (let cid = first; cid <= last && cid - first < 65536; cid++) map.set(cid, w);
    }
  }
  return map;
}

export function loadType0Font(
  doc: CosDocument,
  dict: CosDict,
  getStreamBytes: StreamBytes
): Font {
  // Encoding CMap.
  const encObj = doc.resolve(dictGet(dict, "Encoding"));
  let cmap: CMap;
  if (isName(encObj)) {
    cmap = predefinedCMap(encObj.name) ?? identityCMap(0);
  } else if (isStream(encObj)) {
    const bytes = getStreamBytes(encObj);
    cmap = bytes ? parseCMapStream(bytes) : identityCMap(0);
  } else {
    cmap = identityCMap(0);
  }

  // Descendant CIDFont.
  const descArr = doc.resolve(dictGet(dict, "DescendantFonts"));
  const descendant = isArray(descArr) ? doc.resolve(descArr.items[0]) : undefined;
  const dw = asNumber(doc.resolve(dictGet(descendant, "DW"))) ?? 1000;
  const widths = buildWidths(doc, dictGet(descendant, "W"));

  const descriptor = doc.resolve(dictGet(descendant, "FontDescriptor"));
  const ascent = asNumber(doc.resolve(dictGet(descriptor, "Ascent")));
  const descent = asNumber(doc.resolve(dictGet(descriptor, "Descent")));
  const fontBBox = readBBox(doc, dictGet(descriptor, "FontBBox"));

  // ToUnicode (keyed by character code, not CID).
  let toUnicode: ToUnicodeMap | undefined;
  const tuObj = doc.resolve(dictGet(dict, "ToUnicode"));
  if (isStream(tuObj)) {
    const bytes = getStreamBytes(tuObj);
    if (bytes) toUnicode = parseToUnicode(bytes);
  }

  // A `*-UCS2-*` CMap consumes 2-byte UCS-2 (i.e. UTF-16BE) character codes, so
  // when there is no ToUnicode the character code itself IS the Unicode value.
  // Detect this from the CMap name / BaseFont and fall back accordingly. This
  // stays correct (not a guess) because UCS2 CMap input == Unicode.
  const ucs2 =
    /UCS2/i.test(asName(dictGet(dict, "BaseFont")) ?? "") ||
    (isName(encObj) && /UCS2/i.test(encObj.name)) ||
    (isStream(encObj) && /UCS2/i.test(asName(dictGet(encObj, "CMapName")) ?? ""));

  const widthOfCid = (cid: number): number => widths.get(cid) ?? dw;

  const decode = (codes: Uint8Array): Glyph[] => {
    const out: Glyph[] = [];
    let pos = 0;
    while (pos < codes.length) {
      const { code, cid, byteLen } = cmap.next(codes, pos);
      const len = byteLen > 0 ? byteLen : 1;
      out.push({
        code,
        cid,
        unicode:
          toUnicode?.lookup(code) ??
          (ucs2 && code > 0 && code <= 0xffff ? String.fromCharCode(code) : undefined),
        width: widthOfCid(cid),
        bytes: codes.subarray(pos, pos + len),
      });
      pos += len;
    }
    return out;
  };

  // Reverse map (Unicode -> character code) for in-place editing. Only available
  // when a ToUnicode map exists; codes are emitted big-endian as 2 bytes, which
  // covers the Latin case (Identity-H and predefined UCS2 CMaps). Codes outside
  // the BMP (> 0xffff) are treated as non-editable.
  let inverse: Map<string, number> | undefined;
  if (toUnicode) {
    inverse = new Map<string, number>();
    for (const [code, uni] of toUnicode.map) {
      if (uni && uni.length > 0 && code <= 0xffff && !inverse.has(uni)) inverse.set(uni, code);
    }
  }

  const encode = inverse
    ? (text: string): EncodeResult => {
        const codes: number[] = [];
        const bytes: number[] = [];
        const unencodable: string[] = [];
        for (const ch of text) {
          const code = inverse!.get(ch);
          if (code == null) {
            unencodable.push(ch);
            continue;
          }
          codes.push(code);
          bytes.push((code >> 8) & 0xff, code & 0xff);
        }
        return { bytes: Uint8Array.from(bytes), codes, unencodable };
      }
    : undefined;

  return {
    subtype: "Type0",
    isType0: true,
    decode,
    encode,
    // For Type0, `widthOfCode` interprets its argument as a CID.
    widthOfCode: widthOfCid,
    missingWidth: dw,
    ascent,
    descent,
    fontBBox,
  };
}

function readBBox(
  doc: CosDocument,
  obj: CosObject | undefined
): [number, number, number, number] | undefined {
  const arr = doc.resolve(obj);
  if (!isArray(arr) || arr.items.length < 4) return undefined;
  const nums = arr.items.slice(0, 4).map((it) => asNumber(doc.resolve(it)));
  if (nums.some((n) => n == null)) return undefined;
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
}
