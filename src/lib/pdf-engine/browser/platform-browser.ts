/**
 * Browser platform adapters for the PDF engine core.
 *
 * Uses the Web Streams `DecompressionStream` / `CompressionStream` for
 * FlateDecode/Encode. Inflate is async; deflate is async-only via
 * `browserDeflateAsync` (core incremental writer uses classic xref when sync
 * deflate is unavailable on normal edited PDFs).
 */
import type { PlatformAdapters } from "../core/platform";

async function inflateWith(data: Uint8Array, format: "deflate" | "deflate-raw"): Promise<Uint8Array> {
  const input = new ArrayBuffer(data.byteLength);
  new Uint8Array(input).set(data);
  const ds = new DecompressionStream(format);
  const stream = new Blob([input]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

async function browserInflate(data: Uint8Array): Promise<Uint8Array> {
  try {
    return await inflateWith(data, "deflate");
  } catch {
    return await inflateWith(data, "deflate-raw");
  }
}

/** Async zlib deflate (M7). Round-trips with `browserInflate`. */
export async function browserDeflateAsync(data: Uint8Array): Promise<Uint8Array> {
  const input = new ArrayBuffer(data.byteLength);
  new Uint8Array(input).set(data);
  const cs = new CompressionStream("deflate");
  const stream = new Blob([input]).stream().pipeThrough(cs);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

export const browserAdapters: PlatformAdapters = {
  inflate: browserInflate,
  deflate: browserDeflateAsync,
};
