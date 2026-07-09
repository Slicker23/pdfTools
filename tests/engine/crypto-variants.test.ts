import { describe, expect, it } from "vitest";
import { CosDocument, dictGet, isString } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import { loadCorpus, loadCorpusFile } from "./util";

async function open(file: string, password = "") {
  return CosDocument.open(loadCorpusFile(file), {
    inflate: nodeAdapters.inflate,
    password,
  });
}

async function pageText(doc: CosDocument): Promise<string> {
  const contents = doc.get(doc.pages()[0]!.dict, "Contents");
  const decoded = await doc.decodeStream(contents);
  return Buffer.from(decoded).toString("latin1");
}

function title(doc: CosDocument): string | undefined {
  const info = doc.resolve(dictGet(doc.trailer, "Info"));
  const t = dictGet(info, "Title");
  return isString(t) ? Buffer.from(t.bytes).toString("latin1") : undefined;
}

describe("encryption variants", () => {
  const emptyPw = loadCorpus().filter((e) => e.encrypted && !e.password);

  for (const entry of emptyPw) {
    it(`${entry.file}: decrypts stream + string with empty password`, async () => {
      const doc = await open(entry.file);
      expect(doc.encrypted).toBe(true);
      expect(await pageText(doc)).toContain("John Developer");
      expect(title(doc)).toBe("Secret Title 123");
    });
  }

  it("enc_aes256_userpw.pdf: opens with owner password, garbles with wrong one", async () => {
    const ok = await open("enc_aes256_userpw.pdf", "ownerpw");
    expect(await pageText(ok)).toContain("John Developer");
    expect(title(ok)).toBe("Secret Title 123");

    // Wrong password must NOT recover the plaintext.
    const bad = await open("enc_aes256_userpw.pdf", "wrong-password");
    let badText = "";
    try {
      badText = await pageText(bad);
    } catch {
      badText = "";
    }
    expect(badText).not.toContain("John Developer");
  });
});
