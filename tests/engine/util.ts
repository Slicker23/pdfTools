import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import type { CosObject } from "../../src/lib/pdf-engine/core";

const FIXTURE_DIR = resolve(__dirname, "..", "fixtures");
const CORPUS_DIR = resolve(FIXTURE_DIR, "corpus");
const WILD_DIR = resolve(FIXTURE_DIR, "wild");

export function loadFixture(name: string): Uint8Array {
  const buf = readFileSync(resolve(FIXTURE_DIR, name));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export interface CorpusEntry {
  file: string;
  pages: number;
  encrypted: boolean;
  password?: string;
}

export function loadCorpus(): CorpusEntry[] {
  const raw = readFileSync(resolve(CORPUS_DIR, "manifest.json"), "utf-8");
  return JSON.parse(raw) as CorpusEntry[];
}

export function loadCorpusFile(name: string): Uint8Array {
  const buf = readFileSync(resolve(CORPUS_DIR, name));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Real-world PDFs dropped into tests/fixtures/wild/ (auto-discovered). */
export function listWildFiles(): string[] {
  if (!existsSync(WILD_DIR)) return [];
  return readdirSync(WILD_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
}

export function loadWildFile(name: string): Uint8Array {
  const buf = readFileSync(resolve(WILD_DIR, name));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Structural equality for COS objects (numbers compared by value). */
export function cosEqual(a: CosObject, b: CosObject): boolean {
  if (a.type !== b.type) {
    // Allow int/real cross-comparison by value.
    if (
      (a.type === "int" || a.type === "real") &&
      (b.type === "int" || b.type === "real")
    ) {
      return a.value === b.value;
    }
    return false;
  }
  switch (a.type) {
    case "null":
      return true;
    case "bool":
      return a.value === (b as typeof a).value;
    case "int":
    case "real":
      return a.value === (b as typeof a).value;
    case "name":
      return a.name === (b as typeof a).name;
    case "string":
      return bytesEqual(a.bytes, (b as typeof a).bytes);
    case "ref": {
      const rb = b as typeof a;
      return a.num === rb.num && a.gen === rb.gen;
    }
    case "array": {
      const ab = b as typeof a;
      if (a.items.length !== ab.items.length) return false;
      return a.items.every((it, i) => cosEqual(it, ab.items[i]!));
    }
    case "dict": {
      const db = b as typeof a;
      if (a.map.size !== db.map.size) return false;
      for (const [k, v] of a.map) {
        const other = db.map.get(k);
        if (!other || !cosEqual(v, other)) return false;
      }
      return true;
    }
    case "stream": {
      const sb = b as typeof a;
      return cosEqual(a.dict, sb.dict) && bytesEqual(a.raw, sb.raw);
    }
  }
}
