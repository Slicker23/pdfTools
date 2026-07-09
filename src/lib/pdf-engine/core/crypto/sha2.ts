/**
 * SHA-256 / SHA-384 / SHA-512.
 *
 * Needed by the PDF 2.0 (R6 / AESV3) standard security handler, whose hardened
 * hash (Algorithm 2.B) selects between the three based on a running modulus.
 * SHA-256 uses 32-bit words; SHA-384/512 use BigInt for correct 64-bit math.
 */

// ---------- SHA-256 ----------

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256(input: Uint8Array): Uint8Array {
  const len = input.length;
  const bitLen = len * 8;
  const paddedLen = ((len + 8) >> 6 << 6) + 64;
  const msg = new Uint8Array(paddedLen);
  msg.set(input);
  msg[len] = 0x80;
  // 64-bit big-endian length (high word 0 for our inputs).
  msg[paddedLen - 4] = (bitLen >>> 24) & 0xff;
  msg[paddedLen - 3] = (bitLen >>> 16) & 0xff;
  msg[paddedLen - 2] = (bitLen >>> 8) & 0xff;
  msg[paddedLen - 1] = bitLen & 0xff;

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (msg[j]! << 24) | (msg[j + 1]! << 16) | (msg[j + 2]! << 8) | msg[j + 3]!;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15]!, 7) ^ rotr32(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr32(w[i - 2]!, 17) ^ rotr32(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e!, 6) ^ rotr32(e!, 11) ^ rotr32(e!, 25);
      const ch = (e! & f!) ^ (~e! & g!);
      const t1 = (h! + S1 + ch + K256[i]! + w[i]!) | 0;
      const S0 = rotr32(a!, 2) ^ rotr32(a!, 13) ^ rotr32(a!, 22);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d! + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    H[0] = (H[0]! + a!) | 0;
    H[1] = (H[1]! + b!) | 0;
    H[2] = (H[2]! + c!) | 0;
    H[3] = (H[3]! + d!) | 0;
    H[4] = (H[4]! + e!) | 0;
    H[5] = (H[5]! + f!) | 0;
    H[6] = (H[6]! + g!) | 0;
    H[7] = (H[7]! + h!) | 0;
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (H[i]! >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i]! >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i]! >>> 8) & 0xff;
    out[i * 4 + 3] = H[i]! & 0xff;
  }
  return out;
}

// ---------- SHA-512 / SHA-384 (BigInt) ----------
// BigInt literals (123n) require an ES2020 target; the project targets ES2017,
// so all 64-bit constants are built via BigInt("0x...") / BigInt(n) instead.

const bi = (n: number): bigint => BigInt(n);
const MASK64 = (bi(1) << bi(64)) - bi(1);
const EIGHT = bi(8);

const K512: bigint[] = [
  "428a2f98d728ae22", "7137449123ef65cd", "b5c0fbcfec4d3b2f", "e9b5dba58189dbbc",
  "3956c25bf348b538", "59f111f1b605d019", "923f82a4af194f9b", "ab1c5ed5da6d8118",
  "d807aa98a3030242", "12835b0145706fbe", "243185be4ee4b28c", "550c7dc3d5ffb4e2",
  "72be5d74f27b896f", "80deb1fe3b1696b1", "9bdc06a725c71235", "c19bf174cf692694",
  "e49b69c19ef14ad2", "efbe4786384f25e3", "0fc19dc68b8cd5b5", "240ca1cc77ac9c65",
  "2de92c6f592b0275", "4a7484aa6ea6e483", "5cb0a9dcbd41fbd4", "76f988da831153b5",
  "983e5152ee66dfab", "a831c66d2db43210", "b00327c898fb213f", "bf597fc7beef0ee4",
  "c6e00bf33da88fc2", "d5a79147930aa725", "06ca6351e003826f", "142929670a0e6e70",
  "27b70a8546d22ffc", "2e1b21385c26c926", "4d2c6dfc5ac42aed", "53380d139d95b3df",
  "650a73548baf63de", "766a0abb3c77b2a8", "81c2c92e47edaee6", "92722c851482353b",
  "a2bfe8a14cf10364", "a81a664bbc423001", "c24b8b70d0f89791", "c76c51a30654be30",
  "d192e819d6ef5218", "d69906245565a910", "f40e35855771202a", "106aa07032bbd1b8",
  "19a4c116b8d2d0c8", "1e376c085141ab53", "2748774cdf8eeb99", "34b0bcb5e19b48a8",
  "391c0cb3c5c95a63", "4ed8aa4ae3418acb", "5b9cca4f7763e373", "682e6ff3d6b2b8a3",
  "748f82ee5defb2fc", "78a5636f43172f60", "84c87814a1f0ab72", "8cc702081a6439ec",
  "90befffa23631e28", "a4506cebde82bde9", "bef9a3f7b2c67915", "c67178f2e372532b",
  "ca273eceea26619c", "d186b8c721c0c207", "eada7dd6cde0eb1e", "f57d4f7fee6ed178",
  "06f067aa72176fba", "0a637dc5a2c898a6", "113f9804bef90dae", "1b710b35131c471b",
  "28db77f523047d84", "32caab7b40c72493", "3c9ebe0a15c9bebc", "431d67c49c100d4c",
  "4cc5d4becb3e42b6", "597f299cfc657e2a", "5fcb6fab3ad6faec", "6c44198c4a475817",
].map((h) => BigInt("0x" + h));

