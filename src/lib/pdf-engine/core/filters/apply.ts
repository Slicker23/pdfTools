/**
 * Unified stream filter pipeline.
 *
 * Resolves a stream's /Filter (+ /DecodeParms) chain and decodes it. Flate needs
 * the injected inflate adapter (async in the browser); every other supported
 * filter is pure and synchronous. Image codecs (DCT/JPX/CCITT/JBIG2) are passed
 * through untouched - decoding those is out of scope for the text engine.
 */
import type { InflateFn } from "../platform";
import {
  asNumber,
  dictGet,
  isArray,
  isName,
  type CosDict,
  type CosObject,
} from "../cos/types";
import { applyFlatePredictor } from "./flate";
import { lzwDecode } from "./lzw";
import { ascii85Decode, asciiHexDecode } from "./ascii";
import { runLengthDecode } from "./runlength";

const PASSTHROUGH = new Set([
  "DCTDecode",
  "DCT",
  "JPXDecode",
  "CCITTFaxDecode",
  "CCF",
  "JBIG2Decode",
  "Identity",
]);

function isFlate(name: string): boolean {
  return name === "FlateDecode" || name === "Fl";
}
function isLzw(name: string): boolean {
  return name === "LZWDecode" || name === "LZW";
}

/** Ordered list of filter names from /Filter (or /F). */
export function filterNames(dict: CosDict): string[] {
  const filter = dictGet(dict, "Filter") ?? dictGet(dict, "F");
  if (isName(filter)) return [filter.name];
  if (isArray(filter)) return filter.items.filter(isName).map((n) => n.name);
  return [];
}

/** Per-filter /DecodeParms (or /DP), aligned to `count` filters. */
export function decodeParmsList(dict: CosDict, count: number): (CosObject | undefined)[] {
  const parms = dictGet(dict, "DecodeParms") ?? dictGet(dict, "DP");
  const list: (CosObject | undefined)[] = new Array(count).fill(undefined);
  if (!parms) return list;
  if (isArray(parms)) {
    for (let i = 0; i < count; i++) list[i] = parms.items[i];
  } else {
    list[0] = parms; // single dict applies to the first (usually only) filter
  }
  return list;
}

class UnsupportedFilterError extends Error {}

function applySyncFilter(name: string, data: Uint8Array, parms: CosObject | undefined): Uint8Array {
  if (isLzw(name)) {
    const early = asNumber(dictGet(parms, "EarlyChange")) ?? 1;
    return applyFlatePredictor(lzwDecode(data, early), parms);
  }
  if (name === "ASCII85Decode" || name === "A85") return ascii85Decode(data);
  if (name === "ASCIIHexDecode" || name === "AHx") return asciiHexDecode(data);
  if (name === "RunLengthDecode" || name === "RL") return runLengthDecode(data);
  if (PASSTHROUGH.has(name)) return data;
  throw new UnsupportedFilterError(`Unsupported filter: ${name}`);
}

/** Async decode (Flate via adapter, possibly async). */
export async function decodeFilters(
  names: string[],
  parms: (CosObject | undefined)[],
  raw: Uint8Array,
  inflate: InflateFn
): Promise<Uint8Array> {
  let data = raw;
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    if (isFlate(name)) {
      data = applyFlatePredictor(await inflate(data), parms[i]);
    } else {
      data = applySyncFilter(name, data, parms[i]);
    }
  }
  return data;
}

/** Synchronous decode; throws if the inflate adapter is async. */
export function decodeFiltersSync(
  names: string[],
  parms: (CosObject | undefined)[],
  raw: Uint8Array,
  inflate: InflateFn
): Uint8Array {
  let data = raw;
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    if (isFlate(name)) {
      const inflated = inflate(data);
      if (inflated instanceof Promise) {
        throw new Error("Synchronous decode requires a synchronous inflate adapter");
      }
      data = applyFlatePredictor(inflated, parms[i]);
    } else {
      data = applySyncFilter(name, data, parms[i]);
    }
  }
  return data;
}
