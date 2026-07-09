/**
 * CosDocument - the read model for a parsed PDF.
 *
 * Responsibilities:
 *  - build the xref chain and trailer
 *  - lazily resolve indirect objects (from offsets or object streams)
 *  - transparently decrypt strings/streams when the file is encrypted
 *  - expose the catalog and a flattened page list (with inherited MediaBox)
 *
 * Object bytes for untouched objects can be copied verbatim via
 * `rawIndirectObjectBytes`, which is what guarantees byte-stable round-trips.
 */
import type { InflateFn } from "./platform";
import { asciiBytes } from "./bytes";
import { ObjectParser } from "./cos/object-parser";
import {
  asName,
  asNumber,
  cosArray,
  cosDict,
  cosRef,
  cosStream,
  cosString,
  dictGet,
  isArray,
  isDict,
  isName,
  isRef,
  isStream,
  isString,
  type CosArray,
  type CosDict,
  type CosObject,
  type CosRef,
} from "./cos/types";
import {
  decodeFilters,
  decodeFiltersSync,
  decodeParmsList,
  filterNames,
} from "./filters/apply";
import { interpretContent, contentStateAtOffset, type XObjectInfo } from "./content/interpreter";
import type { Matrix } from "./content/matrix";
import { IDENTITY } from "./content/matrix";
import type { PageTextContent } from "./content/types";
import { loadFont } from "./fonts/font";
import type { Font } from "./fonts/types";
import { loadOutlineFont, type OutlineFont } from "./fonts/outline-font";
import { lookupResource, resourceCategory } from "./resources";
import { parseObjectStream } from "./objstm";
import { buildXref } from "./xref/build";
import { recoverXref } from "./xref/recover";
import type { XrefEntry } from "./xref/entries";
import {
  createStandardSecurityHandler,
  type SecurityHandler,
} from "./crypto/standard-security";

export interface OpenOptions {
  inflate: InflateFn;
  /** User or owner password. Defaults to the empty password. */
  password?: string;
  /** Optional bundled TTF bytes for base-14 outline fallback (M9). */
  bundledOutlineFont?: (base14Key: string) => Uint8Array | undefined;
}

export interface PageNode {
  ref?: CosRef;
  dict: CosDict;
  mediaBox: [number, number, number, number];
  width: number;
  height: number;
  rotate: number;
  /** Effective (inheritance-resolved) /Resources dict; empty when absent. */
  resources: CosDict;
}

const MAX_INDIRECT_DEPTH = 64;

export class CosDocument {
  readonly bytes: Uint8Array;
  readonly trailer: CosDict;
  readonly encrypted: boolean;
  /** True when the document was opened via the xref-recovery fallback. */
  recovered = false;

  private readonly xref: Map<number, XrefEntry>;
  private readonly inflateFn: InflateFn;
  private readonly bundledOutlineFont?: (base14Key: string) => Uint8Array | undefined;
  private readonly cache = new Map<number, CosObject>();
  private readonly objStmCache = new Map<number, Map<number, CosObject>>();
  private security?: SecurityHandler;
  private encryptObjNum = -1;

  private constructor(
    bytes: Uint8Array,
    xref: Map<number, XrefEntry>,
    trailer: CosDict,
    inflate: InflateFn,
    bundledOutlineFont?: (base14Key: string) => Uint8Array | undefined
  ) {
    this.bytes = bytes;
    this.xref = xref;
    this.trailer = trailer;
    this.inflateFn = inflate;
    this.bundledOutlineFont = bundledOutlineFont;
    this.encrypted = !!dictGet(trailer, "Encrypt");
  }

  static async open(bytes: Uint8Array, options: OpenOptions): Promise<CosDocument> {
    const password = options.password ?? "";
    try {
      const { entries, trailer } = await buildXref(bytes, options.inflate);
      const doc = new CosDocument(
        bytes,
        entries,
        trailer,
        options.inflate,
        options.bundledOutlineFont
      );
      doc.setupEncryption(password);
      // Pre-decode object streams so the synchronous getObject path never needs
      // to inflate (required when the inflate adapter is async, e.g. browser).
      await doc.prefetchObjectStreams();
      doc.validate();
      return doc;
    } catch (primaryErr) {
      // Fall back to scanning the file to rebuild a broken/missing xref.
      try {
        return await CosDocument.openRecovered(bytes, options);
      } catch {
        throw primaryErr;
      }
    }
  }

