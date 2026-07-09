/**
 * Page resource lookup (ISO 32000-1, 7.8.3).
 *
 * A page's /Resources dict groups named resources by category (/Font, /XObject,
 * ...). These helpers resolve a category sub-dictionary and its named entries,
 * following indirect references, on top of an already inheritance-resolved
 * resources dict (see PageNode.resources).
 */
import type { CosDocument } from "./document";
import { type CosDict, type CosObject } from "./cos/types";
/** Standard resource categories a content stream can reference by name. */
export declare const RESOURCE_CATEGORIES: readonly ["Font", "XObject", "ExtGState", "ColorSpace", "Pattern", "Shading", "Properties"];
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];
/** The sub-dictionary for a resource category (e.g. "Font"); empty if absent. */
export declare function resourceCategory(doc: CosDocument, resources: CosDict, category: ResourceCategory | string): CosDict;
/** Resolve a single named resource (e.g. Font "F1"); undefined if not present. */
export declare function lookupResource(doc: CosDocument, resources: CosDict, category: ResourceCategory | string, name: string): CosObject | undefined;
/** All resolved entries of a category, keyed by their resource name. */
export declare function listResourceEntries(doc: CosDocument, resources: CosDict, category: ResourceCategory | string): Map<string, CosObject>;
//# sourceMappingURL=resources.d.ts.map