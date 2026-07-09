/**
 * Incremental-update writer (M5).
 *
 * Produces an edited PDF by copying the original bytes verbatim and appending
 * only the changed objects, a new cross-reference section, and a trailer whose
 * `/Prev` chains back to the file's previous xref. Because untouched bytes are
 * never rewritten, the original portion of the output is byte-identical to the
 * input (ISO 32000-1, 7.5.6).
 *
 * The appended xref matches the *newest* section type of the source file: a
 * classic `xref` table + `trailer` for classic files, or an XRef stream object
 * for cross-reference-stream files. Appended objects (including a new XRef stream)
 * are written uncompressed, so no deflate implementation is required.
 */
import { ByteWriter, LF } from "../bytes";
import { serializeCosObject, serializeIndirectObject } from "../cos/serialize";
import type { DeflateFn } from "../platform";
import {
  cosArray,
  cosDict,
  cosInt,
  cosName,
  cosStream,
  type CosArray,
  type CosObject,
  type CosRef,
} from "../cos/types";

export interface IncrementalObject {
  num: number;
  gen: number;
  obj: CosObject;
}

export interface WriteIncrementalOptions {
  /** Original file bytes (copied verbatim). */
  original: Uint8Array;
  /** Objects to replace or add. */
  updates: IncrementalObject[];
  /** Catalog reference for the trailer /Root. */
  root: CosRef;
  /** /Size of the base document (max existing object number + 1). */
  size: number;
  /** /ID array, carried through when present. */
  id?: CosArray;
  /** /Encrypt reference, carried through when present. */
  encrypt?: CosRef;
  /** Byte offset of the file's previous xref (its last `startxref` value). */
  prevStartxref: number;
  /** Match the source's newest xref section: true = XRef stream, false = classic. */
  useXrefStream: boolean;
  /**
   * zlib deflate, required when `useXrefStream` is true (the XRef stream parser
   * always Flate-decodes the body). When absent, an XRef-stream file falls back
   * to appending a classic `xref` table, which readers still follow via /Prev.
   */
  deflate?: DeflateFn;
  /**
   * Recovered-file mode: the source's own xref/`/Prev` chain is untrustworthy, so
   * emit a single self-contained classic xref that lists *every* object (originals
   * at `baseOffsets`, changed ones at their appended offsets) with no `/Prev`.
   * The original bytes are still appended verbatim, so untouched objects keep
   * their positions. Requires `baseOffsets`.
   */
  standalone?: boolean;
  /** All existing in-use objects: num -> {offset, gen}. Used when `standalone`. */
  baseOffsets?: Map<number, { offset: number; gen: number }>;
}

interface Subsection {
  start: number;
  count: number;
}

/** Group ascending object numbers into contiguous subsections. */
function subsections(nums: number[]): Subsection[] {
  const out: Subsection[] = [];
  for (const num of nums) {
    const last = out[out.length - 1];
    if (last && num === last.start + last.count) last.count++;
    else out.push({ start: num, count: 1 });
  }
  return out;
}

function writeBE(buf: Uint8Array, offset: number, value: number, width: number): void {
  for (let i = width - 1; i >= 0; i--) {
    buf[offset + i] = value & 0xff;
    value = Math.floor(value / 256);
  }
}

export async function writeIncrementalUpdate(opts: WriteIncrementalOptions): Promise<Uint8Array> {
  const { original, updates, root, id, encrypt, prevStartxref, useXrefStream } = opts;
  if (updates.length === 0) return original.slice();

  const w = new ByteWriter();
  w.bytes(original);
  // Appended content must start on its own line.
  if (original.length > 0 && original[original.length - 1] !== LF) w.byte(LF);

  // Offsets are absolute from the start of the file.
  const offsets = new Map<number, { offset: number; gen: number }>();
  const sorted = [...updates].sort((a, b) => a.num - b.num);
  for (const u of sorted) {
    offsets.set(u.num, { offset: w.length, gen: u.gen });
    w.bytes(serializeIndirectObject(u.num, u.gen, u.obj));
  }

  if (opts.standalone && opts.baseOffsets) {
    return writeStandaloneClassicXref(w, offsets, opts.baseOffsets, {
      root,
      id,
      encrypt,
      size: opts.size,
    });
  }
  if (useXrefStream && opts.deflate) {
    return await writeXrefStream(w, sorted, offsets, opts, opts.deflate);
  }
  return writeClassicXref(w, sorted, offsets, { root, id, encrypt, prevStartxref, size: opts.size });
}

/**
 * Self-contained classic xref for recovered files: one table covering all objects
 * and no `/Prev`, so a reader never has to follow the file's broken xref chain.
 */
