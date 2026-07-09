import { describe, expect, it } from "vitest";
import { parseCosObject } from "../../src/lib/pdf-engine/core";
import { ascii } from "./util";

function parse(src: string) {
  return parseCosObject(ascii(src));
}

describe("COS lexer / object parser", () => {
  it("parses integers and reals", () => {
    expect(parse("42")).toMatchObject({ type: "int", value: 42 });
    expect(parse("-7")).toMatchObject({ type: "int", value: -7 });
    expect(parse("3.14")).toMatchObject({ type: "real", value: 3.14 });
    expect(parse("-.5")).toMatchObject({ type: "real", value: -0.5 });
    expect(parse("4.")).toMatchObject({ type: "real", value: 4 });
  });

  it("parses booleans and null", () => {
    expect(parse("true")).toMatchObject({ type: "bool", value: true });
    expect(parse("false")).toMatchObject({ type: "bool", value: false });
    expect(parse("null")).toMatchObject({ type: "null" });
  });

  it("parses names with #xx escapes", () => {
    const n = parse("/Name#20With#20Spaces");
    expect(n).toMatchObject({ type: "name", name: "Name With Spaces" });
    expect(parse("/A#42C")).toMatchObject({ type: "name", name: "ABC" });
  });

  it("parses literal strings with escapes and nested parens", () => {
    const s = parse("(a\\(b\\)c)");
    expect(s.type).toBe("string");
    if (s.type === "string") expect(Array.from(s.bytes)).toEqual(Array.from(ascii("a(b)c")));

    const nested = parse("(a(b)c)");
    if (nested.type === "string") {
      expect(Array.from(nested.bytes)).toEqual(Array.from(ascii("a(b)c")));
    }

    const octal = parse("(\\101\\102)");
    if (octal.type === "string") {
      expect(Array.from(octal.bytes)).toEqual(Array.from(ascii("AB")));
    }

    const escapes = parse("(line1\\nline2\\t!)");
    if (escapes.type === "string") {
      expect(Array.from(escapes.bytes)).toEqual([
        ...Array.from(ascii("line1")),
        0x0a,
        ...Array.from(ascii("line2")),
        0x09,
        0x21,
      ]);
    }
  });

  it("parses hex strings", () => {
    const s = parse("<48656C6C6F>");
    if (s.type === "string") {
      expect(Array.from(s.bytes)).toEqual(Array.from(ascii("Hello")));
      expect(s.hex).toBe(true);
    }
    // Odd number of digits -> last nibble padded with 0.
    const odd = parse("<4>");
    if (odd.type === "string") expect(Array.from(odd.bytes)).toEqual([0x40]);
  });

  it("parses references vs plain integers", () => {
    expect(parse("12 0 R")).toMatchObject({ type: "ref", num: 12, gen: 0 });
    expect(parse("12 0")).toMatchObject({ type: "int", value: 12 });
  });

  it("parses arrays with mixed element types", () => {
    const a = parse("[1 2.5 (x) /Y 3 0 R]");
    expect(a.type).toBe("array");
    if (a.type === "array") {
      expect(a.items.map((i) => i.type)).toEqual([
        "int",
        "real",
        "string",
        "name",
        "ref",
      ]);
    }
  });

  it("parses dictionaries", () => {
    const d = parse("<< /A 1 /B [2 3] /C << /D (x) >> >>");
    expect(d.type).toBe("dict");
    if (d.type === "dict") {
      expect(d.map.get("A")).toMatchObject({ type: "int", value: 1 });
      expect(d.map.get("B")?.type).toBe("array");
      expect(d.map.get("C")?.type).toBe("dict");
    }
  });

  it("skips comments", () => {
    expect(parse("% a comment\n42")).toMatchObject({ type: "int", value: 42 });
  });
});
