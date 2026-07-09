import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { pdfEngineExtract, pdfEngineApply } from "../../src/lib/pdf-engine/run";
import { CosDocument } from "../../src/lib/pdf-engine/core";
import { nodeAdapters } from "../../src/lib/pdf-engine/node/platform-node";
import type { PdfEditPatch, PdfEditTextBlock } from "../../src/lib/pdf/edit-model";

const WILD = path.join(process.cwd(), "tests/fixtures/wild");

function collectPdfs(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) collectPdfs(full, out);
    else if (name.toLowerCase().endsWith(".pdf")) out.push(full);
  }
  return out;
}

function pickBlock(doc: Awaited<ReturnType<typeof pdfEngineExtract>>): PdfEditTextBlock | undefined {
  for (const page of doc.pages) {
    for (const b of page.blocks) {
      if (b.locator && b.text.length >= 3 && /^[\x20-\x7e]+$/.test(b.text)) return b;
    }
  }
  return undefined;
}

describe("wild corpus in-place edit (no corruption)", () => {
  const all = collectPdfs(WILD).sort();
  // Deterministic diverse subset without running the whole corpus.
  const stride = Math.max(1, Math.floor(all.length / 30));
  const sample = all.filter((_, i) => i % stride === 0).slice(0, 30);

  it(`edits a run and keeps ${sample.length} sampled files valid`, async () => {
    expect(sample.length).toBeGreaterThan(0);
    const failures: { file: string; error: string }[] = [];
    let edited = 0;

    for (const file of sample) {
      const rel = path.relative(WILD, file);
      try {
        const input = readFileSync(file);
        // Skip encrypted files (native path declines them by design).
        const doc = await CosDocument.open(new Uint8Array(input), {
          inflate: nodeAdapters.inflate,
        });
        if (doc.encrypted) continue;
        const beforePages = doc.pages().length;

        const model = await pdfEngineExtract(input);
        const block = pickBlock(model);
        if (!block) continue; // no editable run; nothing to exercise

        const t = block.text;
        const newText = t[1]! + t[0]! + t.slice(2);
        const patch: PdfEditPatch = {
          documentId: model.documentId,
          blocks: [
            {
              id: block.id,
              page: block.page,
              text: newText,
              bbox: block.bbox,
              font: block.font,
              locator: block.locator,
              modified: true,
            },
          ],
        };

        const output = await pdfEngineApply(input, patch);
        // If the native path applied, the original bytes are a verbatim prefix.
        const prefixStable = output.subarray(0, input.length).equals(input);

        const doc2 = await CosDocument.open(new Uint8Array(output), {
          inflate: nodeAdapters.inflate,
        });
        if (doc2.pages().length !== beforePages) {
          failures.push({ file: rel, error: `page count ${beforePages} -> ${doc2.pages().length}` });
          continue;
        }
        if (prefixStable) edited++;
      } catch (err) {
        failures.push({ file: rel, error: String((err as Error).message ?? err) });
      }
    }

    if (failures.length) {
      throw new Error(
        `wild edit failures (${failures.length}):\n` +
          failures.map((f) => ` - ${f.file}: ${f.error}`).join("\n")
      );
    }
    // Sanity: at least some sampled files exercised the native in-place path.
    expect(edited).toBeGreaterThan(0);
  });
});
