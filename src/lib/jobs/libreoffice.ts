import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { promisify } from "util";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

const FORMAT_MAP: Record<string, { ext: string; format: string }> = {
  pdf_to_word: { ext: "pdf", format: "docx" },
  pdf_to_excel: { ext: "pdf", format: "xlsx" },
  pdf_to_ppt: { ext: "pdf", format: "pptx" },
  word_to_pdf: { ext: "docx", format: "pdf" },
};

/** PDF must be opened with the correct import filter or LibreOffice treats it as Draw and fails. */
const PDF_INFILTER: Partial<Record<string, string>> = {
  pdf_to_word: "writer_pdf_import",
  pdf_to_ppt: "impress_pdf_import",
};

function loArgs(loProfile: string, extra: string[]): string[] {
  return [`-env:UserInstallation=file://${loProfile}`, "--headless", "--norestore", ...extra];
}

export async function convertWithLibreOffice(
  input: Buffer,
  jobType: string
): Promise<Buffer | null> {
  const mapping = FORMAT_MAP[jobType];
  if (!mapping) return null;

  const soffice = process.env.LIBREOFFICE_PATH ?? "soffice";
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "pdfflow-"));
  const inputPath = path.join(tmpDir, `input.${mapping.ext}`);
  const loProfile = path.join(tmpDir, "lo-profile");

  try {
    await writeFile(inputPath, input);

    const infilter = PDF_INFILTER[jobType];

    // PDF→Word: two-step via ODT preserves layout and editable text.
    if (jobType === "pdf_to_word") {
      const odtPath = path.join(tmpDir, "input.odt");
      await execFileAsync(
        soffice,
        [
          ...loArgs(loProfile, []),
          "--infilter=writer_pdf_import",
          "--convert-to",
          "odt",
          "--outdir",
          tmpDir,
          inputPath,
        ],
        { timeout: 120_000 }
      );

      await execFileAsync(
        soffice,
        [...loArgs(loProfile, []), "--convert-to", "docx", "--outdir", tmpDir, odtPath],
        { timeout: 120_000 }
      );

      return await readFile(path.join(tmpDir, "input.docx"));
    }

    // PDF→PowerPoint: two-step via ODP improves slide fidelity.
    if (jobType === "pdf_to_ppt") {
      const odpPath = path.join(tmpDir, "input.odp");
      await execFileAsync(
        soffice,
        [
          ...loArgs(loProfile, []),
          "--infilter=impress_pdf_import",
          "--convert-to",
          "odp",
          "--outdir",
          tmpDir,
          inputPath,
        ],
        { timeout: 120_000 }
      );

      await execFileAsync(
        soffice,
        [...loArgs(loProfile, []), "--convert-to", "pptx", "--outdir", tmpDir, odpPath],
        { timeout: 120_000 }
      );

      return await readFile(path.join(tmpDir, "input.pptx"));
    }

    const args = [
      ...loArgs(loProfile, []),
      ...(infilter ? [`--infilter=${infilter}`] : []),
      "--convert-to",
      mapping.format,
      "--outdir",
      tmpDir,
      inputPath,
    ];
    await execFileAsync(soffice, args, { timeout: 120_000 });

    return await readFile(path.join(tmpDir, `input.${mapping.format}`));
  } catch {
    return null;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function isLibreOfficeJob(jobType: string): boolean {
  return jobType in FORMAT_MAP;
}
