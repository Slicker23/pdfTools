/**
 * PDF standard security handler (ISO 32000 / 32000-2).
 *
 * Computes the file encryption key from the (empty by default) password and
 * decrypts strings/streams per object. Supports:
 *   - R2/R3/R4 with RC4 (V2) and AES-128 (AESV2), Algorithm 2
 *   - R6 with AES-256 (AESV3), Algorithms 2.A and 2.B
 *
 * Only decryption is implemented (opening files); we do not re-encrypt in M0.
 */
import { bytesEqual, concatBytes } from "../bytes";
import {
  asNumber,
  dictGet,
  isBool,
  isName,
  isString,
  type CosDict,
  type CosObject,
} from "../cos/types";
import { md5 } from "./md5";
import { rc4 } from "./rc4";
import { sha256, sha384, sha512 } from "./sha2";
import { aesCbcDecrypt, aesCbcDecryptWithIvPrefix, aesCbcEncryptNoPad } from "./aes";

export interface SecurityHandler {
  /**
   * When false, the document's /Metadata stream is stored unencrypted and must
   * NOT be run through {@link decrypt} (doing so would corrupt it).
   */
  readonly encryptMetadata: boolean;
  decrypt(data: Uint8Array, num: number, gen: number, isStringField: boolean): Uint8Array;
}

export interface SecurityParams {
  encrypt: CosDict;
  idFirst: Uint8Array | undefined;
  password: Uint8Array;
}

type CfMethod = "V2" | "AESV2" | "AESV3" | "Identity";

// 32-byte password padding string (Algorithm 2, step a).
const PAD = Uint8Array.of(
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a
);

function padPassword(pw: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  if (pw.length >= 32) {
    out.set(pw.subarray(0, 32));
  } else {
    out.set(pw);
    out.set(PAD.subarray(0, 32 - pw.length), pw.length);
  }
  return out;
}

function p32le(p: number): Uint8Array {
  const u = p >>> 0;
  return Uint8Array.of(u & 0xff, (u >>> 8) & 0xff, (u >>> 16) & 0xff, (u >>> 24) & 0xff);
}

function stringBytes(o: CosObject | undefined): Uint8Array {
  return isString(o) ? o.bytes : new Uint8Array(0);
}

class StandardSecurityHandler implements SecurityHandler {
  private readonly v: number;
  private readonly r: number;
  private readonly fileKey: Uint8Array;
  private readonly stmMethod: CfMethod;
  private readonly strMethod: CfMethod;
  readonly encryptMetadata: boolean;

  constructor(params: SecurityParams) {
    const enc = params.encrypt;
    this.v = asNumber(dictGet(enc, "V")) ?? 0;
    this.r = asNumber(dictGet(enc, "R")) ?? 0;

    const o = stringBytes(dictGet(enc, "O"));
    const u = stringBytes(dictGet(enc, "U"));
    const oe = stringBytes(dictGet(enc, "OE"));
    const ue = stringBytes(dictGet(enc, "UE"));
    const p = asNumber(dictGet(enc, "P")) ?? 0;
    const lengthBits = asNumber(dictGet(enc, "Length")) ?? 40;
    const keyLen = Math.floor(lengthBits / 8);
    const encMetaObj = dictGet(enc, "EncryptMetadata");
    const encryptMetadata = isBool(encMetaObj) ? encMetaObj.value : true;
    this.encryptMetadata = encryptMetadata;

    const methods = this.resolveMethods(enc);
    this.stmMethod = methods.stm;
    this.strMethod = methods.str;

    if (this.r >= 5) {
      this.fileKey = deriveKeyV5(params.password, o, u, oe, ue, this.r);
    } else {
      this.fileKey = deriveKeyV4(
        params.password,
        o,
        p,
        params.idFirst ?? new Uint8Array(0),
        this.r,
        keyLen,
        encryptMetadata
      );
    }
  }

  private resolveMethods(enc: CosDict): { stm: CfMethod; str: CfMethod } {
    if (this.v >= 5) return { stm: "AESV3", str: "AESV3" };
    if (this.v === 4) {
      const cf = dictGet(enc, "CF");
      const stmF = dictGet(enc, "StmF");
      const strF = dictGet(enc, "StrF");
      const lookup = (name: CosObject | undefined): CfMethod => {
        if (!isName(name) || name.name === "Identity") return "Identity";
        const filter = dictGet(cf, name.name);
        const cfm = dictGet(filter, "CFM");
        if (isName(cfm)) {
          if (cfm.name === "AESV2") return "AESV2";
          if (cfm.name === "AESV3") return "AESV3";
          if (cfm.name === "V2") return "V2";
        }
        return "Identity";
      };
      return { stm: lookup(stmF), str: lookup(strF) };
    }
    // V 1/2: RC4 everywhere.
    return { stm: "V2", str: "V2" };
  }

