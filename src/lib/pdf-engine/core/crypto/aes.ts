/**
 * AES (Rijndael) block cipher with CBC mode.
 *
 * Supports 128- and 256-bit keys, which is all the PDF standard security handler
 * needs:
 *  - AESV2 (R4): AES-128-CBC, PKCS#7 padded, IV = first 16 bytes of the data
 *  - AESV3 (R6): AES-256-CBC, PKCS#7 padded, plus AES-128-CBC no-padding encrypt
 *    inside the Algorithm 2.B key-derivation loop
 *
 * S-boxes and round constants are generated at load time from GF(2^8) math to
 * avoid shipping large literal tables.
 */

const SBOX = new Uint8Array(256);
const INV_SBOX = new Uint8Array(256);
const RCON = new Uint8Array(16);

function xtime(a: number): number {
  return ((a << 1) ^ (a & 0x80 ? 0x11b : 0)) & 0xff;
}

function gmul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p & 0xff;
}

(function initTables() {
  // Multiplicative inverse table via exponent/log over generator 3.
  const inv = new Uint8Array(256);
  let x = 1;
  const exp = new Uint8Array(256);
  const log = new Uint8Array(256);
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x = gmul(x, 3);
  }
  inv[0] = 0;
  for (let i = 1; i < 256; i++) {
    inv[i] = exp[(255 - log[i]!) % 255]!;
  }
  for (let i = 0; i < 256; i++) {
    let s = inv[i]!;
    let xf = s;
    for (let k = 0; k < 4; k++) {
      xf = ((xf << 1) | (xf >> 7)) & 0xff;
      s ^= xf;
    }
    s ^= 0x63;
    SBOX[i] = s;
    INV_SBOX[s] = i;
  }
  let r = 1;
  for (let i = 0; i < 16; i++) {
    RCON[i] = r;
    r = xtime(r);
  }
})();

function keyExpansion(key: Uint8Array): { roundKeys: Uint8Array; rounds: number } {
  const Nk = key.length / 4; // 4 (128) or 8 (256)
  const Nr = Nk + 6;
  const total = 4 * (Nr + 1);
  const w = new Uint8Array(total * 4);
  w.set(key);
  const temp = new Uint8Array(4);
  for (let i = Nk; i < total; i++) {
    temp.set(w.subarray((i - 1) * 4, i * 4));
    if (i % Nk === 0) {
      // RotWord + SubWord + Rcon
      const t0 = temp[0]!;
      temp[0] = SBOX[temp[1]!]! ^ RCON[i / Nk - 1]!;
      temp[1] = SBOX[temp[2]!]!;
      temp[2] = SBOX[temp[3]!]!;
      temp[3] = SBOX[t0]!;
    } else if (Nk > 6 && i % Nk === 4) {
      temp[0] = SBOX[temp[0]!]!;
      temp[1] = SBOX[temp[1]!]!;
      temp[2] = SBOX[temp[2]!]!;
      temp[3] = SBOX[temp[3]!]!;
    }
    const p = i * 4;
    const q = (i - Nk) * 4;
    w[p] = w[q]! ^ temp[0]!;
    w[p + 1] = w[q + 1]! ^ temp[1]!;
    w[p + 2] = w[q + 2]! ^ temp[2]!;
    w[p + 3] = w[q + 3]! ^ temp[3]!;
  }
  return { roundKeys: w, rounds: Nr };
}

function addRoundKey(state: Uint8Array, rk: Uint8Array, round: number): void {
  const off = round * 16;
  for (let i = 0; i < 16; i++) state[i] ^= rk[off + i]!;
}

function encryptBlock(state: Uint8Array, rk: Uint8Array, Nr: number): void {
  addRoundKey(state, rk, 0);
  for (let round = 1; round < Nr; round++) {
    subBytes(state);
    shiftRows(state);
    mixColumns(state);
    addRoundKey(state, rk, round);
  }
  subBytes(state);
  shiftRows(state);
  addRoundKey(state, rk, Nr);
}

