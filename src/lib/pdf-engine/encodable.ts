import type { Font } from "./core/fonts/types";

/** Build a string of ASCII/Latin chars the font subset can encode (for client prediction). */
export function collectEncodableChars(font: Font, seedText: string): string {
  if (!font.encode) return seedText;
  const set = new Set<string>();
  for (const ch of seedText) {
    if (font.encode(ch).unencodable.length === 0) set.add(ch);
  }
  for (let cp = 32; cp < 127; cp++) {
    const ch = String.fromCharCode(cp);
    if (font.encode(ch).unencodable.length === 0) set.add(ch);
  }
  return [...set].sort().join("");
}
