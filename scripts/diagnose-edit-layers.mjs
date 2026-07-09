/**
 * Isolate PDF edit issues: engine vs UX/canvas.
 *
 * This script exercises ONLY the engine (extract → apply → re-extract).
 * No browser, no canvas overlays, no pdf-lib whiteout in the UI.
 *
 * Usage:
 *   PDF_PATH=/path/to/your.pdf npx tsx scripts/diagnose-edit-layers.mjs
 *
 * Interpretation:
 *   - If this script shows deleted text still present → ENGINE issue
 *   - If this script passes but the browser download fails → APPLY ROUTING / worker issue
 *   - If this script passes and download passes but canvas flickers → UX/CANVAS issue
 */
import { readFileSync, writeFileSync } from "fs";
import { pdfEngineApply, pdfEngineExtract } from "../src/lib/pdf-engine/run.ts";
import { CosDocument } from "../src/lib/pdf-engine/core/index.ts";
import { nodeAdapters } from "../src/lib/pdf-engine/node/platform-node.ts";

const pdfPath = process.env.PDF_PATH;
if (!pdfPath) {
  console.error("Set PDF_PATH to your test PDF.");
  console.error("  PDF_PATH=./tests/fixtures/cv-like.pdf npx tsx scripts/diagnose-edit-layers.mjs");
  process.exit(1);
}

const input = readFileSync(pdfPath);
const inputU8 = new Uint8Array(input);

function hr(title) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

function pickEditableBlock(doc) {
  for (const page of doc.pages) {
    for (const b of page.blocks) {
      if (b.locator && b.text.trim().length >= 3) return b;
    }
  }
  return undefined;
}

hr("LAYER 0 — Open PDF (engine COS)");
const cos = await CosDocument.open(inputU8, { inflate: nodeAdapters.inflate });
console.log({
  pages: cos.pages().length,
  encrypted: cos.encrypted,
  recovered: cos.recovered,
  objectCount: cos.objectNumbers().length,
});

hr("LAYER 1 — Extract (engine → edit model)");
const model = await pdfEngineExtract(input);
const allBlocks = model.pages.flatMap((p) => p.blocks);
const withLocator = allBlocks.filter((b) => b.locator);
console.log({
  totalBlocks: allBlocks.length,
  withLocator: withLocator.length,
  withoutLocator: allBlocks.length - withLocator.length,
});
if (withLocator.length === 0) {
  console.error("FAIL: no editable blocks with locators — engine extract gap.");
  process.exit(1);
}

const target = pickEditableBlock(model);
console.log("Sample block:", {
  id: target.id,
  page: target.page,
  text: JSON.stringify(target.text.slice(0, 60)),
  locator: target.locator,
});

hr("LAYER 2 — Apply TEXT edit (engine only, no UI)");
const newText = target.text.slice(0, -1) + "X";
// Prefer in-subset edit for baseline; also exercise out-of-subset (hybrid strip+redraw).
const editCases = [
  { label: "in-subset", text: target.text.length > 1 ? target.text.slice(0, -1) + target.text.at(-1).toLowerCase() : target.text },
  { label: "out-of-subset", text: newText },
];
let editOk = false;
for (const ec of editCases) {
  const editPatch = {
    documentId: model.documentId,
    blocks: [
      {
        id: target.id,
        page: target.page,
        text: ec.text,
        bbox: target.bbox,
        font: target.font,
        lineCount: target.lineCount,
        baselineY: target.baselineY,
        locator: target.locator,
        modified: true,
      },
    ],
  };
  const edited = await pdfEngineApply(input, editPatch);
  const editPrefixStable = edited.subarray(0, input.length).equals(input);
  const modelAfterEdit = await pdfEngineExtract(edited);
  const blockAfterEdit = modelAfterEdit.pages.flatMap((p) => p.blocks).find((b) => b.locator === target.locator);
  const allTexts = modelAfterEdit.pages.flatMap((p) => p.blocks).map((b) => b.text);
  const oldStillThere = allTexts.some((t) => t === target.text);
  const newVisible = allTexts.some((t) => t.includes(ec.text)) || ec.text === target.text;
  console.log({
    case: ec.label,
    want: JSON.stringify(ec.text),
    locatorBlock: blockAfterEdit ? JSON.stringify(blockAfterEdit.text.slice(0, 60)) : "(locator run removed)",
    oldStillThere,
    newVisible,
    prefixStable: editPrefixStable,
  });
  if (ec.label === "in-subset" && blockAfterEdit?.text === ec.text) editOk = true;
  if (ec.label === "out-of-subset" && !oldStillThere && newVisible) editOk = true;
}
console.log(editOk ? "PASS: text edit paths OK for this PDF" : "PARTIAL: see cases above");

