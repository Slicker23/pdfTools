import { readFileSync } from "fs";
import { loadDocument } from "pdfium-native";
import { initPdfJs } from "../src/lib/pdf/pdfjs-config.ts";
import { extractDocument } from "../src/lib/pdf-engine/extract.ts";

const pdfPath = process.argv[2] || "tests/fixtures/cv-like.pdf";
const buf = readFileSync(pdfPath);

const doc = await extractDocument(buf);
const page = doc.pages[0];
console.log("page size", page.width, page.height, "blocks", page.blocks.length);
for (const b of page.blocks.slice(0, 8)) {
  console.log(JSON.stringify(b.text.slice(0, 40)), "bbox", b.bbox);
}

const pdfjs = await initPdfJs();
const pdf = await pdfjs.getDocument({ data: buf }).promise;
const p = await pdf.getPage(1);
const vp = p.getViewport({ scale: 1.3 });
console.log("viewport", vp.width, vp.height);

for (const b of page.blocks.slice(0, 5)) {
  const [x1, y1] = vp.convertToViewportPoint(b.bbox.px, b.bbox.py);
  const [x2, y2] = vp.convertToViewportPoint(b.bbox.px + b.bbox.pw, b.bbox.py + b.bbox.ph);
  const top = Math.min(y1, y2);
  const left = Math.min(x1, x2);
  const inBounds =
    left >= -2 &&
    top >= -2 &&
    left <= vp.width + 2 &&
    top <= vp.height + 2;
  console.log("screen", { left: left.toFixed(1), top: top.toFixed(1), inBounds }, b.text.slice(0, 25));
}

const offPage = page.blocks.filter((b) => {
  const [x1, y1] = vp.convertToViewportPoint(b.bbox.px, b.bbox.py);
  const [x2, y2] = vp.convertToViewportPoint(b.bbox.px + b.bbox.pw, b.bbox.py + b.bbox.ph);
  const top = Math.min(y1, y2);
  const left = Math.min(x1, x2);
  const bottom = Math.max(y1, y2);
  const right = Math.max(x1, x2);
  return top < -5 || left < -5 || bottom > vp.height + 5 || right > vp.width + 5;
});
console.log("off-page blocks", offPage.length, "/", page.blocks.length);
