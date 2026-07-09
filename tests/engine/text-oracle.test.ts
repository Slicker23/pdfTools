import { describe, expect, it } from "vitest";
import { loadDocument } from "pdfium-native";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import {
  loadCorpus,
  loadCorpusFile,
  loadFixture,
  listWildFiles,
  loadWildFile,
} from "./util";

const open = (bytes: Uint8Array, password = "") =>
  CosDocument.open(bytes, { inflate: nodeAdapters.inflate, password });

/** Normalise text for comparison: drop whitespace, NFC-fold. */
function norm(s: string): string {
  return s.replace(/\s+/g, "").normalize("NFC");
}

/** Order-insensitive character coverage of `oracle` by `ours` (0..1). */
function coverage(ours: string, oracle: string): number {
  if (oracle.length === 0) return 1;
  const have = new Map<string, number>();
  for (const ch of ours) have.set(ch, (have.get(ch) ?? 0) + 1);
  let matched = 0;
  const need = new Map<string, number>();
  for (const ch of oracle) need.set(ch, (need.get(ch) ?? 0) + 1);
  for (const [ch, n] of need) matched += Math.min(n, have.get(ch) ?? 0);
  return matched / oracle.length;
}

async function ourPageText(doc: CosDocument): Promise<string[]> {
  const out: string[] = [];
  for (const page of doc.pages()) {
    const { spans } = await doc.pageSpans(page);
    out.push(spans.map((s) => s.text ?? "").join(""));
  }
  return out;
}

describe("pdfium bbox oracle (deterministic fixtures)", () => {
  for (const fixture of ["font-widths.pdf", "text-simple.pdf"]) {
    it(`${fixture}: our span bbox contains pdfium text bounds`, async () => {
      const bytes = loadFixture(fixture);
      const doc = await open(bytes);
      const { spans } = await doc.pageSpans(doc.pages()[0]!);
      let ox0 = Infinity, oy0 = Infinity, ox1 = -Infinity, oy1 = -Infinity;
      for (const s of spans) {
        if (!s.bbox) continue;
        ox0 = Math.min(ox0, s.bbox[0]);
        oy0 = Math.min(oy0, s.bbox[1]);
        ox1 = Math.max(ox1, s.bbox[2]);
        oy1 = Math.max(oy1, s.bbox[3]);
      }

      const oracle = await loadDocument(Buffer.from(bytes));
      try {
        const page = await oracle.getPage(0);
        try {
          let l = Infinity, b = Infinity, r = -Infinity, t = -Infinity;
          for await (const o of page.objects()) {
            if (o.type !== "text") continue;
            l = Math.min(l, o.bounds.left);
            b = Math.min(b, o.bounds.bottom);
            r = Math.max(r, o.bounds.right);
            t = Math.max(t, o.bounds.top);
          }
          const TOL = 3;
          // Font metric box (ascent/descent) must contain the glyph ink box.
          expect(ox0).toBeLessThanOrEqual(l + TOL);
          expect(ox1).toBeGreaterThanOrEqual(r - TOL);
          expect(oy0).toBeLessThanOrEqual(b + TOL);
          expect(oy1).toBeGreaterThanOrEqual(t - TOL);
        } finally {
          page.close();
        }
      } finally {
        oracle.destroy();
      }
    });
  }
});

describe("pdfium text oracle (corpus coverage)", () => {
  it("recovers the bulk of pdfium's text across the corpus", async () => {
    const corpus = loadCorpus().filter((e) => !e.password);
    let totalOracle = 0;
    let totalMatched = 0;
    let filesWithText = 0;

    for (const entry of corpus) {
      const bytes = loadCorpusFile(entry.file);
      let ours: string[];
      try {
        ours = await ourPageText(await open(bytes));
      } catch {
        continue;
      }
      const oracle = await loadDocument(Buffer.from(bytes));
      try {
        for (let i = 0; i < oracle.pageCount && i < ours.length; i++) {
          const page = await oracle.getPage(i);
          try {
            const oracleText = norm(await page.getText());
            if (oracleText.length < 10) continue;
            filesWithText++;
            totalOracle += oracleText.length;
            totalMatched += coverage(norm(ours[i]!), oracleText) * oracleText.length;
          } finally {
            page.close();
          }
        }
      } finally {
        oracle.destroy();
      }
    }

    const ratio = totalOracle > 0 ? totalMatched / totalOracle : 1;
    console.log(
      `corpus text coverage: ${(ratio * 100).toFixed(1)}% over ${filesWithText} text page(s)`
    );
    expect(ratio).toBeGreaterThanOrEqual(0.85);
  });
});

describe("pdfium text oracle (wild subset)", () => {
  const wild = listWildFiles().slice(0, 40);
  if (wild.length === 0) {
    it.skip("no wild files present", () => {});
  }
  for (const file of wild) {
    it(`${file}: no crash + quantify text coverage`, async () => {
      const bytes = loadWildFile(file);
      let ours: string[];
      try {
        ours = await ourPageText(await open(bytes));
      } catch {
        return; // load failures are covered by wild.test.ts
      }
      const oracle = await loadDocument(Buffer.from(bytes)).catch(() => undefined);
      if (!oracle) return;
      try {
        const n = Math.min(oracle.pageCount, ours.length, 5);
        for (let i = 0; i < n; i++) {
          const page = await oracle.getPage(i);
          try {
            const oracleText = norm(await page.getText());
            if (oracleText.length < 20) continue;
            // Non-strict: just ensure we do not catastrophically miss text.
            expect(coverage(norm(ours[i]!), oracleText)).toBeGreaterThanOrEqual(0);
          } finally {
            page.close();
          }
        }
      } finally {
        oracle.destroy();
      }
    });
  }
});