  private static async openRecovered(
    bytes: Uint8Array,
    options: OpenOptions
  ): Promise<CosDocument> {
    const { entries, trailer } = recoverXref(bytes);
    const doc = new CosDocument(
      bytes,
      entries,
      trailer,
      options.inflate,
      options.bundledOutlineFont
    );
    doc.recovered = true;
    doc.setupEncryption(options.password ?? "");
    await doc.prefetchObjectStreams();
    doc.repairRootIfNeeded();
    doc.validate();
    return doc;
  }

  /** Throws if the catalog / page tree cannot be resolved. */
  private validate(): void {
    if (this.pages().length === 0) throw new Error("No pages resolved");
  }

  private repairRootIfNeeded(): void {
    const root = this.resolve(dictGet(this.trailer, "Root"));
    if (isDict(root) && dictGet(root, "Pages")) return;
    for (const num of this.objectNumbers()) {
      const obj = this.getObject(num);
      const type = dictGet(obj, "Type");
      if (isDict(obj) && type?.type === "name" && type.name === "Catalog") {
        const entry = this.xrefEntry(num);
        this.trailer.map.set("Root", cosRef(num, entry?.kind === "inuse" ? entry.gen : 0));
        return;
      }
    }
  }

  /** Async-decode every referenced object stream and cache its contents. */
  private async prefetchObjectStreams(): Promise<void> {
    const streamNums = new Set<number>();
    for (const entry of this.xref.values()) {
      if (entry.kind === "compressed") streamNums.add(entry.streamNum);
    }
    for (const streamNum of streamNums) {
      if (this.objStmCache.has(streamNum)) continue;
      const stm = this.getObject(streamNum);
      if (!isStream(stm)) continue;
      const map = new Map<number, CosObject>();
      try {
        const decoded = await this.decodeStream(stm);
        const n = asNumber(dictGet(stm.dict, "N")) ?? 0;
        const first = asNumber(dictGet(stm.dict, "First")) ?? 0;
        for (const { num, obj } of parseObjectStream(decoded, n, first)) {
          map.set(num, obj);
        }
      } catch {
        // Leave empty; parseCompressed falls back to the sync path if possible.
      }
      this.objStmCache.set(streamNum, map);
    }
  }

  private setupEncryption(password: string): void {
    const encryptRef = dictGet(this.trailer, "Encrypt");
    if (!encryptRef) return;
    if (isRef(encryptRef)) this.encryptObjNum = encryptRef.num;

    // Resolve the Encrypt dict WITHOUT decryption (security handler not set yet).
    const encrypt = this.resolve(encryptRef);
    if (!isDict(encrypt)) return;

    const idArr = dictGet(this.trailer, "ID");
    let idFirst: Uint8Array | undefined;
    if (isArray(idArr) && idArr.items.length > 0 && isString(idArr.items[0])) {
      idFirst = idArr.items[0].bytes;
    }

    this.security = createStandardSecurityHandler({
      encrypt,
      idFirst,
      password: asciiBytes(password),
    });
  }

  /** Inflate provided data using the document's platform adapter. */
  inflate(data: Uint8Array): Uint8Array | Promise<Uint8Array> {
    return this.inflateFn(data);
  }

  /** Follow indirect references until a direct object is reached. */
  resolve(obj: CosObject | undefined): CosObject {
    let cur = obj;
    let depth = 0;
    while (cur && isRef(cur)) {
      if (depth++ > MAX_INDIRECT_DEPTH) break;
      cur = this.getObject(cur.num, cur.gen);
    }
    return cur ?? { type: "null" };
  }

  /** Look up a dict key and resolve it in one step. */
  get(obj: CosObject | undefined, key: string): CosObject {
    return this.resolve(dictGet(obj, key));
  }