function decryptBlock(state: Uint8Array, rk: Uint8Array, Nr: number): void {
  addRoundKey(state, rk, Nr);
  for (let round = Nr - 1; round >= 1; round--) {
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, rk, round);
    invMixColumns(state);
  }
  invShiftRows(state);
  invSubBytes(state);
  addRoundKey(state, rk, 0);
}

function subBytes(s: Uint8Array): void {
  for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]!]!;
}
function invSubBytes(s: Uint8Array): void {
  for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]!]!;
}

// State is column-major: byte index = row + 4*col.
function shiftRows(s: Uint8Array): void {
  const t = s.slice();
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      s[r + 4 * c] = t[r + 4 * ((c + r) % 4)]!;
    }
  }
}
function invShiftRows(s: Uint8Array): void {
  const t = s.slice();
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      s[r + 4 * c] = t[r + 4 * ((c - r + 4) % 4)]!;
    }
  }
}

function mixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i]!;
    const a1 = s[i + 1]!;
    const a2 = s[i + 2]!;
    const a3 = s[i + 3]!;
    s[i] = xtime(a0) ^ (xtime(a1) ^ a1) ^ a2 ^ a3;
    s[i + 1] = a0 ^ xtime(a1) ^ (xtime(a2) ^ a2) ^ a3;
    s[i + 2] = a0 ^ a1 ^ xtime(a2) ^ (xtime(a3) ^ a3);
    s[i + 3] = (xtime(a0) ^ a0) ^ a1 ^ a2 ^ xtime(a3);
  }
}
function invMixColumns(s: Uint8Array): void {
  for (let c = 0; c < 4; c++) {
    const i = c * 4;
    const a0 = s[i]!;
    const a1 = s[i + 1]!;
    const a2 = s[i + 2]!;
    const a3 = s[i + 3]!;
    s[i] = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
    s[i + 1] = gmul(a0, 9) ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
    s[i + 2] = gmul(a0, 13) ^ gmul(a1, 9) ^ gmul(a2, 14) ^ gmul(a3, 11);
    s[i + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9) ^ gmul(a3, 14);
  }
}

/** AES-CBC encryption without padding. `data.length` must be a multiple of 16. */
export function aesCbcEncryptNoPad(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  const { roundKeys, rounds } = keyExpansion(key);
  const out = new Uint8Array(data.length);
  const prev = iv.slice(0, 16);
  const block = new Uint8Array(16);
  for (let off = 0; off < data.length; off += 16) {
    for (let i = 0; i < 16; i++) block[i] = data[off + i]! ^ prev[i]!;
    encryptBlock(block, roundKeys, rounds);
    out.set(block, off);
    prev.set(block);
  }
  return out;
}

/**
 * AES-CBC decryption. IV is the first 16 bytes of `data` (PDF convention).
 * Set `removePadding` to strip PKCS#7 padding.
 */
export function aesCbcDecryptWithIvPrefix(
  key: Uint8Array,
  data: Uint8Array,
  removePadding = true
): Uint8Array {
  if (data.length < 16) return new Uint8Array(0);
  const iv = data.subarray(0, 16);
  const body = data.subarray(16);
  return aesCbcDecrypt(key, iv, body, removePadding);
}

/** AES-CBC decryption with an explicit IV. */
export function aesCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
  removePadding = true
): Uint8Array {
  if (data.length === 0 || data.length % 16 !== 0) {
    // Not a valid CBC ciphertext; return as-is to stay resilient.
    return data.slice();
  }
  const { roundKeys, rounds } = keyExpansion(key);
  const out = new Uint8Array(data.length);
  let prev = iv.slice(0, 16);
  const block = new Uint8Array(16);
  for (let off = 0; off < data.length; off += 16) {
    block.set(data.subarray(off, off + 16));
    const cipher = block.slice();
    decryptBlock(block, roundKeys, rounds);
    for (let i = 0; i < 16; i++) block[i] ^= prev[i]!;
    out.set(block, off);
    prev = cipher;
  }
  if (!removePadding) return out;
  const pad = out[out.length - 1]!;
  if (pad >= 1 && pad <= 16 && pad <= out.length) {
    return out.subarray(0, out.length - pad);
  }
  return out;
}
