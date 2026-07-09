import { PdfToolError } from "./errors";

export interface ParsedPageRange {
  label: string;
  pages: number[];
}

export function parsePageRanges(input: string, totalPages: number): ParsedPageRange[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PdfToolError("Enter at least one page or range.", "EMPTY_RANGE");
  }

  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  const results: ParsedPageRange[] = [];

  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (isNaN(start) || isNaN(end)) {
        throw new PdfToolError(`Invalid range "${part}". Use format like 1-3.`, "INVALID_RANGE");
      }
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        throw new PdfToolError(
          `Range "${part}" is out of bounds. Document has ${totalPages} pages.`,
          "OUT_OF_BOUNDS"
        );
      }
      if (start > end) {
        throw new PdfToolError(`Range "${part}" has start greater than end.`, "INVALID_RANGE");
      }

      const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      results.push({ label: part, pages });
    } else {
      const page = parseInt(part, 10);
      if (isNaN(page)) {
        throw new PdfToolError(`Invalid page "${part}". Use numbers like 1, 3, 5-7.`, "INVALID_PAGE");
      }
      if (page < 1 || page > totalPages) {
        throw new PdfToolError(
          `Page ${page} is out of bounds. Document has ${totalPages} pages.`,
          "OUT_OF_BOUNDS"
        );
      }
      results.push({ label: part, pages: [page] });
    }
  }

  return results;
}

export function parsePageList(input: string, totalPages: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PdfToolError("Enter at least one page number.", "EMPTY_PAGES");
  }

  const pages = trimmed
    .split(",")
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => !isNaN(n));

  if (pages.length === 0) {
    throw new PdfToolError("No valid page numbers found.", "INVALID_PAGES");
  }

  for (const page of pages) {
    if (page < 1 || page > totalPages) {
      throw new PdfToolError(
        `Page ${page} is out of bounds. Document has ${totalPages} pages.`,
        "OUT_OF_BOUNDS"
      );
    }
  }

  return pages;
}

export function parsePageOrder(input: string, totalPages: number): number[] {
  const order = parsePageList(input, totalPages);

  if (order.length !== totalPages) {
    throw new PdfToolError(
      `Provide all ${totalPages} page numbers exactly once (got ${order.length}).`,
      "INCOMPLETE_ORDER"
    );
  }

  const unique = new Set(order);
  if (unique.size !== order.length) {
    throw new PdfToolError("Page order contains duplicates.", "DUPLICATE_PAGES");
  }

  return order;
}

export function splitEveryPage(totalPages: number): ParsedPageRange[] {
  return Array.from({ length: totalPages }, (_, i) => ({
    label: `${i + 1}`,
    pages: [i + 1],
  }));
}
