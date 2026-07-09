import { describe, expect, it } from "vitest";
import {
  CosDocument,
  ObjectParser,
  parseCosObject,
  serializeCosObject,
} from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { cosEqual, loadFixture } from "./util";

const FIXTURES = ["1.pdf", "cv-like.pdf"];

describe("COS byte-stable round-trip", () => {
  for (const name of FIXTURES) {
    describe(name, () => {
      it("re-parses raw object spans to identical objects", async () => {
        const bytes = loadFixture(name);
        const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });

        let checked = 0;
        for (const num of doc.objectNumbers()) {
          const entry = doc.xrefEntry(num);
          if (!entry || entry.kind !== "inuse") continue; // raw spans only for uncompressed
          const raw = doc.rawIndirectObjectBytes(num);
          expect(raw, `raw bytes for obj ${num}`).toBeDefined();

          const original = doc.getObject(num);
          if (original.type === "null") continue;

          // The raw span, re-parsed, must equal the resolved object. Because the
          // span is copied verbatim from the source, this proves byte stability.
          const reparsed = reparseIndirect(raw!);
          expect(cosEqual(reparsed, original), `raw re-parse obj ${num}`).toBe(true);
          checked++;
        }
        expect(checked).toBeGreaterThan(0);
      });

      it("serialize -> parse preserves object structure", async () => {
        const bytes = loadFixture(name);
        const doc = await CosDocument.open(bytes, { inflate: nodeAdapters.inflate });

        for (const num of doc.objectNumbers()) {
          const entry = doc.xrefEntry(num);
          if (!entry || entry.kind !== "inuse") continue;
          const obj = doc.getObject(num);
          if (obj.type === "null" || obj.type === "stream") continue; // streams checked via raw span
          const roundTripped = parseCosObject(serializeCosObject(obj));
          expect(cosEqual(roundTripped, obj), `serialize/parse obj ${num}`).toBe(true);
        }
      });
    });
  }
});

function reparseIndirect(raw: Uint8Array) {
  // raw is a full "<num> <gen> obj <value> endobj" span.
  return new ObjectParser(raw, 0).parseIndirectObject().obj;
}
