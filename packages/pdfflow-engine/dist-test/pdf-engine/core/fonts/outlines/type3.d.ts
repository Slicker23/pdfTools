/**
 * Type3 CharProc outline extraction (M9 scoped).
 *
 * Full CharProc interpretation is out of scope; unsupported Type3 fonts return
 * undefined so callers can fall back to overlay instead of emitting bad paths.
 */
import type { CosDocument } from "../../document";
import { type CosDict } from "../../cos/types";
export declare function type3HasSupportedOutlines(_doc: CosDocument, dict: CosDict): boolean;
//# sourceMappingURL=type3.d.ts.map