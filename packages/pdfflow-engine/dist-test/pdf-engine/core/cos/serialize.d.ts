/**
 * COS object serializer (writer).
 *
 * Used only for objects the engine creates or modifies - untouched objects are
 * copied verbatim from the source file to guarantee byte-stable round-trips.
 * The output is valid PDF syntax but not necessarily byte-identical to any
 * particular producer's formatting.
 */
import { asciiBytes } from "../bytes";
import { type CosObject } from "./types";
/** Serialize a single COS value to bytes. */
export declare function serializeCosObject(o: CosObject): Uint8Array;
/** Serialize a full indirect object: "<num> <gen> obj ... endobj\n". */
export declare function serializeIndirectObject(num: number, gen: number, o: CosObject): Uint8Array;
export { asciiBytes };
//# sourceMappingURL=serialize.d.ts.map