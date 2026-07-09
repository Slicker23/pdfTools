const GARBLED_OK = ".,;:!?'\"()[]{}-/\\&%@#*+=<>|~`^_$";

/** Skip prefill when extracted text looks like a broken CMap (common on OCR scans). */
export function looksGarbled(text: string): boolean {
  if (!text.trim()) return false;
  let letters = 0;
  let weird = 0;
  let total = 0;
  for (const c of text) {
    if (/\s/.test(c)) continue;
    total++;
    if (/[\p{L}\p{N}]/u.test(c)) {
      letters++;
      continue;
    }
    if (GARBLED_OK.includes(c)) continue;
    weird++;
  }
  if (total === 0) return false;
  return weird / total > 0.15 || letters / total < 0.35;
}
