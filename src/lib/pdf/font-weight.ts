import { parseFontTraits, type FontFamily } from "./fonts";

export type WeightConfidence = "bold" | "regular" | "ambiguous";

export interface FontKeyMeta {
  fontKey: string;
  styleFamily?: string;
  fontSize: number;
  confidence: WeightConfidence;
  bold: boolean;
  strokeScores: number[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function sizeBucket(fontSize: number): number {
  return Math.round(fontSize * 2) / 2;
}

/** Register PDF font keys encountered on a page. */
export function createFontKeyRegistry(): Map<string, FontKeyMeta> {
  return new Map();
}

export function registerFontKey(
  registry: Map<string, FontKeyMeta>,
  fontKey: string,
  styleFamily: string | undefined,
  fontSize: number
): void {
  if (!fontKey || registry.has(fontKey)) return;
  const traits = parseFontTraits(fontKey, styleFamily);
  registry.set(fontKey, {
    fontKey,
    styleFamily,
    fontSize,
    confidence: traits.weightConfidence,
    bold: traits.bold,
    strokeScores: [],
  });
}

export function recordStrokeScore(
  registry: Map<string, FontKeyMeta>,
  fontKey: string,
  strokeScore: number
): void {
  const entry = registry.get(fontKey);
  if (!entry || strokeScore <= 0) return;
  entry.strokeScores.push(strokeScore);
}

/** Resolve bold for every PDF font key using name hints + canvas stroke scores. */
export function finalizeFontWeightMap(registry: Map<string, FontKeyMeta>): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const entries = [...registry.values()];

  for (const entry of entries) {
    if (entry.confidence === "bold") result.set(entry.fontKey, true);
    else if (entry.confidence === "regular") result.set(entry.fontKey, false);
  }

  const regularScoresBySize = new Map<number, number[]>();
  const allRegularScores: number[] = [];

  for (const entry of entries) {
    if (result.get(entry.fontKey) !== false) continue;
    const avg =
      entry.strokeScores.length > 0
        ? entry.strokeScores.reduce((a, b) => a + b, 0) / entry.strokeScores.length
        : 0;
    if (avg <= 0) continue;
    allRegularScores.push(avg);
    const bucket = sizeBucket(entry.fontSize);
    const list = regularScoresBySize.get(bucket) ?? [];
    list.push(avg);
    regularScoresBySize.set(bucket, list);
  }

  const pageRegularMedian = median(allRegularScores);

  for (const entry of entries) {
    if (result.has(entry.fontKey)) continue;

    const avgScore =
      entry.strokeScores.length > 0
        ? entry.strokeScores.reduce((a, b) => a + b, 0) / entry.strokeScores.length
        : 0;

    const bucket = sizeBucket(entry.fontSize);
    const sizeBaseline = median(regularScoresBySize.get(bucket) ?? []);
    const baseline = sizeBaseline > 0 ? sizeBaseline : pageRegularMedian;

    if (baseline <= 0 || avgScore <= 0) {
      result.set(entry.fontKey, entry.bold);
      continue;
    }

    result.set(entry.fontKey, avgScore >= baseline * 1.09);
  }

  return result;
}

export function isBoldForFontKey(
  weightMap: Map<string, boolean>,
  fontKey: string,
  fallback = false
): boolean {
  return weightMap.get(fontKey) ?? fallback;
}

export interface RawFontSpan {
  fontKey: string;
  styleFamily?: string;
  fontSize: number;
  bold: boolean;
}

/** Seed registry from raw glyph spans before grouping. */
export function seedRegistryFromRaw(
  registry: Map<string, FontKeyMeta>,
  spans: RawFontSpan[]
): void {
  for (const span of spans) {
    registerFontKey(registry, span.fontKey, span.styleFamily, span.fontSize);
  }
}

/** Build a quick name-only weight map (used before canvas calibration). */
export function initialWeightMap(registry: Map<string, FontKeyMeta>): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const entry of registry.values()) {
    map.set(entry.fontKey, entry.bold);
  }
  return map;
}

export type { FontFamily };
