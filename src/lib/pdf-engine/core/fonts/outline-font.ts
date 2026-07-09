/**
 * Outline-capable font wrapper (M6).
 *
 * Combines M4 {@link Font} metrics/encoding with glyph outline extraction from
 * embedded font programs.
 */
import type { CosDocument } from "../document";
import { asName, dictGet, isArray, isName, isStream, type CosDict, type CosObject } from "../cos/types";
import type { Font, Glyph, StreamBytes } from "./types";
import { loadFont } from "./font";
import { loadFontProgram } from "./outlines/load-program";
import { parseFontProgram } from "./outlines/cff";
import { cffGlyphOutline } from "./outlines/charstring-type2";
import { cffResolver, cidIdentityResolver, trueTypeResolver, type GidResolver } from "./outlines/gid";
import type { GlyphOutline } from "./outlines/types";
import { resolveSimpleEncoding, baseEncodingFromName, type EncodingParams } from "./encoding";
import { mapBase14 } from "./base14";
import { type3HasSupportedOutlines } from "./outlines/type3";

export interface OutlineFont extends Font {
  hasOutlines: boolean;
  outlineForCode(code: number, unicode?: string): GlyphOutline | undefined;
  outlineForCid(cid: number): GlyphOutline | undefined;
  outlineForGlyph(gid: number): GlyphOutline | undefined;
}

function readDifferences(doc: CosDocument, obj: CosObject | undefined): Map<number, string> | undefined {
  const arr = doc.resolve(obj);
  if (arr.type !== "array") return undefined;
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

function buildCodeToName(doc: CosDocument, dict: CosDict): (code: number) => string | undefined {
  const encObj = doc.resolve(dictGet(dict, "Encoding"));
  let baseEncoding = undefined as ReturnType<typeof baseEncodingFromName>;
  let differences: Map<number, string> | undefined;
  if (isName(encObj)) {
    baseEncoding = baseEncodingFromName(encObj.name);
  } else if (encObj.type === "dict") {
    baseEncoding = baseEncodingFromName(asName(dictGet(encObj, "BaseEncoding")));
    differences = readDifferences(doc, dictGet(encObj, "Differences"));
  }
  const params: EncodingParams = { baseEncoding, differences, symbolic: false };
  const { names } = resolveSimpleEncoding(params);
  return (code: number) => names[code];
}

function cidToGidMap(
  doc: CosDocument,
  descendant: CosObject | undefined,
  getStreamBytes: StreamBytes
): GidResolver | undefined {
  if (!descendant || descendant.type !== "dict") return undefined;
  const mapObj = doc.resolve(dictGet(descendant, "CIDToGIDMap"));
  if (isName(mapObj) && mapObj.name === "Identity") {
    return cidIdentityResolver();
  }
  if (isStream(mapObj)) {
    const bytes = getStreamBytes(mapObj);
    if (!bytes) return undefined;
    return {
      gidForCode() {
        return undefined;
      },
      gidForCid(cid: number) {
        const off = cid * 2;
        if (off + 1 >= bytes.length) return undefined;
        return (bytes[off]! << 8) | bytes[off + 1]!;
      },
    };
  }
  return undefined;
}

export function loadOutlineFont(
  doc: CosDocument,
  dict: CosDict,
  getStreamBytes: StreamBytes,
  bundledOutlineFont?: (base14Key: string) => Uint8Array | undefined
): OutlineFont {
  const font = loadFont(doc, dict, getStreamBytes);
  const subtype = asName(dictGet(dict, "Subtype")) ?? "Type1";

  if (subtype === "Type3" && !type3HasSupportedOutlines(doc, dict)) {
    return {
      ...font,
      hasOutlines: false,
      outlineForGlyph: () => undefined,
      outlineForCode: () => undefined,
      outlineForCid: () => undefined,
    };
  }

  let descriptor = doc.resolve(dictGet(dict, "FontDescriptor"));
  if (subtype === "Type0") {
    const descArr = doc.resolve(dictGet(dict, "DescendantFonts"));
    const descendant = isArray(descArr) ? doc.resolve(descArr.items[0]) : undefined;
    if (descendant?.type === "dict") {
      descriptor = doc.resolve(dictGet(descendant, "FontDescriptor"));
    }
  }

  const program = loadFontProgram(doc, descriptor, getStreamBytes);
  let parsed = program ? parseFontProgram(program.bytes) : undefined;

  if (!parsed && bundledOutlineFont) {
    const baseFont = asName(dictGet(dict, "BaseFont"));
    const base14Key = mapBase14(baseFont);
    if (base14Key) {
      const fallbackBytes = bundledOutlineFont(base14Key);
      if (fallbackBytes) parsed = parseFontProgram(fallbackBytes);
    }
  }

  let getOutline: (gid: number) => GlyphOutline | undefined = () => undefined;
  let resolver: GidResolver = {
    gidForCode: () => undefined,
    gidForCid: () => undefined,
  };

  if (parsed?.kind === "truetype") {
    const face = parsed.face;
    const encObj = doc.resolve(dictGet(dict, "Encoding"));
    let names: string[] = [];
    if (subtype !== "Type0") {
      const codeToName = buildCodeToName(doc, dict);
      names = Array.from({ length: 256 }, (_, i) => codeToName(i) ?? "");
    }
    resolver = trueTypeResolver(face, names);
    getOutline = (gid) => face.getGlyphOutline(gid);
  } else if (parsed?.kind === "cff") {
    const cff = parsed.cff;
    const codeToName = buildCodeToName(doc, dict);
    const charsetNames: string[] = [];
    const seen = new Set<string>();
    for (let code = 0; code < 256; code++) {
      const name = codeToName(code);
      if (name && !seen.has(name)) {
        seen.add(name);
        charsetNames.push(name);
      }
    }
    resolver = cffResolver(cff, codeToName, charsetNames.length ? charsetNames : undefined);
    getOutline = (gid) => cffGlyphOutline(cff, gid);
  }

  if (subtype === "Type0") {
    const descArr = doc.resolve(dictGet(dict, "DescendantFonts"));
    const descendant = isArray(descArr) ? doc.resolve(descArr.items[0]) : undefined;
    const cidResolver = cidToGidMap(doc, descendant, getStreamBytes);
    if (cidResolver) {
      const inner = resolver;
      resolver = {
        gidForCode(code, unicode) {
          return inner.gidForCode(code, unicode);
        },
        gidForCid(cid) {
          return cidResolver.gidForCid(cid) ?? inner.gidForCid(cid);
        },
      };
    }
  }

  const hasOutlines = parsed != null;

  const outlineForGlyph = (gid: number): GlyphOutline | undefined => {
    if (!hasOutlines) return undefined;
    const o = getOutline(gid);
    return o && o.segments.length > 0 ? o : undefined;
  };

  return {
    ...font,
    hasOutlines,
    outlineForGlyph,
    outlineForCode(code: number, unicode?: string) {
      const gid = resolver.gidForCode(code, unicode);
      return gid != null ? outlineForGlyph(gid) : undefined;
    },
    outlineForCid(cid: number) {
      const gid = resolver.gidForCid(cid);
      return gid != null ? outlineForGlyph(gid) : undefined;
    },
    decode(codes: Uint8Array): Glyph[] {
      const glyphs = font.decode(codes);
      return glyphs.map((g) => {
        const gid =
          g.cid != null
            ? resolver.gidForCid(g.cid)
            : resolver.gidForCode(g.code, g.unicode);
        return gid != null ? { ...g, gid } : g;
      });
    },
  };
}
