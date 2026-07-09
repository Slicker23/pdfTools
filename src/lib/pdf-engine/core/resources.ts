/**
 * Page resource lookup (ISO 32000-1, 7.8.3).
 *
 * A page's /Resources dict groups named resources by category (/Font, /XObject,
 * ...). These helpers resolve a category sub-dictionary and its named entries,
 * following indirect references, on top of an already inheritance-resolved
 * resources dict (see PageNode.resources).
 */
import type { CosDocument } from "./document";
import { cosDict, dictGet, isDict, type CosDict, type CosObject } from "./cos/types";

/** Standard resource categories a content stream can reference by name. */
export const RESOURCE_CATEGORIES = [
  "Font",
  "XObject",
  "ExtGState",
  "ColorSpace",
  "Pattern",
  "Shading",
  "Properties",
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

/** The sub-dictionary for a resource category (e.g. "Font"); empty if absent. */
export function resourceCategory(
  doc: CosDocument,
  resources: CosDict,
  category: ResourceCategory | string
): CosDict {
  const cat = doc.resolve(dictGet(resources, category));
  return isDict(cat) ? cat : cosDict([]);
}

/** Resolve a single named resource (e.g. Font "F1"); undefined if not present. */
export function lookupResource(
  doc: CosDocument,
  resources: CosDict,
  category: ResourceCategory | string,
  name: string
): CosObject | undefined {
  const entry = dictGet(resourceCategory(doc, resources, category), name);
  return entry ? doc.resolve(entry) : undefined;
}

/** All resolved entries of a category, keyed by their resource name. */
export function listResourceEntries(
  doc: CosDocument,
  resources: CosDict,
  category: ResourceCategory | string
): Map<string, CosObject> {
  const out = new Map<string, CosObject>();
  for (const [name, value] of resourceCategory(doc, resources, category).map) {
    out.set(name, doc.resolve(value));
  }
  return out;
}