function writeStandaloneClassicXref(
  w: ByteWriter,
  appended: Map<number, { offset: number; gen: number }>,
  baseOffsets: Map<number, { offset: number; gen: number }>,
  meta: { root: CosRef; id?: CosArray; encrypt?: CosRef; size: number }
): Uint8Array {
  // Merge originals with the appended (changed) objects; appended wins.
  const merged = new Map<number, { offset: number; gen: number }>(baseOffsets);
  for (const [num, e] of appended) merged.set(num, e);

  const xrefOffset = w.length;
  const nums = [...merged.keys()].sort((a, b) => a - b);
  // Classic xref must begin with the free head object 0.
  const withZero = nums[0] === 0 ? nums : [0, ...nums];

  w.ascii("xref\n");
  for (const sub of subsections(withZero)) {
    w.ascii(`${sub.start} ${sub.count}\n`);
    for (let n = sub.start; n < sub.start + sub.count; n++) {
      if (n === 0 && !merged.has(0)) {
        w.ascii("0000000000 65535 f\r\n");
        continue;
      }
      const e = merged.get(n)!;
      const off = String(e.offset).padStart(10, "0");
      const gen = String(e.gen).padStart(5, "0");
      w.ascii(`${off} ${gen} n\r\n`);
    }
  }

  const trailer = cosDict();
  trailer.map.set("Size", cosInt(Math.max(meta.size, (withZero[withZero.length - 1] ?? 0) + 1)));
  trailer.map.set("Root", meta.root);
  if (meta.encrypt) trailer.map.set("Encrypt", meta.encrypt);
  if (meta.id) trailer.map.set("ID", meta.id);

  w.ascii("trailer\n");
  w.bytes(serializeCosObject(trailer));
  w.ascii(`\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return w.toUint8Array();
}

function writeClassicXref(
  w: ByteWriter,
  sorted: IncrementalObject[],
  offsets: Map<number, { offset: number; gen: number }>,
  meta: {
    root: CosRef;
    id?: CosArray;
    encrypt?: CosRef;
    prevStartxref: number;
    size: number;
  }
): Uint8Array {
  const xrefOffset = w.length;
  const nums = sorted.map((u) => u.num);
  w.ascii("xref\n");
  for (const sub of subsections(nums)) {
    w.ascii(`${sub.start} ${sub.count}\n`);
    for (let n = sub.start; n < sub.start + sub.count; n++) {
      const e = offsets.get(n)!;
      const off = String(e.offset).padStart(10, "0");
      const gen = String(e.gen).padStart(5, "0");
      // Fixed 20-byte entry: "nnnnnnnnnn ggggg n\r\n".
      w.ascii(`${off} ${gen} n\r\n`);
    }
  }

  const trailer = cosDict();
  trailer.map.set("Size", cosInt(meta.size));
  trailer.map.set("Root", meta.root);
  if (meta.encrypt) trailer.map.set("Encrypt", meta.encrypt);
  if (meta.id) trailer.map.set("ID", meta.id);
  trailer.map.set("Prev", cosInt(meta.prevStartxref));

  w.ascii("trailer\n");
  w.bytes(serializeCosObject(trailer));
  w.ascii(`\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return w.toUint8Array();
}

async function writeXrefStream(
  w: ByteWriter,
  sorted: IncrementalObject[],
  offsets: Map<number, { offset: number; gen: number }>,
  opts: WriteIncrementalOptions,
  deflate: DeflateFn
): Promise<Uint8Array> {
  const { root, id, encrypt, prevStartxref } = opts;
  // The XRef stream is itself a new object; give it the next free number.
  const xrefNum = opts.size;
  const xrefOffset = w.length;
  offsets.set(xrefNum, { offset: xrefOffset, gen: 0 });

  const nums = [...sorted.map((u) => u.num), xrefNum].sort((a, b) => a - b);
  const subs = subsections(nums);

  // /W [1 4 2]: type (1) | offset (4) | gen (2).
  const W = [1, 4, 2] as const;
  const rowLen = W[0] + W[1] + W[2];
  const data = new Uint8Array(nums.length * rowLen);
  let row = 0;
  for (const sub of subs) {
    for (let n = sub.start; n < sub.start + sub.count; n++) {
      const e = offsets.get(n)!;
      const base = row * rowLen;
      writeBE(data, base, 1, W[0]); // in-use
      writeBE(data, base + W[0], e.offset, W[1]);
      writeBE(data, base + W[0] + W[1], e.gen, W[2]);
      row++;
    }
  }

  const index: CosObject[] = [];
  for (const sub of subs) index.push(cosInt(sub.start), cosInt(sub.count));

  // The XRef-stream parser always Flate-decodes the body, so compress it.
  const body = await Promise.resolve(deflate(data));

  const dict = cosDict();
  dict.map.set("Type", cosName("XRef"));
  dict.map.set("Size", cosInt(xrefNum + 1));
  dict.map.set("Root", root);
  if (encrypt) dict.map.set("Encrypt", encrypt);
  if (id) dict.map.set("ID", id);
  dict.map.set("Prev", cosInt(prevStartxref));
  dict.map.set("W", cosArray([cosInt(W[0]), cosInt(W[1]), cosInt(W[2])]));
  dict.map.set("Index", cosArray(index));
  dict.map.set("Filter", cosName("FlateDecode"));
  dict.map.set("Length", cosInt(body.length));

  w.bytes(serializeIndirectObject(xrefNum, 0, cosStream(dict, body)));
  w.ascii(`\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return w.toUint8Array();
}