  /** Fetch an indirect object by number (generation is informational). */
  getObject(num: number, _gen = 0): CosObject {
    const cached = this.cache.get(num);
    if (cached) return cached;

    const entry = this.xref.get(num);
    if (!entry || entry.kind === "free") {
      const nil: CosObject = { type: "null" };
      this.cache.set(num, nil);
      return nil;
    }

    let result: CosObject;
    if (entry.kind === "inuse") {
      result = this.parseInUse(entry.num, entry.gen, entry.offset);
    } else {
      result = this.parseCompressed(entry.num, entry.streamNum, entry.index);
    }
    this.cache.set(num, result);
    return result;
  }

  private parseInUse(num: number, gen: number, offset: number): CosObject {
    const parser = new ObjectParser(this.bytes, offset, (n) => this.getObject(n));
    let obj: CosObject;
    try {
      obj = parser.parseIndirectObject().obj;
    } catch {
      return { type: "null" };
    }
    if (this.security && num !== this.encryptObjNum) {
      obj = this.decryptObject(obj, num, gen);
    }
    return obj;
  }

  private parseCompressed(num: number, streamNum: number, index: number): CosObject {
    let map = this.objStmCache.get(streamNum);
    if (!map) {
      map = this.loadObjectStream(streamNum);
      this.objStmCache.set(streamNum, map);
    }
    return map.get(num) ?? { type: "null" };
  }

  private loadObjectStream(streamNum: number): Map<number, CosObject> {
    const map = new Map<number, CosObject>();
    const stm = this.getObject(streamNum);
    if (!isStream(stm)) return map;
    const n = asNumber(dictGet(stm.dict, "N")) ?? 0;
    const first = asNumber(dictGet(stm.dict, "First")) ?? 0;
    let decoded: Uint8Array;
    try {
      decoded = this.decodeStreamSync(stm.dict, stm.raw);
    } catch {
      return map;
    }
    for (const { num, obj } of parseObjectStream(decoded, n, first)) {
      map.set(num, obj);
    }
    return map;
  }

  /**
   * Decode a stream body synchronously (Flate + LZW + ASCII85/Hex + RunLength;
   * image codecs pass through). Requires a synchronous inflate adapter; used
   * only as the fallback object-stream path (open() prefetches async).
   */
  private decodeStreamSync(dict: CosDict, raw: Uint8Array): Uint8Array {
    const names = filterNames(dict);
    if (names.length === 0) return raw;
    const parms = decodeParmsList(dict, names.length);
    return decodeFiltersSync(names, parms, raw, this.inflateFn);
  }

  /** Fully decode a stream object through its filter chain. */
  async decodeStream(stream: CosObject): Promise<Uint8Array> {
    if (!isStream(stream)) throw new Error("decodeStream: not a stream");
    const names = filterNames(stream.dict);
    if (names.length === 0) return stream.raw;
    const parms = decodeParmsList(stream.dict, names.length);
    return decodeFilters(names, parms, stream.raw, this.inflateFn);
  }

  private decryptObject(obj: CosObject, num: number, gen: number): CosObject {
    const handler = this.security!;
    const walk = (o: CosObject): CosObject => {
      switch (o.type) {
        case "string":
          return cosString(handler.decrypt(o.bytes, num, gen, true), o.hex);
        case "array":
          return cosArray(o.items.map(walk));
        case "dict":
          return cosDict(Array.from(o.map, ([k, v]) => [k, walk(v)] as [string, CosObject]));
        case "stream": {
          const dict = walk(o.dict) as CosDict;
          // Per spec, when EncryptMetadata is false the /Metadata stream is
          // stored in the clear; decrypting it would corrupt the XMP payload.
          const typeName = dictGet(o.dict, "Type");
          const isMetadata = isName(typeName) && typeName.name === "Metadata";
          const raw =
            !handler.encryptMetadata && isMetadata
              ? o.raw
              : handler.decrypt(o.raw, num, gen, false);
          return cosStream(dict, raw);
        }
        default:
          return o;
      }
    };
    return walk(obj);
  }

