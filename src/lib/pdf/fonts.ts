import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/**
 * Font families offered by the editor. "Standard" families use the 14 built-in
 * PDF fonts (no embedding, zero bytes). "Custom" families are bundled TTFs in
 * public/fonts and are embedded (subset) on export.
 */
export type FontFamily =
  | "Helvetica"
  | "Times New Roman"
  | "Courier New"
  | "Roboto"
  | "Open Sans"
  | "Lato";

export const FONT_FAMILIES: FontFamily[] = [
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Roboto",
  "Open Sans",
  "Lato",
];

export const DEFAULT_FONT_FAMILY: FontFamily = "Helvetica";

interface StandardVariants {
  kind: "standard";
  regular: StandardFonts;
  bold: StandardFonts;
  italic: StandardFonts;
  boldItalic: StandardFonts;
  /** CSS font stack for the DOM overlay preview. */
  css: string;
}

interface CustomVariants {
  kind: "custom";
  regular: string;
  bold: string;
  italic: string;
  boldItalic: string;
  css: string;
}

const FAMILY_DEFS: Record<FontFamily, StandardVariants | CustomVariants> = {
  Helvetica: {
    kind: "standard",
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
    css: "Helvetica, Arial, sans-serif",
  },
  "Times New Roman": {
    kind: "standard",
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    boldItalic: StandardFonts.TimesRomanBoldItalic,
    css: '"Times New Roman", Times, serif',
  },
  "Courier New": {
    kind: "standard",
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    boldItalic: StandardFonts.CourierBoldOblique,
    css: '"Courier New", Courier, monospace',
  },
  Roboto: {
    kind: "custom",
    regular: "/fonts/Roboto-Regular.ttf",
    bold: "/fonts/Roboto-Bold.ttf",
    italic: "/fonts/Roboto-Italic.ttf",
    boldItalic: "/fonts/Roboto-BoldItalic.ttf",
    css: "Roboto, system-ui, sans-serif",
  },
  "Open Sans": {
    kind: "custom",
    regular: "/fonts/OpenSans-Regular.ttf",
    bold: "/fonts/OpenSans-Bold.ttf",
    italic: "/fonts/OpenSans-Italic.ttf",
    boldItalic: "/fonts/OpenSans-BoldItalic.ttf",
    css: '"Open Sans", system-ui, sans-serif',
  },
  Lato: {
    kind: "custom",
    regular: "/fonts/Lato-Regular.ttf",
    bold: "/fonts/Lato-Bold.ttf",
    italic: "/fonts/Lato-Italic.ttf",
    boldItalic: "/fonts/Lato-BoldItalic.ttf",
    css: "Lato, system-ui, sans-serif",
  },
};

export function fontFamilyCss(family: FontFamily): string {
  return FAMILY_DEFS[family]?.css ?? "sans-serif";
}

/** CSS font-weight for overlay preview (matches @font-face 400/700 pairs). */
export function fontWeightCss(bold: boolean): number {
  return bold ? 700 : 400;
}

/** Font size in PDF points from a text item transform matrix. */
export function fontSizeFromPdfTransform(transform: number[], height = 0): number {
  const fromMatrix = Math.max(
    Math.hypot(transform[0], transform[1]),
    Math.hypot(transform[2], transform[3])
  );
  return fromMatrix || height || 12;
}

export interface ParsedFontTraits {
  family: FontFamily;
  bold: boolean;
  italic: boolean;
  /** How confidently weight was inferred from the PDF font name. */
  weightConfidence: "bold" | "regular" | "ambiguous";
}

