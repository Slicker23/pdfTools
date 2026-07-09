export class PdfToolError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "PdfToolError";
  }
}

export function isPdfToolError(error: unknown): error is PdfToolError {
  return error instanceof PdfToolError;
}

export function toUserMessage(error: unknown): string {
  if (isPdfToolError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}

export async function loadPdfBytes(file: File): Promise<ArrayBuffer> {
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    throw new PdfToolError(`"${file.name}" is not a PDF file.`, "INVALID_TYPE");
  }
  if (file.size === 0) {
    throw new PdfToolError(`"${file.name}" is empty.`, "EMPTY_FILE");
  }
  if (file.size > 100 * 1024 * 1024) {
    throw new PdfToolError(`"${file.name}" exceeds 100 MB limit.`, "FILE_TOO_LARGE");
  }
  return file.arrayBuffer();
}
