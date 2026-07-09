/**
 * Unified stream filter pipeline.
 *
 * Resolves a stream's /Filter (+ /DecodeParms) chain and decodes it. Flate needs
 * the injected inflate adapter (async in the browser); every other supported
 * filter is pure and synchronous. Image codecs (DCT/JPX/CCITT/JBIG2) are passed
 * through untouched - decoding those is out of scope for the text engine.
 */
import type { InflateFn } from "../platform";
import { type CosDict, type CosObject } from "../cos/types";
/** Ordered list of filter names from /Filter (or /F). */
export declare function filterNames(dict: CosDict): string[];
/** Per-filter /DecodeParms (or /DP), aligned to `count` filters. */
export declare function decodeParmsList(dict: CosDict, count: number): (CosObject | undefined)[];
/** Async decode (Flate via adapter, possibly async). */
export declare function decodeFilters(names: string[], parms: (CosObject | undefined)[], raw: Uint8Array, inflate: InflateFn): Promise<Uint8Array>;
/** Synchronous decode; throws if the inflate adapter is async. */
export declare function decodeFiltersSync(names: string[], parms: (CosObject | undefined)[], raw: Uint8Array, inflate: InflateFn): Uint8Array;
//# sourceMappingURL=apply.d.ts.map