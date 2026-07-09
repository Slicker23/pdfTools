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
import { type CosDict } from "../cos/types";
import type { Font, StreamBytes } from "./types";
export type { Font, Glyph, StreamBytes } from "./types";
export declare function loadFont(doc: CosDocument, dict: CosDict, getStreamBytes: StreamBytes): Font;
//# sourceMappingURL=font.d.ts.map