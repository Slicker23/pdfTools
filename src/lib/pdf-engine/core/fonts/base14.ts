/**
 * Map an arbitrary /BaseFont name to one of the 14 standard fonts, for metric
 * fallback when a font has no /Widths and no embedded program (ISO 32000-1 9.6.2.2).
 */

/** Strip a subset prefix ("ABCDEF+Helvetica" -> "Helvetica"). */
export function stripSubsetPrefix(name: string): string {
  const m = /^[A-Z]{6}\+(.+)$/.exec(name);
  return m ? m[1]! : name;
}

/** Resolve a /BaseFont to a base-14 AFM key, or undefined if not a standard font. */
export function mapBase14(baseFont: string | undefined): string | undefined {
  if (!baseFont) return undefined;
  const raw = stripSubsetPrefix(baseFont);
  const lower = raw.toLowerCase();

  if (lower.includes("zapfdingbats") || lower.includes("dingbats")) return "ZapfDingbats";
  if (lower === "symbol" || lower.includes("symbolmt") || /(^|[^a-z])symbol([^a-z]|$)/.test(lower)) {
    return "Symbol";
  }

  const bold = /bold|black|heavy|semibold|demi/.test(lower);
  const italic = /italic|oblique/.test(lower);

  const isCourier = lower.includes("courier") || lower.includes("mono");
  const isTimes =
    lower.includes("times") ||
    lower.includes("georgia") ||
    lower.includes("serif") && !lower.includes("sansserif") && !lower.includes("sans-serif");

  if (isCourier) {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }
  if (isTimes) {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "Times-Roman";
  }
  // Default (Helvetica / Arial / sans-serif / unknown).
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}
