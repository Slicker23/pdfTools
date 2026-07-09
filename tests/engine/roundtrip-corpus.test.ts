import { describe, expect, it } from "vitest";
import {
  CosDocument,
  ObjectParser,
  parseCosObject,
  serializeCosObject,
} from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { cosEqual, loadCorpus, loadCorpusFile } from "./util";

describe("round-trip over corpus", () => {
  const corpus = loadCorpus();

  for (const entry of corpus) {
    it(`${entry.file}: objects re-parse/serialize consistently`, async () => {
      const bytes = loadCorpusFile(entry.file);
      const doc = await CosDocument.open(bytes, {
        inflate: nodeAdapters.inflate,
        password: entry.password ?? "",
      });

      let checked = 0;
      for (const num of doc.objectNumbers()) {
        const e = doc.xrefEntry(num);
        if (!e || e.kind !== "inuse") continue;
        const obj = doc.getObject(num);
        if (obj.type === "null") continue;

        // Raw-span byte stability only holds for unencrypted files (getObject
        // returns decrypted content, the raw span is still ciphertext).
        if (!entry.encrypted) {
          const raw = doc.rawIndirectObjectBytes(num);
          expect(raw, `raw span obj ${num}`).toBeDefined();
          const reparsed = new ObjectParser(raw!, 0).parseIndirectObject().obj;
          expect(cosEqual(reparsed, obj), `raw re-parse obj ${num} of ${entry.file}`).toBe(true);
        }

        // serialize -> parse structure preservation (skip streams: their raw is
        // re-emitted verbatim and validated by the raw-span check above).
        if (obj.type !== "stream") {
          const rt = parseCosObject(serializeCosObject(obj));
          expect(cosEqual(rt, obj), `serialize/parse obj ${num} of ${entry.file}`).toBe(true);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
});
