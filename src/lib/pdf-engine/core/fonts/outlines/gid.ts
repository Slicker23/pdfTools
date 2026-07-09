/**
 * Glyph index resolution for outline extraction (M6).
 */
import type { TrueTypeFace } from "./ttf";
import type { CffFont } from "./cff";

export interface GidResolver {
  gidForCode(code: number, unicode?: string): number | undefined;
  gidForCid(cid: number): number | undefined;
}

export function trueTypeResolver(face: TrueTypeFace, encodingNames?: string[]): GidResolver {
  return {
    gidForCode(code: number, unicode?: string) {
      if (unicode) {
        for (const cp of unicode) {
          const gid = face.gidForUnicode(cp.codePointAt(0)!);
          if (gid != null) return gid;
        }
      }
      const name = encodingNames?.[code];
      if (name) {
        const gid = face.gidForName(name);
        if (gid != null) return gid;
      }
      return undefined;
    },
    gidForCid(cid: number) {
      return cid;
    },
  };
}

export function cffResolver(
  cff: CffFont,
  codeToName: (code: number) => string | undefined,
  charsetNames?: string[]
): GidResolver {
  const nameToGid = new Map<string, number>();
  if (charsetNames) {
    for (let i = 0; i < charsetNames.length; i++) {
      nameToGid.set(charsetNames[i]!, i);
    }
  }
  return {
    gidForCode(code: number) {
      const name = codeToName(code);
      if (!name) return code > 0 && code < cff.nGlyphs ? code : undefined;
      const gid = nameToGid.get(name);
      if (gid != null) return gid;
      return code < cff.nGlyphs ? code : undefined;
    },
    gidForCid(cid: number) {
      return cid < cff.nGlyphs ? cid : undefined;
    },
  };
}

export function cidIdentityResolver(): GidResolver {
  return {
    gidForCode() {
      return undefined;
    },
    gidForCid(cid: number) {
      return cid;
    },
  };
}
