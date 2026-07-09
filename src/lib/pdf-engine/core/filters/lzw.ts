/**
 * LZWDecode (PDF variant): variable-width codes 9-12 bits, clear code 256,
 * EOD code 257, table entries start at 258. `earlyChange` (default 1) matches
 * the PDF/TIFF convention of increasing code width one code early.
 */
export function lzwDecode(data: Uint8Array, earlyChange = 1): Uint8Array {
  const out: number[] = [];
  let dict: number[][] = [];
  let dictSize = 0;

  const clearTable = () => {
    dict = [];
    for (let i = 0; i < 256; i++) dict.push([i]);
    dict.push([]); // 256 = clear
    dict.push([]); // 257 = EOD
    dictSize = 258;
  };
  clearTable();

  let codeWidth = 9;
  let prev: number[] | null = null;
  let bitBuffer = 0;
  let bitCount = 0;
  let pos = 0;

  const readCode = (): number => {
    while (bitCount < codeWidth) {
      if (pos >= data.length) return -1;
      bitBuffer = (bitBuffer << 8) | data[pos++]!;
      bitCount += 8;
    }
    bitCount -= codeWidth;
    return (bitBuffer >>> bitCount) & ((1 << codeWidth) - 1);
  };

  for (;;) {
    const code = readCode();
    if (code < 0 || code === 257) break;
    if (code === 256) {
      clearTable();
      codeWidth = 9;
      prev = null;
      continue;
    }

    let entry: number[];
    if (code < dictSize) {
      entry = dict[code]!;
    } else if (code === dictSize && prev) {
      entry = [...prev, prev[0]!];
    } else {
      break; // corrupt stream
    }

    for (const b of entry) out.push(b);

    if (prev) {
      dict.push([...prev, entry[0]!]);
      dictSize++;
      if (dictSize + earlyChange >= 1 << codeWidth && codeWidth < 12) {
        codeWidth++;
      }
    }
    prev = entry;
  }

  return Uint8Array.from(out);
}