const H512 = [
  "6a09e667f3bcc908", "bb67ae8584caa73b", "3c6ef372fe94f82b", "a54ff53a5f1d36f1",
  "510e527fade682d1", "9b05688c2b3e6c1f", "1f83d9abfb41bd6b", "5be0cd19137e2179",
].map((h) => BigInt("0x" + h));

const H384 = [
  "cbbb9d5dc1059ed8", "629a292a367cd507", "9159015a3070dd17", "152fecd8f70e5939",
  "67332667ffc00b31", "8eb44a8768581511", "db0c2e0d64f98fa7", "47b5481dbefa4fa4",
].map((h) => BigInt("0x" + h));

function rotr64(x: bigint, n: bigint): bigint {
  return ((x >> n) | (x << (bi(64) - n))) & MASK64;
}

function sha512Core(input: Uint8Array, H: bigint[], outBytes: number): Uint8Array {
  const len = input.length;
  const bitLen = bi(len) * EIGHT;
  // Pad to 112 mod 128, append 128-bit big-endian length.
  const paddedLen = (((len + 16) >> 7) << 7) + 128;
  const msg = new Uint8Array(paddedLen);
  msg.set(input);
  msg[len] = 0x80;
  const BYTE = bi(0xff);
  for (let i = 0; i < 16; i++) {
    msg[paddedLen - 1 - i] = Number((bitLen >> bi(8 * i)) & BYTE);
  }

  const w: bigint[] = new Array(80);
  const h = H.slice();

  for (let off = 0; off < paddedLen; off += 128) {
    for (let i = 0; i < 16; i++) {
      let word = bi(0);
      const j = off + i * 8;
      for (let k = 0; k < 8; k++) word = (word << EIGHT) | bi(msg[j + k]!);
      w[i] = word;
    }
    for (let i = 16; i < 80; i++) {
      const s0 = rotr64(w[i - 15]!, bi(1)) ^ rotr64(w[i - 15]!, bi(8)) ^ (w[i - 15]! >> bi(7));
      const s1 = rotr64(w[i - 2]!, bi(19)) ^ rotr64(w[i - 2]!, bi(61)) ^ (w[i - 2]! >> bi(6));
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) & MASK64;
    }
    let [a, b, c, d, e, f, g, hh] = h as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
    for (let i = 0; i < 80; i++) {
      const S1 = rotr64(e, bi(14)) ^ rotr64(e, bi(18)) ^ rotr64(e, bi(41));
      const ch = (e & f) ^ (~e & MASK64 & g);
      const t1 = (hh + S1 + ch + K512[i]! + w[i]!) & MASK64;
      const S0 = rotr64(a, bi(28)) ^ rotr64(a, bi(34)) ^ rotr64(a, bi(39));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & MASK64;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) & MASK64;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) & MASK64;
    }
    h[0] = (h[0]! + a) & MASK64;
    h[1] = (h[1]! + b) & MASK64;
    h[2] = (h[2]! + c) & MASK64;
    h[3] = (h[3]! + d) & MASK64;
    h[4] = (h[4]! + e) & MASK64;
    h[5] = (h[5]! + f) & MASK64;
    h[6] = (h[6]! + g) & MASK64;
    h[7] = (h[7]! + hh) & MASK64;
  }

  const out = new Uint8Array(64);
  for (let i = 0; i < 8; i++) {
    for (let k = 0; k < 8; k++) {
      out[i * 8 + k] = Number((h[i]! >> bi(56 - 8 * k)) & BYTE);
    }
  }
  return out.subarray(0, outBytes);
}

export function sha512(input: Uint8Array): Uint8Array {
  return sha512Core(input, H512, 64);
}

export function sha384(input: Uint8Array): Uint8Array {
  return sha512Core(input, H384, 48);
}
