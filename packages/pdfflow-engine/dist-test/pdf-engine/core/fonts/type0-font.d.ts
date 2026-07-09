/**
 * Type0 composite fonts with a CIDFont descendant (ISO 32000-1, 9.7).
 *
 * The `/Encoding` CMap maps multi-byte character codes to CIDs; `/W` and `/DW`
 * on the descendant CIDFont give per-CID advance widths. Unicode comes from
 * `/ToUnicode` (predefined CID->Unicode CMaps are deferred). Latin/European
 * usage is typically Identity-H with an embedded font and a ToUnicode map.
 */
import type { CosDocument } from "../document";
import { type CosDict } from "../cos/types";
import type { Font, StreamBytes } from "./types";
export declare function loadType0Font(doc: CosDocument, dict: CosDict, getStreamBytes: StreamBytes): Font;
//# sourceMappingURL=type0-font.d.ts.map