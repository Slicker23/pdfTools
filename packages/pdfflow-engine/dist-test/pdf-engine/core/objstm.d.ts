import type { CosObject } from "./cos/types";
export interface ObjStmObject {
    num: number;
    obj: CosObject;
}
/**
 * Parse all objects from a decoded object-stream body.
 * @param decoded fully decoded (inflated, unpredicted) stream bytes
 * @param n       /N  (number of objects)
 * @param first   /First (byte offset of the first object)
 */
export declare function parseObjectStream(decoded: Uint8Array, n: number, first: number): ObjStmObject[];
//# sourceMappingURL=objstm.d.ts.map