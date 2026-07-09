/**
 * Node.js platform adapters for the PDF engine core.
 *
 * Uses the built-in `zlib` for FlateDecode. `Z_SYNC_FLUSH` lets us tolerate
 * streams with missing/short end markers (common in real-world PDFs), and we
 * fall back to raw DEFLATE for the rare producers that omit the zlib header.
 */
import zlib from "zlib";
import type { PlatformAdapters } from "../core/platform";

function toU8(b: Buffer): Uint8Array {
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

function nodeInflate(data: Uint8Array): Uint8Array {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  try {
    return toU8(zlib.inflateSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH }));
  } catch {
    // Some producers emit headerless (raw) DEFLATE.
    return toU8(zlib.inflateRawSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH }));
  }
}

function nodeDeflate(data: Uint8Array): Uint8Array {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return toU8(zlib.deflateSync(buf));
}

export const nodeAdapters: PlatformAdapters = {
  inflate: nodeInflate,
  deflate: nodeDeflate,
};