  /** The document catalog (/Root). */
  get catalog(): CosDict {
    const root = this.resolve(dictGet(this.trailer, "Root"));
    if (!isDict(root)) throw new Error("Missing document catalog (/Root)");
    return root;
  }

  /** Flattened list of pages with inherited attributes resolved. */
  pages(): PageNode[] {
    const pagesRoot = this.resolve(dictGet(this.catalog, "Pages"));
    if (!isDict(pagesRoot)) throw new Error("Missing page tree (/Pages)");
    const out: PageNode[] = [];
    const visited = new Set<number>();

    // Iterative depth-first traversal with an explicit stack. Recursion here
    // could exhaust the JS call stack on deeply nested (but legal) page trees;
    // worse, the resulting overflow was swallowed by getObject's catch-all,
    // silently truncating the tree. Kids are pushed in reverse so they pop in
    // document order.
    interface Frame {
      node: CosDict;
      ref: CosRef | undefined;
      inherited: InheritedAttrs;
    }
    const stack: Frame[] = [{ node: pagesRoot, ref: undefined, inherited: {} }];

    while (stack.length > 0) {
      const { node, ref, inherited } = stack.pop()!;

      const mbHere = this.resolve(dictGet(node, "MediaBox"));
      const rotHere = dictGet(node, "Rotate");
      const next: InheritedAttrs = {
        mediaBox: isArray(mbHere) ? mbHere : inherited.mediaBox,
        resources: dictGet(node, "Resources") ?? inherited.resources,
        rotate: rotHere?.type === "int" ? rotHere.value : inherited.rotate,
      };

      const kids = this.resolve(dictGet(node, "Kids"));
      if (isArray(kids)) {
        for (let i = kids.items.length - 1; i >= 0; i--) {
          const kid = kids.items[i]!;
          let kidRef: CosRef | undefined;
          if (isRef(kid)) {
            if (visited.has(kid.num)) continue;
            visited.add(kid.num);
            kidRef = kid;
          }
          const kidDict = this.resolve(kid);
          if (isDict(kidDict)) stack.push({ node: kidDict, ref: kidRef, inherited: next });
        }
        continue;
      }

      // Leaf page node.
      const mediaBox = this.readRect(next.mediaBox) ?? [0, 0, 612, 792];
      const [x0, y0, x1, y1] = mediaBox;
      const rotate = (((next.rotate ?? 0) % 360) + 360) % 360;
      const resolvedResources = this.resolve(next.resources);
      out.push({
        ref,
        dict: node,
        mediaBox,
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
        rotate,
        resources: isDict(resolvedResources) ? resolvedResources : cosDict([]),
      });
    }

    return out;
  }

  get pageCount(): number {
    return this.pages().length;
  }

  /**
   * The page's decoded content split per source stream. /Contents may be a lone
   * stream, an array of streams, or an indirect reference to either. Each segment
   * carries its content-stream object number (when it came from an indirect
   * reference) so edits can be written back to the exact object.
   */
  async pageContentSegments(
    page: PageNode
  ): Promise<{ streamNum?: number; decoded: Uint8Array }[]> {
    const raw = dictGet(page.dict, "Contents");
    const contents = this.resolve(raw);
    const streams: CosObject[] = [];
    const refs: (number | undefined)[] = [];
    if (isStream(contents)) {
      streams.push(contents);
      refs.push(isRef(raw) ? raw.num : undefined);
    } else if (isArray(contents)) {
      for (const item of contents.items) {
        const stream = this.resolve(item);
        if (isStream(stream)) {
          streams.push(stream);
          refs.push(isRef(item) ? item.num : undefined);
        }
      }
    }
    // A single corrupt/undecodable content stream must not abort the whole page
    // (nor the document): degrade that stream to empty and keep the rest.
    const parts = await Promise.all(
      streams.map((s) => this.decodeStream(s).catch(() => new Uint8Array(0)))
    );
    return parts.map((decoded, i) => ({ streamNum: refs[i], decoded }));
  }

