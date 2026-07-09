import { describe, expect, it } from "vitest";
import { browserDeflateAsync } from "../../src/lib/pdf-engine/browser/platform-browser";
import { browserAdapters } from "../../src/lib/pdf-engine/browser/platform-browser";

describe("browserDeflateAsync", () => {
  it("round-trips with browser inflate", async () => {
    const original = new Uint8Array([120, 156, 1, 2, 3, 4, 5]); // not valid - use simple payload
    const payload = new Uint8Array(128);
    for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;

    const deflated = await browserDeflateAsync(payload);
    expect(deflated.length).toBeGreaterThan(0);

    const inflated = await browserAdapters.inflate(deflated);
    expect(inflated).toEqual(payload);
  });
});
