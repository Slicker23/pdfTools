/**
 * Font loader/dispatcher (M4).
 *
 * `loadFont` builds a {@link Font} from a resolved /Font dictionary, dispatching
 * to the simple-font or Type0 implementation. Streams that the font needs
 * (/ToUnicode, embedded /Encoding CMaps) must be pre-decoded by the caller and
 * exposed via `getStreamBytes`, because the content interpreter is synchronous
 * while stream inflation can be async on some platforms.
 */
import type { CosDocument } from "../document";
import { asName, dictGet, type CosDict } from "../cos/types";
import type { Font, StreamBytes } from "./types";
import { loadSimpleFont } from "./simple-font";
import { loadType0Font } from "./type0-font";

export type { Font, Glyph, StreamBytes } from "./types";

export function loadFont(
  doc: CosDocument,
  dict: CosDict,
  getStreamBytes: StreamBytes
): Font {
  const subtype = asName(dictGet(dict, "Subtype"));
  if (subtype === "Type0") return loadType0Font(doc, dict, getStreamBytes);
  return loadSimpleFont(doc, dict, getStreamBytes);
}
