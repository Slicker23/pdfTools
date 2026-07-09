import { encryptPDF } from "@pdfsmaller/pdf-encrypt";
import { PdfToolError } from "./errors";
import { loadPdfBytes } from "./errors";

export type PasswordAlgorithm = "AES-256" | "RC4";

export interface PasswordProtectOptions {
  ownerPassword?: string;
  algorithm?: PasswordAlgorithm;
  allowPrinting?: boolean;
  allowCopying?: boolean;
  allowModifying?: boolean;
}

export async function passwordProtect(
  file: File,
  password: string,
  options: PasswordProtectOptions = {}
): Promise<Uint8Array> {
  if (!password.trim()) {
    throw new PdfToolError("Enter a password to protect the PDF.", "MISSING_PASSWORD");
  }

  const bytes = new Uint8Array(await loadPdfBytes(file));

  try {
    return await encryptPDF(bytes, password, {
      ownerPassword: options.ownerPassword?.trim() || password,
      algorithm: options.algorithm ?? "AES-256",
      allowPrinting: options.allowPrinting ?? true,
      allowCopying: options.allowCopying ?? true,
      allowModifying: options.allowModifying ?? true,
      allowAnnotating: options.allowModifying ?? true,
      allowFillingForms: options.allowModifying ?? true,
    });
  } catch (error) {
    throw new PdfToolError(
      error instanceof Error ? error.message : "Could not encrypt this PDF.",
      "ENCRYPTION_FAILED"
    );
  }
}
