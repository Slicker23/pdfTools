/**
 * Page font resource matching for native font-family / bold / italic swaps (M9).
 *
 * Prefers reusing fonts already registered on the page `/Resources/Font` before
 * embedding new programs.
 */
import type { CosDocument, PageNode } from "../document";
import { asName, cosDict, cosName, dictGet, isDict, type CosDict } from "../cos/types";
import { stripSubsetPrefix } from "../fonts/base14";
import { listResourceEntries } from "../resources";
import type { Font } from "../fonts/types";
import type { PdfEditFont } from "../../../pdf/edit-model";

export interface MatchedPageFont {
  fontRef: string;
  fontDict: CosDict;
}

export function parseFontVariant(baseFont: string): {
  name: string;
  bold: boolean;
  italic: boolean;
} {
  const raw = stripSubsetPrefix(baseFont);
  const lower = raw.toLowerCase();
  const bold = /bold|black|heavy|semibold|demi/.test(lower);
  const italic = /italic|oblique/.test(lower);
  let name = raw.replace(/[-,]?(Bold|Italic|Oblique|Regular|MT)$/gi, "").trim();
  if (!name) name = "Helvetica";
  return { name, bold, italic };
}

function genericFamily(name: string): "sans" | "serif" | "mono" {
  const lower = name.toLowerCase();
  if (/courier|mono/.test(lower)) return "mono";
  if (
    /times|georgia|serif/.test(lower) &&
    !/sans|sans-serif|sansserif/.test(lower)
  ) {
    return "serif";
  }
  return "sans";
}

function familiesCompatible(a: string, b: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (na.includes(nb) || nb.includes(na)) return true;
  return genericFamily(a) === genericFamily(b);
}

export function fontMatchesTarget(baseFont: string, target: PdfEditFont): boolean {
  const parsed = parseFontVariant(baseFont);
  return (
    familiesCompatible(parsed.name, target.name) &&
    parsed.bold === Boolean(target.bold) &&
    parsed.italic === Boolean(target.italic)
  );
}

/** Find a page `/Font` resource matching the requested style variant. */
export async function matchPageFontRef(
  doc: CosDocument,
  page: PageNode,
  target: PdfEditFont
): Promise<MatchedPageFont | undefined> {
  const entries = listResourceEntries(doc, page.resources, "Font");
  for (const [ref, obj] of entries) {
    if (!isDict(obj)) continue;
    const baseFont = asName(dictGet(obj, "BaseFont")) ?? "";
    if (fontMatchesTarget(baseFont, target)) {
      return { fontRef: ref, fontDict: obj };
    }
  }
  return undefined;
}

/** Resolve a usable font for edits; currently matches existing page resources only. */
export async function ensureFontResource(
  doc: CosDocument,
  page: PageNode,
  target: PdfEditFont
): Promise<{ fontRef: string; font: Font } | undefined> {
  const matched = await matchPageFontRef(doc, page, target);
  if (!matched) return undefined;
  const font = await doc.buildFontForDict(matched.fontDict);
  if (!font.encode) return undefined;
  return { fontRef: matched.fontRef, font };
}

/** Page `/Resources/Font` entry that encodes all of `text` (never form-local refs). */
export async function resolveInsertFontForPage(
  doc: CosDocument,
  page: PageNode,
  text: string,
  target: PdfEditFont
): Promise<{ fontRef: string; font: Font } | undefined> {
  const tryFont = async (fontRef: string, fontDict: CosDict): Promise<{ fontRef: string; font: Font } | undefined> => {
    const font = await doc.buildFontForDict(fontDict);
    if (!font.encode) return undefined;
    const enc = font.encode(text);
    if (enc.unencodable.length > 0) return undefined;
    return { fontRef, font };
  };

  const matched = await matchPageFontRef(doc, page, target);
  if (matched) {
    const hit = await tryFont(matched.fontRef, matched.fontDict);
    if (hit) return hit;
  }

  for (const [ref, obj] of listResourceEntries(doc, page.resources, "Font")) {
    if (!isDict(obj)) continue;
    if (matched && ref === matched.fontRef) continue;
    const hit = await tryFont(ref, obj);
    if (hit) return hit;
  }

  return undefined;
}

/** Base-14 Type1 font dict for native insert (WinAnsi, full ASCII). */
export function buildStandardInsertFontDict(baseFont = "Helvetica"): CosDict {
  return cosDict(
    new Map([
      ["Type", cosName("Font")],
      ["Subtype", cosName("Type1")],
      ["BaseFont", cosName(baseFont)],
      ["Encoding", cosName("WinAnsiEncoding")],
    ])
  );
}
