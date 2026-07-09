import type { PageViewport } from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import {
  applyFontWeightsToSpans,
  createObjectId,
  finalizeFontWeightMap,
  looksGarbled,
  pickTextLineAtPoint,
  recordStrokeScore,
  refineSpanFromCanvas,
  sampleBackgroundColor,
  sampleForegroundColor,
  type EditObject,
  type PickableSpan,
} from "@/lib/pdf";

const PAD = 1;

export function buildEditObjectsFromPicked(
  picked: PickableSpan,
  pageNum: number,
  canvas: HTMLCanvasElement,
  viewport: PageViewport,
  bg: string
): EditObject[] {
  const ink = {
    px: picked.inkPx ?? picked.px,
    py: picked.inkPy ?? picked.py,
    pw: picked.inkPw ?? picked.pw,
    ph: picked.inkPh ?? picked.ph,
  };
  const fg = sampleForegroundColor(canvas, viewport, ink, bg);

  const coverId = createObjectId();
  const whiteout: EditObject = {
    id: coverId,
    page: pageNum,
    type: "whiteout",
    px: ink.px - PAD,
    py: ink.py - PAD,
    pw: ink.pw + PAD * 2,
    ph: ink.ph + PAD * 2,
    color: bg,
  };

  const text: EditObject = {
    id: createObjectId(),
    page: pageNum,
    type: "text",
    px: picked.px,
    py: picked.py,
    pw: picked.pw,
    ph: picked.ph,
    text: picked.text,
    fontFamily: picked.fontFamily,
    fontSize: picked.fontSize,
    color: fg,
    bold: picked.bold,
    italic: picked.italic,
    underline: false,
    strike: false,
    align: "left",
    ascentRatio: picked.ascentRatio,
    descentRatio: picked.descentRatio,
    baselineY: picked.baselineY,
    coverId,
    fromPdf: true,
  };

  return [whiteout, text];
}

/** Detect and build a cover+text pair for the line under a canvas click. */
export async function pickTextAtClick(
  page: PDFPageProxy,
  pageNum: number,
  viewport: PageViewport,
  canvas: HTMLCanvasElement,
  sx: number,
  sy: number
): Promise<EditObject[] | null> {
  const result = await pickTextLineAtPoint(page, viewport, sx, sy);
  if (!result) return null;

  let { pickable, registry } = result;
  if (looksGarbled(pickable.text)) {
    pickable = { ...pickable, text: "" };
  }

  const preRect = {
    px: pickable.px - PAD,
    py: pickable.py - PAD,
    pw: pickable.pw + PAD * 2,
    ph: pickable.ph + PAD * 2,
  };
  const bg = sampleBackgroundColor(canvas, viewport, preRect);
  const refined = refineSpanFromCanvas(canvas, viewport, pickable, bg);
  recordStrokeScore(registry, refined.fontKey, refined.strokeScore ?? 0);
  const finalMap = finalizeFontWeightMap(registry);
  const [weighted] = applyFontWeightsToSpans([refined], finalMap);

  const ink = {
    px: weighted.inkPx ?? weighted.px,
    py: weighted.inkPy ?? weighted.py,
    pw: weighted.inkPw ?? weighted.pw,
    ph: weighted.inkPh ?? weighted.ph,
  };
  const coverBg = sampleBackgroundColor(canvas, viewport, {
    px: ink.px - PAD,
    py: ink.py - PAD,
    pw: ink.pw + PAD * 2,
    ph: ink.ph + PAD * 2,
  });

  return buildEditObjectsFromPicked(weighted, pageNum, canvas, viewport, coverBg);
}
