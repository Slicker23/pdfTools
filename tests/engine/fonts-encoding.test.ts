import { describe, expect, it } from "vitest";
import {
  baseEncodingFromName,
  glyphNameToUnicode,
  resolveSimpleEncoding,
} from "../../src/lib/pdf-engine/core";

describe("glyphNameToUnicode", () => {
  it("resolves AGL names", () => {
    expect(glyphNameToUnicode("A")).toBe("A");
    expect(glyphNameToUnicode("space")).toBe(" ");
    expect(glyphNameToUnicode("eacute")).toBe("\u00e9");
    expect(glyphNameToUnicode("ampersand")).toBe("&");
  });

  it("resolves uniXXXX (single and multiple)", () => {
    expect(glyphNameToUnicode("uni0041")).toBe("A");
    expect(glyphNameToUnicode("uni00410042")).toBe("AB");
    expect(glyphNameToUnicode("uni20AC")).toBe("\u20ac");
  });

  it("resolves uXXXXXX code points", () => {
    expect(glyphNameToUnicode("u0041")).toBe("A");
    expect(glyphNameToUnicode("u1F600")).toBe("\u{1f600}");
  });

  it("resolves ligature and suffixed names", () => {
    expect(glyphNameToUnicode("f_i")).toBe("fi");
    expect(glyphNameToUnicode("A.sc")).toBe("A");
  });

  it("returns undefined for unknown names", () => {
    expect(glyphNameToUnicode("g123")).toBeUndefined();
    expect(glyphNameToUnicode(".notdef")).toBeUndefined();
    expect(glyphNameToUnicode("")).toBeUndefined();
  });
});

describe("baseEncodingFromName", () => {
  it("maps known base encoding names", () => {
    expect(baseEncodingFromName("WinAnsiEncoding")).toBe("WinAnsiEncoding");
    expect(baseEncodingFromName("MacRomanEncoding")).toBe("MacRomanEncoding");
    expect(baseEncodingFromName("StandardEncoding")).toBe("StandardEncoding");
    expect(baseEncodingFromName("Bogus")).toBeUndefined();
  });
});

describe("resolveSimpleEncoding", () => {
  it("WinAnsi base maps codes to names and Unicode", () => {
    const { names, unicode } = resolveSimpleEncoding({ baseEncoding: "WinAnsiEncoding" });
    expect(names[65]).toBe("A");
    expect(unicode[65]).toBe("A");
    expect(names[0xe9]).toBe("eacute");
    expect(unicode[0xe9]).toBe("\u00e9");
  });

  it("applies /Differences over the base encoding", () => {
    const differences = new Map<number, string>([[65, "eacute"]]);
    const { names, unicode } = resolveSimpleEncoding({
      baseEncoding: "WinAnsiEncoding",
      differences,
    });
    expect(names[65]).toBe("eacute");
    expect(unicode[65]).toBe("\u00e9");
  });

  it("defaults nonsymbolic fonts to StandardEncoding", () => {
    const { unicode } = resolveSimpleEncoding({ symbolic: false });
    expect(unicode[65]).toBe("A");
  });

  it("falls back to StandardEncoding for a symbolic font with no base encoding", () => {
    // We can't read a symbolic font's built-in encoding, so we default to
    // StandardEncoding rather than emitting no text for ASCII/Latin codes.
    const { names, unicode } = resolveSimpleEncoding({ symbolic: true });
    expect(names[65]).toBe("A");
    expect(unicode[65]).toBe("A");
  });
});
