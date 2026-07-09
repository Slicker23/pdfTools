/**
 * Map an arbitrary /BaseFont name to one of the 14 standard fonts, for metric
 * fallback when a font has no /Widths and no embedded program (ISO 32000-1 9.6.2.2).
 */
/** Strip a subset prefix ("ABCDEF+Helvetica" -> "Helvetica"). */
export declare function stripSubsetPrefix(name: string): string;
/** Resolve a /BaseFont to a base-14 AFM key, or undefined if not a standard font. */
export declare function mapBase14(baseFont: string | undefined): string | undefined;
//# sourceMappingURL=base14.d.ts.map