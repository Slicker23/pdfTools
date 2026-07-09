import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { promisify } from "util";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

export interface OcrJobMetadata {
  language?: string;
  output?: string;
}

export async function handleOcrJob(input: Buffer, metadata: OcrJobMetadata): Promise<Buffer> {
  const lang = metadata.language ?? "eng";
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "pdfflow-ocr-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.pdf");

  try {
    await writeFile(inputPath, input);
    await execFileAsync(
      "ocrmypdf",
      ["--force-ocr", "-l", lang, inputPath, outputPath],
      { timeout: 300_000 }
    );
    return await readFile(outputPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      throw new Error("ocrmypdf is not installed. Run: sudo dnf install ocrmypdf");
    }
    throw new Error(`OCR failed: ${msg}`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
