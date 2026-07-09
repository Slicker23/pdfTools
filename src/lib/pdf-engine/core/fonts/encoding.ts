/**
 * Simple-font encoding resolution (ISO 32000-1, 9.6.5 + Annex D).
 *
 * Produces two parallel 256-entry tables for a simple (single-byte) font:
 *   - `names`   : character code -> glyph name
 *   - `unicode` : character code -> Unicode string (glyph name via the AGL)
 *
 * The base encoding is chosen from `/Encoding` (a name) or `/BaseEncoding`, with
 * `/Differences` layered on top. Unicode is derived from the glyph name through
 * the Adobe Glyph List plus the algorithmic `uniXXXX` / `uXXXXXX` conventions.
 * ToUnicode (handled by the font loader) takes precedence over this mapping.
 */
import { AGL } from "./data/glyph-list";
import { BASE_ENCODINGS, type BaseEncodingName } from "./data/encodings";

const UNI_RE = /^uni([0-9A-Fa-f]{4})+$/;
const U_RE = /^u([0-9A-Fa-f]{4,6})$/;

/** Resolve a glyph name to a Unicode string (AGL + uniXXXX/uXXXXXX + fallbacks). */
export function glyphNameToUnicode(name: string): string | undefined {
  if (!name) return undefined;
  const direct = AGL[name];
  if (direct !== undefined) return direct;

  // uniXXXX (one or more 4-hex code units, e.g. "uni00410042").
  if (UNI_RE.test(name)) {
    let out = "";
    for (let i = 3; i + 4 <= name.length; i += 4) {
      const cp = parseInt(name.slice(i, i + 4), 16);
      if (cp >= 0xd800 && cp <= 0xdfff) return undefined; // lone surrogate
      out += String.fromCharCode(cp);
    }
    return out || undefined;
  }

  // uXXXX..XXXXXX (a single 4-6 hex code point).
  const um = U_RE.exec(name);
  if (um) {
    const cp = parseInt(um[1]!, 16);
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return undefined;
    return String.fromCodePoint(cp);
  }

  // Ligature names joined by underscores, e.g. "f_i".
  if (name.includes("_")) {
    let out = "";
    for (const part of name.split("_")) {
      const u = glyphNameToUnicode(part);
      if (u === undefined) return undefined;
      out += u;
    }
    return out || undefined;
  }

  // Suffixed variant, e.g. "a.sc" / "g12.alt" -> try the base name.
  const dot = name.indexOf(".");
  if (dot > 0) return glyphNameToUnicode(name.slice(0, dot));

  return undefined;
}

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
export function resolveSimpleEncoding(params: EncodingParams): SimpleEncoding {
  const base = pickBase(params);
  const names: (string | undefined)[] = new Array(256);
  for (let c = 0; c < 256; c++) {
    const g = base ? base[c] : "";
    names[c] = g ? g : undefined;
  }
  if (params.differences) {
    for (const [code, name] of params.differences) {
      if (code >= 0 && code < 256) names[code] = name;
    }
  }
  const unicode: (string | undefined)[] = new Array(256);
  for (let c = 0; c < 256; c++) {
    const g = names[c];
    unicode[c] = g ? glyphNameToUnicode(g) : undefined;
  }
  return { names, unicode };
}

function pickBase(params: EncodingParams): readonly string[] | undefined {
  if (params.baseEncoding) return BASE_ENCODINGS[params.baseEncoding];
  if (params.standardDefault) return BASE_ENCODINGS[params.standardDefault];
  // A symbolic font nominally uses its font program's built-in encoding, which
  // we do not parse. Rather than yield no text at all, fall back to
  // StandardEncoding so ASCII/Latin codes still decode (matches pdfium/pdf.js);
  // ToUnicode and /Differences, when present, still take precedence.
  return BASE_ENCODINGS.StandardEncoding;
}

/** Map a PDF /Encoding or /BaseEncoding name to a known base encoding. */
export function baseEncodingFromName(name: string | undefined): BaseEncodingName | undefined {
  switch (name) {
    case "WinAnsiEncoding":
      return "WinAnsiEncoding";
    case "MacRomanEncoding":
      return "MacRomanEncoding";
    case "StandardEncoding":
      return "StandardEncoding";
    case "PDFDocEncoding":
      return "PDFDocEncoding";
    case "MacExpertEncoding":
      // Not commonly used for Latin text; fall back to Standard for Unicode.
      return "StandardEncoding";
    default:
      return undefined;
  }
}
