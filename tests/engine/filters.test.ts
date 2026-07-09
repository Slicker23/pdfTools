import { describe, expect, it } from "vitest";
import { asciiHexDecode, ascii85Decode } from "../../src/lib/pdf-engine/core/filters/ascii";
import { runLengthDecode } from "../../src/lib/pdf-engine/core/filters/runlength";
import { lzwDecode } from "../../src/lib/pdf-engine/core/filters/lzw";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { ascii, fromHex } from "./util";

function bytes(...b: number[]): Uint8Array {
  return Uint8Array.from(b);
}

// Minimal ASCII85 encoder (test-only) to check the decoder inverts it.
function ascii85Encode(data: Uint8Array): Uint8Array {
  let out = "";
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.min(4, data.length - i);
    let v = 0;
    for (let k = 0; k < 4; k++) v = v * 256 + (k < n ? data[i + k]! : 0);
    if (n === 4 && v === 0) {
      out += "z";
      continue;
    }
    const chars: string[] = [];
    let x = v;
    for (let j = 0; j < 5; j++) {
      chars.unshift(String.fromCharCode((x % 85) + 33));
      x = Math.floor(x / 85);
    }
    out += chars.slice(0, n + 1).join("");
  }
  return ascii(out + "~>");
}

function mulberry32(seed: number) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("M1 filters", () => {
  it("ASCIIHexDecode", () => {
    expect(Buffer.from(asciiHexDecode(ascii("48656C6C6F>"))).toString()).toBe("Hello");
    expect(Buffer.from(asciiHexDecode(ascii("48 65 6c 6c 6f >"))).toString()).toBe("Hello");
    // Trailing nibble padded with 0.
    expect(Array.from(asciiHexDecode(ascii("4>")))).toEqual([0x40]);
  });

  it("RunLengthDecode", () => {
    // 253 -> repeat next byte (257-253)=4 times; 2 -> copy next 3 literally; 128 EOD.
    const input = bytes(253, 0x41, 2, 0x42, 0x43, 0x44, 128, 0x00);
    expect(Buffer.from(runLengthDecode(input)).toString()).toBe("AAAABCD");
  });

  it("ASCII85Decode: 'z', EOD, whitespace", () => {
    expect(Array.from(ascii85Decode(ascii("z~>")))).toEqual([0, 0, 0, 0]);
    expect(Array.from(ascii85Decode(ascii("<~z~>")))).toEqual([0, 0, 0, 0]);
    // Whitespace between chars is ignored.
    const enc = ascii85Encode(ascii("Hello, World!"));
    const spaced = ascii(Buffer.from(enc).toString("latin1").split("").join(" "));
    expect(Buffer.from(ascii85Decode(spaced)).toString()).toBe("Hello, World!");
  });

  it("ASCII85Decode inverts the encoder for random buffers", () => {
    const rand = mulberry32(7);
    for (let len = 0; len <= 40; len++) {
      const buf = new Uint8Array(len);
      for (let i = 0; i < len; i++) buf[i] = Math.floor(rand() * 256);
      const decoded = ascii85Decode(ascii85Encode(buf));
      expect(Array.from(decoded)).toEqual(Array.from(buf));
    }
  });

  it("LZWDecode (canonical PDF spec example)", () => {
    // "-----A---B" encodes to 80 0B 60 50 22 0C 0C 85 01
    const decoded = lzwDecode(fromHex("800B6050220C0C8501"));
    expect(Array.from(decoded)).toEqual([45, 45, 45, 45, 45, 65, 45, 45, 45, 66]);
  });

  it("wires ASCIIHexDecode through CosDocument.decodeStream", async () => {
    const pdf =
      "%PDF-1.7\n" +
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n" +
      "4 0 obj<</Length 11/Filter/ASCIIHexDecode>>stream\n48656C6C6F>\nendstream endobj\n" +
      "%%EOF\n";
    const doc = await CosDocument.open(ascii(pdf), { inflate: nodeAdapters.inflate });
    expect(doc.pages().length).toBe(1);
    const contents = doc.get(doc.pages()[0]!.dict, "Contents");
    const decoded = await doc.decodeStream(contents);
    expect(Buffer.from(decoded).toString()).toBe("Hello");
  });
});
