/**
 * Content-stream interpreter (M3 geometry + M4 advances).
 *
 * A graphics/text state machine over the tokenized operations. It tracks the
 * CTM and text state and emits one {@link TextSpan} per text-showing operator
 * (Tj/TJ/'/"), positioned in PDF page space. When a {@link Font} is available
 * (via `loadFont`), each glyph is measured: the text matrix advances by real
 * widths per ISO 32000-1 9.4.4 (including Tc/Tw/Tz and TJ adjustments) and each
 * span gains decoded Unicode, per-glyph positions, an end origin, and bounds.
 * With no font resolved it degrades to raw codes with width-free positioning.
 *
 * Form XObjects invoked with `Do` are interpreted recursively (with the form's
 * /Matrix concatenated onto the CTM), guarded against cycles and runaway depth.
 */
import { type CosDict, type CosObject } from "../cos/types";
import { type Matrix } from "./matrix";
import type { Font } from "../fonts/types";
import type { TextSpan } from "./types";
export interface XObjectInfo {
    subtype: "form" | "image";
    bytes?: Uint8Array;
    resources?: CosDict;
    matrix?: Matrix;
    /** Object number for cycle detection (optional). */
    id?: number;
}
export interface InterpretCtx {
    /** Initial CTM (defaults to identity = MediaBox-origin page space). */
    initialCtm?: Matrix;
    resources: CosDict;
    fontLookup: (resources: CosDict, name: string) => CosObject | undefined;
    xobjectLookup?: (resources: CosDict, name: string) => XObjectInfo | undefined;
    /** Build a measured Font from a resolved font dict (M4). */
    loadFont?: (fontDict: CosObject) => Font | undefined;
}
export declare function interpretContent(bytes: Uint8Array, ctx: InterpretCtx): TextSpan[];
/** Graphics-state CTM immediately before the operator at `stopBeforeOffset`. */
export declare function contentStateAtOffset(bytes: Uint8Array, stopBeforeOffset: number, ctx: InterpretCtx): Matrix;
//# sourceMappingURL=interpreter.d.ts.map