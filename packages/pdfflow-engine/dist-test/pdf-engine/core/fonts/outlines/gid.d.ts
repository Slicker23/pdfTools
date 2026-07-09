/**
 * Glyph index resolution for outline extraction (M6).
 */
import type { TrueTypeFace } from "./ttf";
import type { CffFont } from "./cff";
export interface GidResolver {
    gidForCode(code: number, unicode?: string): number | undefined;
    gidForCid(cid: number): number | undefined;
}
export declare function trueTypeResolver(face: TrueTypeFace, encodingNames?: string[]): GidResolver;
export declare function cffResolver(cff: CffFont, codeToName: (code: number) => string | undefined, charsetNames?: string[]): GidResolver;
export declare function cidIdentityResolver(): GidResolver;
//# sourceMappingURL=gid.d.ts.map