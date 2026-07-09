import { describe, expect, it } from "vitest";
import { identityCMap, parseCMapStream, predefinedCMap } from "../../src/lib/pdf-engine/core";
import { ascii } from "./util";

describe("identity CMap", () => {
  it("reads 2-byte codes with CID = code", () => {
    const cmap = identityCMap(0);
    const bytes = new Uint8Array([0x00, 0x41, 0x12, 0x34]);
    const a = cmap.next(bytes, 0);
    expect(a).toMatchObject({ code: 0x41, cid: 0x41, byteLen: 2 });
    const b = cmap.next(bytes, 2);
    expect(b).toMatchObject({ code: 0x1234, cid: 0x1234, byteLen: 2 });
  });

  it("resolves predefined Identity names", () => {
    expect(predefinedCMap("Identity-H")?.wmode).toBe(0);
    expect(predefinedCMap("Identity-V")?.wmode).toBe(1);
    expect(predefinedCMap("Adobe-Japan1-0")).toBeUndefined();
  });
});

describe("embedded CMap stream", () => {
  it("decodes codespace + cidrange + cidchar", () => {
    const cmap = parseCMapStream(
      ascii(
        "begincmap\n" +
          "1 begincodespacerange <0000> <ffff> endcodespacerange\n" +
          "1 begincidrange <0000> <000f> 10 endcidrange\n" +
          "1 begincidchar <0020> 99 endcidchar\n" +
          "endcmap\n"
      )
    );
    const bytes = new Uint8Array([0x00, 0x01, 0x00, 0x20]);
    const a = cmap.next(bytes, 0);
    expect(a).toMatchObject({ code: 1, cid: 11, byteLen: 2 }); // 10 + (1-0)
    const b = cmap.next(bytes, 2);
    expect(b).toMatchObject({ code: 0x20, cid: 99, byteLen: 2 });
  });
});
