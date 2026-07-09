import { readFileSync } from "fs";
import { pdfEngineApply, pdfEngineExtract } from "../src/lib/pdf-engine/run.ts";

const input = readFileSync("CristianCosminCiobanu_1.pdf");
const model = await pdfEngineExtract(input);
const target = model.pages[0].blocks.find((b) => b.id === "p1:s8:o238");
console.log("original:", JSON.stringify(target.text));

for (const newText of ["CRISTIAN", "CRISTIAn", "CRISTIA", "CRISTIAX", "CRISTIAN!"]) {
  const patch = {
    documentId: model.documentId,
    blocks: [{ ...target, text: newText, modified: true, locator: target.locator }],
  };
  const out = await pdfEngineApply(input, patch);
  const m2 = await pdfEngineExtract(out);
  const b2 = m2.pages.flatMap((p) => p.blocks).find((b) => b.locator === target.locator);
  const prefixStable = out.subarray(0, input.length).equals(input);
  console.log({ newText, got: b2?.text, prefixStable, match: b2?.text === newText });
}
