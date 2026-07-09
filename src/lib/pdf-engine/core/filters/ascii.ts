/** ASCIIHexDecode and ASCII85Decode. */
import { hexVal, isHexDigit, isWhitespace } from "../bytes";

export function asciiHexDecode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let hi = -1;
  for (let i = 0; i < data.length; i++) {
    const c = data[i]!;
    if (c === 0x3e) break; // '>' EOD
    if (isWhitespace(c)) continue;
    if (!isHexDigit(c)) continue;
    const v = hexVal(c);
    if (hi < 0) {
      hi = v;
    } else {
      out.push(hi * 16 + v);
      hi = -1;
    }
  }
  if (hi >= 0) out.push(hi * 16); // trailing nibble -> low nibble 0
  return Uint8Array.from(out);
}

export function ascii85Decode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  const tuple = new Array<number>(5);
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    const c = data[i]!;
    if (c === 0x7e) break; // '~' begins EOD "~>"
    if (isWhitespace(c)) continue;
    // Optional leading "<~" from some encoders.
    if (c === 0x3c && count === 0 && data[i + 1] === 0x7e) {
      i++;
      continue;
    }
    if (c === 0x7a && count === 0) {
      out.push(0, 0, 0, 0); // 'z' = four zero bytes
      continue;
    }
    if (c < 0x21 || c > 0x75) continue; // out of range -> ignore
    tuple[count++] = c - 0x21;
    if (count === 5) {
      let v = 0;
      for (let k = 0; k < 5; k++) v = v * 85 + tuple[k]!;
      out.push(
        Math.floor(v / 16777216) & 0xff,
        Math.floor(v / 65536) & 0xff,
        Math.floor(v / 256) & 0xff,
        v & 0xff
      );
      count = 0;
    }
  }

  if (count > 0) {
    // Partial final group: pad with 'u' (84) and emit count-1 bytes.
    for (let k = count; k < 5; k++) tuple[k] = 84;
    let v = 0;
    for (let k = 0; k < 5; k++) v = v * 85 + tuple[k]!;
    for (let k = 0; k < count - 1; k++) {
      out.push(Math.floor(v / [16777216, 65536, 256, 1][k]!) & 0xff);
    }
  }

  return Uint8Array.from(out);
}
