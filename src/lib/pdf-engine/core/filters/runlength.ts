/**
 * RunLengthDecode.
 *   length 0..127   -> copy the next (length + 1) bytes literally
 *   length 129..255 -> repeat the next byte (257 - length) times
 *   length 128      -> EOD
 */
export function runLengthDecode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const len = data[i++]!;
    if (len === 128) break;
    if (len < 128) {
      for (let j = 0; j <= len && i < data.length; j++) out.push(data[i++]!);
    } else {
      if (i >= data.length) break;
      const b = data[i++]!;
      const count = 257 - len;
      for (let j = 0; j < count; j++) out.push(b);
    }
  }
  return Uint8Array.from(out);
}
