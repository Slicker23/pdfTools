export const FREE_DOCUMENT_LIMIT = 3;
export const LIFETIME_PRICE_EUR = 1;
export const SERVER_JOBS_DAILY_LIMIT = 50;
export const AI_CREDITS_MONTHLY_LIMIT = 20;
export const BATCH_MAX_FILES = 100;
export const TEMP_FILE_TTL_SECONDS = 3600;

export const LOCALES = ["en", "de", "fr", "es", "it", "pt", "nl", "pl"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const TOOLS = [
  "merge-pdf",
  "split-pdf",
  "extract-pdf",
  "rotate-pdf",
  "reorder-pdf",
  "compress-pdf",
  "pdf-to-jpg",
  "jpg-to-pdf",
  "annotate-pdf",
  "edit-pdf",
  "pdf-to-word",
  "pdf-to-excel",
  "pdf-to-ppt",
  "word-to-pdf",
  "ocr-pdf",
  "form-pdf",
  "sign-pdf",
  "watermark-pdf",
  "compare-pdf",
  "extract-images",
  "page-numbers",
  "flatten-pdf",
  "remove-metadata",
  "password-protect",
  "batch-process",
  "chat-pdf",
  "template-pdf",
  "redact-pdf",
  "collaborate",
] as const;

export type ToolId = (typeof TOOLS)[number];

export const TIER1_TOOLS: ToolId[] = [
  "merge-pdf",
  "split-pdf",
  "extract-pdf",
  "rotate-pdf",
  "reorder-pdf",
  "compress-pdf",
  "pdf-to-jpg",
  "jpg-to-pdf",
  "annotate-pdf",
  "edit-pdf",
];

export const SERVER_TOOLS: ToolId[] = ["ocr-pdf", "batch-process"];

export const AI_TOOLS: ToolId[] = ["chat-pdf", "template-pdf"];
