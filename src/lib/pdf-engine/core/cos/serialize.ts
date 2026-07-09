/**
 * COS object serializer (writer).
 *
 * Used only for objects the engine creates or modifies - untouched objects are
 * copied verbatim from the source file to guarantee byte-stable round-trips.
 * The output is valid PDF syntax but not necessarily byte-identical to any
 * particular producer's formatting.
 */
import { ByteWriter, asciiBytes } from "../bytes";
import {
  type CosDict,
  type CosObject,
  type CosString,
} from "./types";

const REGULAR_NAME = /[\x21-\x7e]/;

/** Escape a name per PDF rules: non-regular bytes become #xx. */
function encodeName(name: string): string {
  let out = "/";
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i) & 0xff;
    const ch = String.fromCharCode(c);
    // Escape whitespace, delimiters, '#', and out-of-range bytes.
    if (
      c < 0x21 ||
      c > 0x7e ||
      ch === "#" ||
      ch === "/" ||
      ch === "(" ||
      ch === ")" ||
      ch === "<" ||
      ch === ">" ||
      ch === "[" ||
      ch === "]" ||
      ch === "{" ||
      ch === "}" ||
      ch === "%"
    ) {
      out += "#" + c.toString(16).padStart(2, "0");
    } else {
      out += ch;
    }
  }
  return out;
}

function isPrintableLiteral(bytes: Uint8Array): boolean {
  for (const b of bytes) {
    if (b < 0x20 || b > 0x7e) return false;
  }
  return true;
}

function writeString(w: ByteWriter, s: CosString): void {
  if (s.hex || !isPrintableLiteral(s.bytes)) {
    // Hex form is always safe.
    let hex = "<";
    for (const b of s.bytes) hex += b.toString(16).padStart(2, "0");
    hex += ">";
    w.ascii(hex);
    return;
  }
  // Literal form with minimal escaping.
  w.byte(0x28); // (
  for (const b of s.bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) {
      w.byte(0x5c);
    }
    w.byte(b);
  }
  w.byte(0x29); // )
}

function formatReal(value: number, raw?: string): string {
  if (raw != null) return raw;
  if (Number.isInteger(value)) return value.toFixed(1);
  // Trim to a reasonable precision without exponent notation.
  let s = value.toFixed(6);
  s = s.replace(/0+$/, "").replace(/\.$/, ".0");
  return s;
}

function writeObject(w: ByteWriter, o: CosObject): void {
  switch (o.type) {
    case "null":
      w.ascii("null");
      break;
    case "bool":
      w.ascii(o.value ? "true" : "false");
      break;
    case "int":
      w.ascii(String(Math.trunc(o.value)));
      break;
    case "real":
      w.ascii(formatReal(o.value, o.raw));
      break;
    case "string":
      writeString(w, o);
      break;
    case "name":
      w.ascii(encodeName(o.name));
      break;
    case "ref":
      w.ascii(`${o.num} ${o.gen} R`);
      break;
    case "array": {
      w.byte(0x5b); // [
      for (let i = 0; i < o.items.length; i++) {
        if (i > 0) w.byte(0x20);
        writeObject(w, o.items[i]!);
      }
      w.byte(0x5d); // ]
      break;
    }
    case "dict":
      writeDict(w, o);
      break;
    case "stream": {
      writeDict(w, o.dict);
      w.ascii("\nstream\n");
      w.bytes(o.raw);
      w.ascii("\nendstream");
      break;
    }
  }
}

function writeDict(w: ByteWriter, d: CosDict): void {
  w.ascii("<<");
  for (const [key, value] of d.map) {
    w.byte(0x20);
    w.ascii(encodeName(key));
    w.byte(0x20);
    writeObject(w, value);
  }
  w.ascii(" >>");
}

/** Serialize a single COS value to bytes. */
export function serializeCosObject(o: CosObject): Uint8Array {
  const w = new ByteWriter();
  writeObject(w, o);
  return w.toUint8Array();
}

/** Serialize a full indirect object: "<num> <gen> obj ... endobj\n". */
export function serializeIndirectObject(num: number, gen: number, o: CosObject): Uint8Array {
  const w = new ByteWriter();
  w.ascii(`${num} ${gen} obj\n`);
  writeObject(w, o);
  w.ascii("\nendobj\n");
  return w.toUint8Array();
}

export { asciiBytes };
