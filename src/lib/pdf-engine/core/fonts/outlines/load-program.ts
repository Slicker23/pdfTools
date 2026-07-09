/**
 * Load embedded font programs from a PDF FontDescriptor (M6).
 */
import type { CosDocument } from "../../document";
import {
  dictGet,
  isStream,
  type CosDict,
  type CosObject,
} from "../../cos/types";
import type { StreamBytes } from "../types";

export interface FontProgram {
  /** Raw FontFile2 or FontFile3 bytes (decoded). */
  bytes: Uint8Array;
  /** FontFile2 (TrueType) or FontFile3 (CFF/Type1). */
  kind: "FontFile2" | "FontFile3";
}

export function loadFontProgram(
  doc: CosDocument,
  descriptor: CosObject | undefined,
  getStreamBytes: StreamBytes
): FontProgram | undefined {
  if (!descriptor || descriptor.type !== "dict") return undefined;
  const dict = descriptor as CosDict;
  for (const key of ["FontFile2", "FontFile3", "FontFile"] as const) {
    const obj = doc.resolve(dictGet(dict, key));
    if (!isStream(obj)) continue;
    const bytes = getStreamBytes(obj);
    if (!bytes || bytes.length === 0) continue;
    if (key === "FontFile2") return { bytes, kind: "FontFile2" };
    return { bytes, kind: "FontFile3" };
  }
  return undefined;
}