function isExplicitRegular(lower: string): boolean {
  if (
    /\b(thin|hairline|extralight|ultralight|light|book|regular|normal|roman|std)\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (/\bmedium\b/.test(lower) && !/\bbold\b/.test(lower)) return true;
  // PostScript name suffix: ArialMT, TimesNewRomanPSMT (not BoldMT)
  if (/mt$/i.test(lower.replace(/-/g, "")) && !/(bold|black|heavy|semibold)/i.test(lower)) {
    return true;
  }
  // Subset regular: ABCDEE+Calibri (no weight suffix)
  if (/^[\w+-]+$/.test(lower) && !/(bold|black|heavy|semibold|demi|bd|700|800|900)/i.test(lower)) {
    const base = lower.split("+").pop() ?? lower;
    if (/^(calibri|arial|helvetica|times|lato|roboto|opensans|verdana|segoeui|cambria)$/i.test(base)) {
      return true;
    }
  }
  return false;
}

function isExplicitBold(lower: string, numericWeight?: number): boolean {
  if (numericWeight !== undefined) return numericWeight >= 600;
  return (
    /\bbold\b|\bblack\b|\bheavy\b|\bsemibold\b|\bdemi(?:bold)?\b|\bextrabold\b|\bultra(?:bold)?\b|-bold(?:mt)?(?:$|-)|boldmt$|bold$|-bd(?:$|-)|\+.*bold/.test(
      lower
    )
  );
}

/**
 * Infer family, weight, and style from PDF font names (e.g. "ABCDEE+Calibri-Bold").
 */
export function parseFontTraits(fontName?: string, styleFontFamily?: string): ParsedFontTraits {
  const internalKey = fontName && /^g_[a-z0-9_]+$/i.test(fontName);
  const primary = internalKey && styleFontFamily ? styleFontFamily : fontName;
  const combined = `${primary ?? ""} ${styleFontFamily ?? ""}`.trim();
  if (!combined) {
    return {
      family: DEFAULT_FONT_FAMILY,
      bold: false,
      italic: false,
      weightConfidence: "ambiguous",
    };
  }

  const stripped = combined.replace(/^[A-Za-z0-9]{6}\+/, "");
  const lower = stripped.toLowerCase().replace(/[,_]/g, "-");

  const italic =
    /\bitalic\b|\boblique\b|\bita\b|\bit(?:alic)?(?:$|-)/.test(lower) || lower.endsWith("-it");

  const weightMatch = lower.match(/(?:^|-)([1-9]00)(?:$|-)/);
  const numericWeight = weightMatch ? parseInt(weightMatch[1], 10) : undefined;

  if (isExplicitBold(lower, numericWeight)) {
    return {
      family: nearestFontFamily(stripped || combined),
      bold: true,
      italic,
      weightConfidence: "bold",
    };
  }

  if (isExplicitRegular(lower) || numericWeight === 400 || numericWeight === 500) {
    return {
      family: nearestFontFamily(stripped || combined),
      bold: false,
      italic,
      weightConfidence: "regular",
    };
  }

  if (numericWeight !== undefined && numericWeight < 600) {
    return {
      family: nearestFontFamily(stripped || combined),
      bold: false,
      italic,
      weightConfidence: "regular",
    };
  }

  return {
    family: nearestFontFamily(stripped || combined),
    bold: false,
    italic,
    weightConfidence: "ambiguous",
  };
}

/** Map a source-PDF font name to the nearest editor family (for text pickup). */
export function nearestFontFamily(fontName?: string): FontFamily {
  if (!fontName) return DEFAULT_FONT_FAMILY;
  const lower = fontName.toLowerCase();
  if (
    lower.includes("calibri") ||
    lower.includes("candara") ||
    lower.includes("cambria") ||
    lower.includes("garamond") ||
    lower.includes("georgia")
  ) {
    return "Open Sans";
  }
  if (
    lower.includes("segoe") ||
    lower.includes("verdana") ||
    lower.includes("trebuchet") ||
    lower.includes("ubuntu") ||
    lower.includes("montserrat")
  ) {
    return "Lato";
  }
  if (lower.includes("arial") || lower.includes("helvetica")) {
    return "Helvetica";
  }
  if (lower.includes("sans") && !lower.includes("open")) {
    return "Helvetica";
  }
  if (lower.includes("times") || lower.includes("serif") || lower.includes("georgia")) {
    return "Times New Roman";
  }
  if (lower.includes("courier") || lower.includes("mono") || lower.includes("consol")) {
    return "Courier New";
  }
  if (lower.includes("lato")) return "Lato";
  if (lower.includes("roboto")) return "Roboto";
  if (lower.includes("open sans") || lower.includes("opensans")) return "Open Sans";
  return "Helvetica";
}

function variantKey(bold: boolean, italic: boolean): keyof StandardVariants & keyof CustomVariants {
  if (bold && italic) return "boldItalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "regular";
}

const fontBytesCache = new Map<string, Promise<Uint8Array>>();

async function loadFontBytes(url: string): Promise<Uint8Array> {
  let pending = fontBytesCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load font ${url}`);
        return res.arrayBuffer();
      })
      .then((buf) => new Uint8Array(buf));
    fontBytesCache.set(url, pending);
  }
  return pending;
}

/** Per-document cache of embedded fonts, keyed by "family|variant". */
const docFontCache = new WeakMap<PDFDocument, Map<string, PDFFont>>();
const fontkitRegistered = new WeakSet<PDFDocument>();

/**
 * Resolve (and embed, if needed) a font for a document. Results are cached per
 * document so repeated text objects share one embedded font.
 */
export async function resolveFont(
  doc: PDFDocument,
  family: FontFamily,
  bold: boolean,
  italic: boolean
): Promise<PDFFont> {
  const def = FAMILY_DEFS[family] ?? FAMILY_DEFS[DEFAULT_FONT_FAMILY];
  const variant = variantKey(bold, italic);
  const cacheKey = `${family}|${variant}`;

  let cache = docFontCache.get(doc);
  if (!cache) {
    cache = new Map();
    docFontCache.set(doc, cache);
  }
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  let font: PDFFont;
  if (def.kind === "standard") {
    font = await doc.embedFont(def[variant]);
  } else {
    if (!fontkitRegistered.has(doc)) {
      doc.registerFontkit(fontkit);
      fontkitRegistered.add(doc);
    }
    const bytes = await loadFontBytes(def[variant]);
    font = await doc.embedFont(bytes, { subset: true });
  }

  cache.set(cacheKey, font);
  return font;
}
