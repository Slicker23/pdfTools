/** RC4 stream cipher (symmetric: encrypt == decrypt). */
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  const klen = key.length || 1;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % klen]!) & 0xff;
    const tmp = s[i]!;
    s[i] = s[j]!;
    s[j] = tmp;
  }
  const out = new Uint8Array(data.length);
  let a = 0;
  let b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 0xff;
    b = (b + s[a]!) & 0xff;
    const tmp = s[a]!;
    s[a] = s[b]!;
    s[b] = tmp;
    out[k] = data[k]! ^ s[(s[a]! + s[b]!) & 0xff]!;
  }
  return out;
}
