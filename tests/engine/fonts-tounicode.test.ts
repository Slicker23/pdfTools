import { describe, expect, it } from "vitest";
import { parseToUnicode } from "../../src/lib/pdf-engine/core";
import { ascii } from "./util";

describe("parseToUnicode", () => {
  it("parses beginbfchar single mappings", () => {
    const cmap = parseToUnicode(
      ascii(
        "begincmap\n1 begincodespacerange <00> <ff> endcodespacerange\n" +
          "2 beginbfchar <41> <0041> <42> <00E9> endbfchar\nendcmap\n"
      )
    );
    expect(cmap.lookup(0x41)).toBe("A");
    expect(cmap.lookup(0x42)).toBe("\u00e9");
    expect(cmap.lookup(0x43)).toBeUndefined();
  });

  it("parses beginbfrange with an incrementing destination", () => {
    const cmap = parseToUnicode(
      ascii("1 beginbfrange <0000> <0002> <0041> endbfrange\n")
    );
    expect(cmap.lookup(0)).toBe("A");
    expect(cmap.lookup(1)).toBe("B");
    expect(cmap.lookup(2)).toBe("C");
  });

  it("parses beginbfrange with an array destination", () => {
    const cmap = parseToUnicode(
      ascii("1 beginbfrange <0010> <0012> [<0041> <0042> <0043>] endbfrange\n")
    );
    expect(cmap.lookup(0x10)).toBe("A");
    expect(cmap.lookup(0x11)).toBe("B");
    expect(cmap.lookup(0x12)).toBe("C");
  });

  it("handles multi-code-unit (surrogate/ligature) destinations", () => {
    const cmap = parseToUnicode(ascii("1 beginbfchar <01> <00660069> endbfchar\n"));
    expect(cmap.lookup(1)).toBe("fi");
  });
});