hr("LAYER 3 — Apply DELETE (engine only)");
const deletePatch = {
  documentId: model.documentId,
  blocks: [
    {
      id: target.id,
      page: target.page,
      text: "",
      bbox: target.bbox,
      font: target.font,
      locator: target.locator,
      deleted: true,
      modified: true,
    },
  ],
};
const deleted = await pdfEngineApply(input, deletePatch);
const deletePrefixStable = deleted.subarray(0, input.length).equals(input);
const modelAfterDelete = await pdfEngineExtract(deleted);
const stillThere = modelAfterDelete.pages
  .flatMap((p) => p.blocks)
  .some((b) => b.locator === target.locator && b.text === target.text);
console.log({
  outputBytes: deleted.length,
  prefixStable: deletePrefixStable,
  originalTextStillExtracted: stillThere,
  stillThereMeans: stillThere
    ? "glyphs still in content stream (engine or overlay whiteout only)"
    : "glyphs removed from content stream",
});
const deleteOk = !stillThere;
console.log(deleteOk ? "PASS: deleted text gone on re-extract" : "FAIL: deleted text still extractable");

hr("LAYER 3b — Clear-to-replace vs clear-and-download-delete");
const replaceText = target.text.length > 2 ? target.text.slice(1) : target.text + "X";
const clearReplacePatch = {
  documentId: model.documentId,
  blocks: [
    {
      id: target.id,
      page: target.page,
      text: replaceText,
      bbox: target.bbox,
      font: target.font,
      lineCount: target.lineCount,
      baselineY: target.baselineY,
      locator: target.locator,
      modified: true,
      deleted: false,
    },
  ],
};
const replaced = await pdfEngineApply(input, clearReplacePatch);
const modelReplace = await pdfEngineExtract(replaced);
const replaceBlock = modelReplace.pages.flatMap((p) => p.blocks).find((b) => b.locator === target.locator);
const replaceOk = replaceBlock?.text === replaceText;
console.log({
  case: "clear-to-replace",
  want: JSON.stringify(replaceText),
  got: replaceBlock ? JSON.stringify(replaceBlock.text.slice(0, 60)) : "(missing)",
  pass: replaceOk,
});

const clearDeletePatch = {
  documentId: model.documentId,
  blocks: [
    {
      id: target.id,
      page: target.page,
      text: "",
      bbox: target.bbox,
      font: target.font,
      locator: target.locator,
      deleted: true,
      modified: true,
    },
  ],
};
const clearedDelete = await pdfEngineApply(input, clearDeletePatch);
const modelClearDelete = await pdfEngineExtract(clearedDelete);
const clearDeleteStillThere = modelClearDelete.pages
  .flatMap((p) => p.blocks)
  .some((b) => b.locator === target.locator && b.text === target.text);
console.log({
  case: "clear-and-download-delete",
  originalStillExtracted: clearDeleteStillThere,
  pass: !clearDeleteStillThere,
});

const outPath = pdfPath.replace(/\.pdf$/i, "") + ".diagnose-deleted.pdf";
writeFileSync(outPath, deleted);
console.log(`Wrote ${outPath} — open in a PDF viewer and try to select the deleted text.`);

hr("SUMMARY");
console.log({
  engineExtract: withLocator.length > 0 ? "OK" : "FAIL",
  engineTextEdit: editOk ? "OK" : "FAIL",
  engineDelete: deleteOk ? "OK" : "FAIL",
  clearToReplace: replaceOk ? "OK" : "FAIL",
  clearDownloadDelete: !clearDeleteStillThere ? "OK" : "FAIL",
  recovered: cos.recovered,
  likelyIssueIfBrowserBad:
    editOk && deleteOk && replaceOk && !clearDeleteStillThere
      ? "UX/canvas or worker apply routing — engine is fine for this PDF"
      : "Engine — fix extract/apply before touching UI",
});

process.exit(editOk && deleteOk && replaceOk && !clearDeleteStillThere ? 0 : 1);