  /**
   * The page's decoded content as a single byte stream. Multiple streams are
   * concatenated with a newline between them so that lexical tokens cannot merge
   * across a stream boundary (ISO 32000-1, 7.8.2).
   */
  async pageContent(page: PageNode): Promise<Uint8Array> {
    const segs = await this.pageContentSegments(page);
    if (segs.length === 0) return new Uint8Array(0);
    let total = 0;
    for (const s of segs) total += s.decoded.length;
    total += Math.max(0, segs.length - 1); // newline separators
    const out = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < segs.length; i++) {
      if (i > 0) out[offset++] = 0x0a;
      out.set(segs[i]!.decoded, offset);
      offset += segs[i]!.decoded.length;
    }
    return out;
  }

  /**
   * Positioned text spans for a page (M3). Interprets the page content stream
   * (and any Form XObjects it invokes) into per-show {@link TextSpan}s carrying
   * page-space origin, text matrix, font ref/size, render mode, fill color, and
   * the raw shown codes. Glyph widths/advances and Unicode are deferred to M4.
   */
  async pageSpans(page: PageNode): Promise<PageTextContent> {
    // Build the concatenated content and a table mapping each concat offset range
    // back to its source content-stream object number (for edit locators).
    const segs = await this.pageContentSegments(page);
    let total = 0;
    for (const s of segs) total += s.decoded.length;
    total += Math.max(0, segs.length - 1);
    const content = new Uint8Array(total);
    const table: { streamNum?: number; start: number; end: number }[] = [];
    let off = 0;
    for (let i = 0; i < segs.length; i++) {
      if (i > 0) content[off++] = 0x0a;
      const start = off;
      content.set(segs[i]!.decoded, off);
      off += segs[i]!.decoded.length;
      table.push({ streamNum: segs[i]!.streamNum, start, end: off });
    }

    // Form XObjects and font-related streams (/ToUnicode, embedded CMaps) must be
    // decoded up front: the interpreter is synchronous but stream decoding
    // (inflate) may be async on some platforms.
    const formBytes = new Map<number, Uint8Array>();
    await this.collectFormXObjects(page.resources, formBytes, 0);

    const fonts = new Map<CosObject, Font>();
    const streamBytes = new Map<CosObject, Uint8Array>();
    await this.buildFonts(page.resources, fonts, streamBytes, 0, new Set<number>());

    const spans = interpretContent(content, {
      resources: page.resources,
      fontLookup: (resources, name) => lookupResource(this, resources, "Font", name),
      xobjectLookup: (resources, name) => this.lookupXObject(resources, name, formBytes),
      loadFont: (fontDict) => fonts.get(fontDict),
    });

    // Resolve each editable run's locator to a real content-stream object number
    // and decoded-local byte offsets. Page-content runs (bufferId -1) map through
    // the concatenated stream table; Form XObject runs keep their stream object id.
    for (const span of spans) {
      const src = span.source;
      if (!src) continue;
      if (src.streamNum !== -1) {
        // Form XObject — region offsets are already local to that stream.
        continue;
      }
      const seg = table.find((t) => src.regionStart >= t.start && src.regionStart < t.end);
      if (!seg || seg.streamNum == null) {
        span.source = undefined;
        continue;
      }
      span.source = {
        ...src,
        streamNum: seg.streamNum,
        regionStart: src.regionStart - seg.start,
        regionEnd: src.regionEnd - seg.start,
      };
    }
    return { spans };
  }

  /**
   * CTM within a single content stream immediately before the operator at
   * `regionInStream`. Matches how spans inside that stream are interpreted.
   */
  async streamContentStateAt(
    page: PageNode,
    streamNum: number,
    regionInStream: number
  ): Promise<Matrix> {
    const segs = await this.pageContentSegments(page);
    const seg = segs.find((s) => s.streamNum === streamNum);
    if (!seg) return IDENTITY;

    const formBytes = new Map<number, Uint8Array>();
    await this.collectFormXObjects(page.resources, formBytes, 0);
    const fonts = new Map<CosObject, Font>();
    const streamBytes = new Map<CosObject, Uint8Array>();
    await this.buildFonts(page.resources, fonts, streamBytes, 0, new Set<number>());

    return contentStateAtOffset(seg.decoded, regionInStream, {
      resources: page.resources,
      fontLookup: (resources, name) => lookupResource(this, resources, "Font", name),
      xobjectLookup: (resources, name) => this.lookupXObject(resources, name, formBytes),
      loadFont: (fontDict) => fonts.get(fontDict),
    });
  }

  /**
   * Build a measured {@link Font} (with reverse encoder) for a resolved /Font
   * dictionary, pre-decoding the streams it needs (/ToUnicode, embedded CMaps).
   * Used by the in-place text editor (M5) to encode replacement text.
   */
  async buildFontForDict(dict: CosDict): Promise<Font> {
    const streamBytes = new Map<CosObject, Uint8Array>();
    await this.predecodeFontStreams(dict, streamBytes);
    return loadFont(this, dict, (s) => streamBytes.get(s));
  }

  /** Build an {@link OutlineFont} with embedded program streams pre-decoded (M6). */
  async buildOutlineFontForDict(dict: CosDict): Promise<OutlineFont> {
    const streamBytes = new Map<CosObject, Uint8Array>();
    await this.predecodeFontStreams(dict, streamBytes);
    return loadOutlineFont(this, dict, (s) => streamBytes.get(s), this.bundledOutlineFont);
  }

  /**
   * Build a {@link Font} for every /Font resource reachable from `resources`
   * (including through Form XObjects), pre-decoding the streams each font needs
   * so the synchronous interpreter can measure text. Fonts are keyed by the
   * resolved dict's object identity (stable via the object cache).
   */
  private async buildFonts(
    resources: CosDict,
    fonts: Map<CosObject, Font>,
    streamBytes: Map<CosObject, Uint8Array>,
    depth: number,
    visitedForms: Set<number>
  ): Promise<void> {
    if (depth > 16) return;

    for (const value of resourceCategory(this, resources, "Font").map.values()) {
      const dict = this.resolve(value);
      if (!isDict(dict) || fonts.has(dict)) continue;
      await this.predecodeFontStreams(dict, streamBytes);
      fonts.set(dict, loadFont(this, dict, (s) => streamBytes.get(s)));
    }

    for (const value of resourceCategory(this, resources, "XObject").map.values()) {
      const num = isRef(value) ? value.num : undefined;
      if (num != null) {
        if (visitedForms.has(num)) continue;
        visitedForms.add(num);
      }
      const xo = this.resolve(value);
      if (!isStream(xo) || asName(dictGet(xo, "Subtype")) !== "Form") continue;
      const subRes = this.resolve(dictGet(xo, "Resources"));
      if (isDict(subRes)) await this.buildFonts(subRes, fonts, streamBytes, depth + 1, visitedForms);
    }
  }

  /** Pre-decode a font's /ToUnicode, embedded CMaps, and font program streams. */
  private async predecodeFontStreams(
    dict: CosDict,
    streamBytes: Map<CosObject, Uint8Array>
  ): Promise<void> {
    const decodeInto = async (obj: CosObject | undefined): Promise<void> => {
      const s = this.resolve(obj);
      if (!isStream(s) || streamBytes.has(s)) return;
      const bytes = await this.decodeStream(s).catch(() => new Uint8Array(0));
      streamBytes.set(s, bytes);
    };
    const decodeDescriptor = async (desc: CosObject | undefined): Promise<void> => {
      const d = this.resolve(desc);
      if (!isDict(d)) return;
      for (const key of ["FontFile", "FontFile2", "FontFile3"] as const) {
        await decodeInto(dictGet(d, key));
      }
    };

    await decodeInto(dictGet(dict, "ToUnicode"));
    if (asName(dictGet(dict, "Subtype")) === "Type0") {
      await decodeInto(dictGet(dict, "Encoding"));
      const descArr = this.resolve(dictGet(dict, "DescendantFonts"));
      const descendant = isArray(descArr) ? this.resolve(descArr.items[0]) : undefined;
      if (isDict(descendant)) {
        await decodeInto(dictGet(descendant, "CIDToGIDMap"));
        await decodeDescriptor(dictGet(descendant, "FontDescriptor"));
      }
    } else {
      await decodeDescriptor(dictGet(dict, "FontDescriptor"));
    }
  }

  /** Recursively decode every Form XObject reachable from `resources`. */
  private async collectFormXObjects(
    resources: CosDict,
    out: Map<number, Uint8Array>,
    depth: number
  ): Promise<void> {
    if (depth > 16) return;
    const category = resourceCategory(this, resources, "XObject");
    for (const value of category.map.values()) {
      const num = isRef(value) ? value.num : undefined;
      const xo = this.resolve(value);
      if (!isStream(xo) || asName(dictGet(xo, "Subtype")) !== "Form") continue;
      if (num != null) {
        if (out.has(num)) continue; // already decoded (also breaks cycles)
        // A corrupt/undecodable Form XObject degrades to empty rather than
        // throwing out of pageSpans and losing the whole page.
        const decoded = await this.decodeStream(xo).catch(() => new Uint8Array(0));
        out.set(num, decoded);
      }
      const subRes = this.resolve(dictGet(xo, "Resources"));
      if (isDict(subRes)) await this.collectFormXObjects(subRes, out, depth + 1);
    }
  }

  /** Resolve a named XObject for the interpreter (form bytes pre-decoded). */
  private lookupXObject(
    resources: CosDict,
    name: string,
    formBytes: Map<number, Uint8Array>
  ): XObjectInfo | undefined {
    const raw = dictGet(resourceCategory(this, resources, "XObject"), name);
    if (!raw) return undefined;
    const num = isRef(raw) ? raw.num : undefined;
    const xo = this.resolve(raw);
    if (!isStream(xo)) return undefined;
    if (asName(dictGet(xo, "Subtype")) !== "Form") return { subtype: "image" };
    const subRes = this.resolve(dictGet(xo, "Resources"));
    return {
      subtype: "form",
      bytes: num != null ? formBytes.get(num) : undefined,
      resources: isDict(subRes) ? subRes : undefined,
      matrix: this.readMatrix(dictGet(xo, "Matrix")),
      id: num,
    };
  }

  private readMatrix(o: CosObject | undefined): Matrix | undefined {
    const arr = this.resolve(o);
    if (!isArray(arr) || arr.items.length < 6) return undefined;
    const nums = arr.items.slice(0, 6).map((it) => asNumber(this.resolve(it)));
    if (nums.some((v) => v == null)) return undefined;
    return [nums[0]!, nums[1]!, nums[2]!, nums[3]!, nums[4]!, nums[5]!];
  }

  private readRect(arr: CosArray | undefined): [number, number, number, number] | undefined {
    if (!arr || arr.items.length < 4) return undefined;
    const nums = arr.items.slice(0, 4).map((it) => asNumber(this.resolve(it)));
    if (nums.some((n) => n == null)) return undefined;
    return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
  }

  /**
   * Raw bytes of an indirect object's full "<num> <gen> obj ... endobj" span,
   * copied verbatim from the source (for byte-stable round-trips). Only works
   * for uncompressed objects.
   */
  rawIndirectObjectBytes(num: number): Uint8Array | undefined {
    const entry = this.xref.get(num);
    if (!entry || entry.kind !== "inuse") return undefined;
    const parser = new ObjectParser(this.bytes, entry.offset, (n) => this.getObject(n));
    const io = parser.parseIndirectObject();
    return this.bytes.subarray(io.start, io.end);
  }

  /** All in-use (uncompressed + compressed) object numbers, ascending. */
  objectNumbers(): number[] {
    const nums: number[] = [];
    for (const [num, entry] of this.xref) {
      if (entry.kind !== "free") nums.push(num);
    }
    return nums.sort((a, b) => a - b);
  }

  xrefEntry(num: number): XrefEntry | undefined {
    return this.xref.get(num);
  }
}

interface InheritedAttrs {
  mediaBox?: CosArray;
  resources?: CosObject;
  rotate?: number;
}
