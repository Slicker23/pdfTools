import { describe, expect, it } from "vitest";
import {
  asName,
  asNumber,
  isArray,
  isDict,
  isName,
  isString,
  tokenizeContent,
  type ContentOp,
  type CosObject,
} from "../../src/lib/pdf-engine/core";
import { ascii } from "./util";

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function ops(bytes: Uint8Array): ContentOp[] {
  return [...tokenizeContent(bytes)];
}

const str = (o: CosObject | undefined) =>
  isString(o) ? Buffer.from(o.bytes).toString("latin1") : undefined;

describe("content tokenizer", () => {
  it("groups operands up to each operator", () => {
    const result = ops(ascii("BT /F1 24 Tf 100 700 Td (Hi) Tj ET"));
    expect(result.map((o) => o.op)).toEqual(["BT", "Tf", "Td", "Tj", "ET"]);

    const tf = result[1]!;
    expect(asName(tf.operands[0])).toBe("F1");
    expect(asNumber(tf.operands[1])).toBe(24);

    const td = result[2]!;
    expect(asNumber(td.operands[0])).toBe(100);
    expect(asNumber(td.operands[1])).toBe(700);

    const tj = result[3]!;
    expect(str(tj.operands[0])).toBe("Hi");
  });

  it("parses TJ arrays with mixed strings and numbers", () => {
    const [tj] = ops(ascii("[(A) -20 (B) 5 (C)] TJ"));
    expect(tj!.op).toBe("TJ");
    const arr = tj!.operands[0]!;
    expect(isArray(arr)).toBe(true);
    if (!isArray(arr)) return;
    expect(arr.items.length).toBe(5);
    expect(str(arr.items[0])).toBe("A");
    expect(asNumber(arr.items[1])).toBe(-20);
    expect(str(arr.items[2])).toBe("B");
    expect(asNumber(arr.items[3])).toBe(5);
    expect(str(arr.items[4])).toBe("C");
  });

  it("parses a dictionary operand (BDC)", () => {
    const [bdc] = ops(ascii("/OC << /MCID 0 /Foo (bar) >> BDC"));
    expect(bdc!.op).toBe("BDC");
    expect(isName(bdc!.operands[0])).toBe(true);
    expect(asName(bdc!.operands[0])).toBe("OC");
    const dict = bdc!.operands[1]!;
    expect(isDict(dict)).toBe(true);
    if (!isDict(dict)) return;
    expect(asNumber(dict.map.get("MCID"))).toBe(0);
    expect(str(dict.map.get("Foo"))).toBe("bar");
  });

  it("captures boolean/null operands (not as operators)", () => {
    const result = ops(ascii("true false null /GS1 gs"));
    expect(result.length).toBe(1);
    const gs = result[0]!;
    expect(gs.op).toBe("gs");
    expect(gs.operands.map((o) => o.type)).toEqual(["bool", "bool", "null", "name"]);
  });

  it("skips an inline image without corrupting following operators", () => {
    // BI ... ID <4 raw bytes> EI  then a normal Tf must still parse.
    const bytes = concat(
      ascii("q BI /W 2 /H 1 /CS /G /BPC 8 ID "),
      new Uint8Array([0xff, 0x00, 0xff, 0x00]),
      ascii(" EI\n/F1 12 Tf 0 0 Td (z) Tj Q"),
    );
    const result = ops(bytes);
    expect(result.map((o) => o.op)).toEqual(["q", "Tf", "Td", "Tj", "Q"]);
    expect(asName(result[1]!.operands[0])).toBe("F1");
    expect(asNumber(result[1]!.operands[1])).toBe(12);
  });

  it("recovers when the EI terminator lacks a preceding whitespace", () => {
    // Some producers end binary image data on any byte, immediately followed by
    // EI (no whitespace before). The scan must still terminate at that EI via the
    // fallback instead of running to EOF and dropping following operators.
    const bytes = ascii("BI /W 2 /H 1 /CS /G /BPC 8 ID abEI\n(after) Tj");
    const result = ops(bytes);
    expect(result.map((o) => o.op)).toEqual(["Tj"]);
    expect(str(result[0]!.operands[0])).toBe("after");
  });

  it("does not mistake raw image bytes containing 'EI' for the terminator", () => {
    // The raw data contains the bytes 'E','I' but not whitespace-delimited, so
    // the real (delimited) EI must be the one that ends the image.
    const bytes = concat(
      ascii("BI /W 3 /H 1 /CS /G /BPC 8 ID "),
      new Uint8Array([0x45, 0x49, 0x41]), // "EIA" - not a valid EI (no ws before/after E)
      ascii(" EI\n(after) Tj"),
    );
    const result = ops(bytes);
    expect(result.map((o) => o.op)).toEqual(["Tj"]);
    expect(str(result[0]!.operands[0])).toBe("after");
  });
});
