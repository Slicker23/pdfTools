/**
 * Platform adapters keep the core isomorphic.
 *
 * The core never imports Node's `zlib` or the browser's `DecompressionStream`
 * directly; callers inject an `inflate` implementation. Node code uses
 * `../node/platform-node.ts`; browser code will provide a DecompressionStream
 * based adapter later.
 */
/** Raw DEFLATE/zlib inflate. May be sync (zlib) or async (DecompressionStream). */
export type InflateFn = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;
/** zlib deflate (used by the incremental writer for XRef streams). Sync or async. */
export type DeflateFn = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;
export interface PlatformAdapters {
    inflate: InflateFn;
    /** Optional zlib deflate; required to write XRef-stream incremental updates. */
    deflate?: DeflateFn;
}
//# sourceMappingURL=platform.d.ts.map