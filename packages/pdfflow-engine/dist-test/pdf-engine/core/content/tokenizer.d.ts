import { type CosObject } from "../cos/types";
export interface ContentOp {
    op: string;
    operands: CosObject[];
    /** Byte offset of the operator keyword in the tokenized buffer. */
    opStart: number;
    /** Byte offset just past the operator keyword. */
    opEnd: number;
    /** Byte offset of the first operand token, or -1 if the operator has none. */
    operandsStart: number;
}
/** Yield each content-stream operation (operator + its operands) in order. */
export declare function tokenizeContent(bytes: Uint8Array): Generator<ContentOp>;
//# sourceMappingURL=tokenizer.d.ts.map