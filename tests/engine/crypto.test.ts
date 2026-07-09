import { describe, expect, it } from "vitest";
import { md5 } from "../../src/lib/pdf-engine/core/crypto/md5";
import { rc4 } from "../../src/lib/pdf-engine/core/crypto/rc4";
import { sha256, sha384, sha512 } from "../../src/lib/pdf-engine/core/crypto/sha2";
import {
  aesCbcDecrypt,
  aesCbcEncryptNoPad,
} from "../../src/lib/pdf-engine/core/crypto/aes";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { ascii, fromHex, loadFixture, toHex } from "./util";

describe("crypto primitives (known-answer vectors)", () => {
  it("MD5", () => {
    expect(toHex(md5(ascii("")))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(toHex(md5(ascii("abc")))).toBe("900150983cd24fb0d6963f7d28e17f72");
  });

  it("SHA-256 / 384 / 512", () => {
    expect(toHex(sha256(ascii("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(toHex(sha384(ascii("abc")))).toBe(
      "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7"
    );
    expect(toHex(sha512(ascii("abc")))).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
    );
  });

  it("RC4", () => {
    expect(toHex(rc4(ascii("Key"), ascii("Plaintext")))).toBe("bbf316e8d940af0ad3");
  });

  it("AES-128 block (FIPS-197)", () => {
    const key = fromHex("000102030405060708090a0b0c0d0e0f");
    const pt = fromHex("00112233445566778899aabbccddeeff");
    const iv = new Uint8Array(16);
    const ct = aesCbcEncryptNoPad(key, iv, pt);
    expect(toHex(ct)).toBe("69c4e0d86a7b0430d8cdb78070b4c55a");
    expect(toHex(aesCbcDecrypt(key, iv, ct, false))).toBe(toHex(pt));
  });

  it("AES-256 block (FIPS-197)", () => {
    const key = fromHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    const pt = fromHex("00112233445566778899aabbccddeeff");
    const iv = new Uint8Array(16);
    const ct = aesCbcEncryptNoPad(key, iv, pt);
    expect(toHex(ct)).toBe("8ea2b7ca516745bfeafc49904b496089");
    expect(toHex(aesCbcDecrypt(key, iv, ct, false))).toBe(toHex(pt));
  });
});

describe("encrypted PDF decryption (empty user password)", () => {
  const fixtures = ["rc4-128.pdf", "aes-128.pdf", "aes-256.pdf"];

  for (const name of fixtures) {
    it(`opens and decrypts enc/${name}`, async () => {
      const bytes = loadFixture(`enc/${name}`);
      const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });
      expect(doc.encrypted).toBe(true);

      const pages = doc.pages();
      expect(pages.length).toBe(1);
      expect(Math.round(pages[0]!.width)).toBe(595);
      expect(Math.round(pages[0]!.height)).toBe(842);

      const contents = doc.get(pages[0]!.dict, "Contents");
      const decoded = await doc.decodeStream(contents);
      const text = Buffer.from(decoded).toString("latin1");
      expect(text).toContain("John Developer");
    });
  }
});
