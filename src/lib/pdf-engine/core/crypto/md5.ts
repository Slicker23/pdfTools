/** MD5 (RFC 1321). Used by the PDF standard security handler (R2-R4). */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = new Int32Array(64);
for (let i = 0; i < 64; i++) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
}

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

export function md5(input: Uint8Array): Uint8Array {
  const originalLen = input.length;
  const bitLen = originalLen * 8;
  // Pad to 56 mod 64, append 64-bit little-endian length.
  const paddedLen = ((originalLen + 8) >> 6 << 6) + 64;
  const msg = new Uint8Array(paddedLen);
  msg.set(input);
  msg[originalLen] = 0x80;
  // 64-bit length (little-endian); high 32 bits assumed 0 for our inputs.
  msg[paddedLen - 8] = bitLen & 0xff;
  msg[paddedLen - 7] = (bitLen >>> 8) & 0xff;
  msg[paddedLen - 6] = (bitLen >>> 16) & 0xff;
  msg[paddedLen - 5] = (bitLen >>> 24) & 0xff;
  // remaining length bytes stay 0

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Int32Array(16);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      M[i] = msg[j]! | (msg[j + 1]! << 8) | (msg[j + 2]! << 16) | (msg[j + 3]! << 24);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) & 15;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) & 15;
      }
      F = (F + A + K[i]! + M[g]!) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i]!)) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  const out = new Uint8Array(16);
  const words = [a0, b0, c0, d0];
  for (let i = 0; i < 4; i++) {
    out[i * 4] = words[i]! & 0xff;
    out[i * 4 + 1] = (words[i]! >>> 8) & 0xff;
    out[i * 4 + 2] = (words[i]! >>> 16) & 0xff;
    out[i * 4 + 3] = (words[i]! >>> 24) & 0xff;
  }
  return out;
}
