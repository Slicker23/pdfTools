import type { PiiMatch } from "@/lib/pii";
import { redactPiiInPdfBytes } from "@/lib/pdf/redact";

export interface RedactionJobMetadata {
  selectedMatches?: PiiMatch[];
}

export async function handleRedactionJob(
  input: Buffer,
  metadata: RedactionJobMetadata
): Promise<Buffer> {
  const selected = metadata.selectedMatches ?? [];
  if (selected.length === 0) {
    throw new Error("No PII matches selected for redaction");
  }

  const result = await redactPiiInPdfBytes(new Uint8Array(input), selected);
  return Buffer.from(result.pdf);
}
