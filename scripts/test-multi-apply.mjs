import { readFileSync, writeFileSync } from "fs";
import { pdfEngineApply, pdfEngineExtract } from "../src/lib/pdf-engine/run.ts";

const input = readFileSync("CristianCosminCiobanu_1.pdf");
const model = await pdfEngineExtract(input);

// Mimic last browser patch (overlay + native mix)
const ids = ["p1:s8:o238", "p1:s8:o363", "p1:s8:o465", "p1:s8:o593"];
const patch = {
  documentId: model.documentId,
  blocks: ids.map((id) => {
    const b = model.pages.flatMap((p) => p.blocks).find((x) => x.id === id);
    if (!b) throw new Error("missing " + id);
    return {
      id: b.id,
      page: b.page,
      text: b.id === "p1:s8:o238" ? "CRISTIAX" : b.text.slice(0, 3) + "…",
      bbox: b.bbox,
      font: b.font,
      lineCount: b.lineCount,
      baselineY: b.baselineY,
      locator: b.locator,
      modified: true,
      overlay: b.id === "p1:s8:o238" || b.id === "p1:s8:o363",
    };
  }),
};

console.log("patch blocks:", patch.blocks.length);
const out = await pdfEngineApply(input, patch);
writeFileSync("CristianCosminCiobanu_1.multi-test.pdf", out);

const m2 = await pdfEngineExtract(out);
const orig = model.pages.flatMap((p) => p.blocks);
const neu = m2.pages.flatMap((p) => p.blocks);
let changed = 0;
for (const id of ids) {
  const a = orig.find((b) => b.id === id);
  const n = neu.find((b) => b.id === id);
  console.log(id, "was:", JSON.stringify(a?.text?.slice(0, 40)), "now:", JSON.stringify(n?.text?.slice(0, 40) ?? "(gone)"));
  if (a?.text !== n?.text) changed++;
}
console.log("changed count:", changed, "out bytes:", out.length, "prefixStable:", out.subarray(0, input.length).equals(input));
