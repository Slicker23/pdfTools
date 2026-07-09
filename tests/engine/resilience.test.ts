import { describe, expect, it } from "vitest";
import {
  CosDocument,
  ObjectParser,
  parseCosObject,
} from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { ascii, loadCorpusFile } from "./util";

const inflate = nodeAdapters.inflate;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("resilience: malformed / recovered input", () => {
  it("recovers when startxref is missing", async () => {
    const base = Buffer.from(loadCorpusFile("multi_classic.pdf")).toString("latin1");
    const mangled = base.replace(/startxref/g, "STARTZZZZ");
    const doc = await CosDocument.open(new Uint8Array(Buffer.from(mangled, "latin1")), { inflate });
    expect(doc.recovered).toBe(true);
    expect(doc.pages().length).toBe(4);
  });

  it("recovers when the xref table + trailer are chopped off", async () => {
    const base = Buffer.from(loadCorpusFile("multi_classic.pdf")).toString("latin1");
    const cut = base.lastIndexOf("\nxref");
    expect(cut).toBeGreaterThan(0);
    const mangled = base.slice(0, cut);
    const doc = await CosDocument.open(new Uint8Array(Buffer.from(mangled, "latin1")), { inflate });
    expect(doc.recovered).toBe(true);
    expect(doc.pages().length).toBe(4);
  });

  it("recovers when the startxref offset is garbage", async () => {
    const base = Buffer.from(loadCorpusFile("multi_classic.pdf")).toString("latin1");
    const mangled = base.replace(/startxref\s+\d+/, "startxref\n999999999");
    const doc = await CosDocument.open(new Uint8Array(Buffer.from(mangled, "latin1")), { inflate });
    expect(doc.pages().length).toBe(4);
  });

  it("throws (does not hang) on empty / non-PDF input", async () => {
    await expect(CosDocument.open(new Uint8Array(0), { inflate })).rejects.toBeTruthy();
    await expect(
      CosDocument.open(ascii("not a pdf at all"), { inflate })
    ).rejects.toBeTruthy();
  });

  it("guards against pathological nesting instead of stack overflow", () => {
    const deep = "[".repeat(5000) + "]".repeat(5000);
    expect(() => parseCosObject(ascii(deep))).toThrow(/nesting/);
  });

  it("falls back to endstream scan when /Length is wrong", () => {
    const raw = ascii("7 0 obj\n<< /Length 2 >>\nstream\nABCDEFGH\nendstream\nendobj\n");
    const io = new ObjectParser(raw, 0).parseIndirectObject();
    expect(io.obj.type).toBe("stream");
    if (io.obj.type === "stream") {
      expect(Buffer.from(io.obj.raw).toString("latin1")).toBe("ABCDEFGH");
    }
  });

  it("survives random byte-flip fuzzing without hanging or crashing", async () => {
    const base = loadCorpusFile("multi_classic.pdf");
    const rand = mulberry32(1337);
    const ITER = 150;
    let settled = 0;
    for (let i = 0; i < ITER; i++) {
      const b = base.slice();
      const flips = 1 + Math.floor(rand() * 6);
      for (let f = 0; f < flips; f++) {
        b[Math.floor(rand() * b.length)] = Math.floor(rand() * 256);
      }
      try {
        const doc = await CosDocument.open(b, { inflate });
        doc.pages();
      } catch {
        // Controlled failure is acceptable; a hang/crash is not.
      }
      settled++;
    }
    expect(settled).toBe(ITER);
  }, 20000);
});