  decrypt(data: Uint8Array, num: number, gen: number, isStringField: boolean): Uint8Array {
    const method = isStringField ? this.strMethod : this.stmMethod;
    if (method === "Identity") return data;
    if (method === "AESV3") {
      return aesCbcDecryptWithIvPrefix(this.fileKey, data);
    }
    // V2 (RC4) or AESV2 (AES-128): derive a per-object key first.
    const objKey = this.objectKey(num, gen, method === "AESV2");
    if (method === "AESV2") return aesCbcDecryptWithIvPrefix(objKey, data);
    return rc4(objKey, data);
  }

  private objectKey(num: number, gen: number, aes: boolean): Uint8Array {
    const parts: Uint8Array[] = [
      this.fileKey,
      Uint8Array.of(num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff),
    ];
    if (aes) parts.push(Uint8Array.of(0x73, 0x41, 0x6c, 0x54)); // "sAlT"
    const hash = md5(concatBytes(parts));
    const n = Math.min(this.fileKey.length + 5, 16);
    return hash.subarray(0, n);
  }
}

function deriveKeyV4(
  password: Uint8Array,
  o: Uint8Array,
  p: number,
  idFirst: Uint8Array,
  r: number,
  keyLen: number,
  encryptMetadata: boolean
): Uint8Array {
  const n = r === 2 ? 5 : keyLen || 5;
  const parts: Uint8Array[] = [padPassword(password), o.subarray(0, 32), p32le(p), idFirst];
  if (r >= 4 && !encryptMetadata) parts.push(Uint8Array.of(0xff, 0xff, 0xff, 0xff));
  let hash = md5(concatBytes(parts));
  if (r >= 3) {
    for (let i = 0; i < 50; i++) hash = md5(hash.subarray(0, n));
  }
  return hash.subarray(0, n).slice();
}

function deriveKeyV5(
  password: Uint8Array,
  o: Uint8Array,
  u: Uint8Array,
  oe: Uint8Array,
  ue: Uint8Array,
  r: number
): Uint8Array {
  const pw = password.length > 127 ? password.subarray(0, 127) : password;
  const u48 = u.subarray(0, 48);

  // Try the user password.
  const userValidationSalt = u.subarray(32, 40);
  const userKeySalt = u.subarray(40, 48);
  const userHash = hash2B(pw, userValidationSalt, new Uint8Array(0), r);
  if (bytesEqual(userHash, u.subarray(0, 32))) {
    const ik = hash2B(pw, userKeySalt, new Uint8Array(0), r);
    return aesCbcDecrypt(ik, new Uint8Array(16), ue.subarray(0, 32), false);
  }

  // Try the owner password.
  const ownerValidationSalt = o.subarray(32, 40);
  const ownerKeySalt = o.subarray(40, 48);
  const ownerHash = hash2B(pw, ownerValidationSalt, u48, r);
  if (bytesEqual(ownerHash, o.subarray(0, 32))) {
    const ik = hash2B(pw, ownerKeySalt, u48, r);
    return aesCbcDecrypt(ik, new Uint8Array(16), oe.subarray(0, 32), false);
  }

  // Password did not validate; return the user-derived key anyway so callers
  // still get a deterministic (if wrong) result rather than throwing.
  const ik = hash2B(pw, userKeySalt, new Uint8Array(0), r);
  return aesCbcDecrypt(ik, new Uint8Array(16), ue.subarray(0, 32), false);
}

/** Algorithm 2.B: hardened hash used by R6 (and plain SHA-256 for R5). */
function hash2B(password: Uint8Array, salt: Uint8Array, udata: Uint8Array, r: number): Uint8Array {
  let k = sha256(concatBytes([password, salt, udata]));
  if (r < 6) return k;

  let round = 0;
  for (;;) {
    // K1 = 64 repetitions of (password || K || udata)
    const block = concatBytes([password, k, udata]);
    const k1 = new Uint8Array(block.length * 64);
    for (let i = 0; i < 64; i++) k1.set(block, i * block.length);

    const e = aesCbcEncryptNoPad(k.subarray(0, 16), k.subarray(16, 32), k1);

    let mod = 0;
    for (let i = 0; i < 16; i++) mod += e[i]!;
    mod %= 3;
    if (mod === 0) k = sha256(e);
    else if (mod === 1) k = sha384(e);
    else k = sha512(e);

    round++;
    if (round >= 64 && e[e.length - 1]! <= round - 32) break;
  }
  return k.subarray(0, 32).slice();
}

export function createStandardSecurityHandler(params: SecurityParams): SecurityHandler {
  return new StandardSecurityHandler(params);
}
