import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";

export interface BatchJobMetadata {
  operation?: string;
  quality?: number;
}

async function compressPdfBuffer(bytes: Buffer): Promise<Buffer> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await pdf.save({ useObjectStreams: true });
  return Buffer.from(out);
}

export async function handleBatchJob(input: Buffer, metadata: BatchJobMetadata): Promise<Buffer> {
  const operation = metadata.operation ?? "compress";
  if (operation !== "compress") {
    throw new Error(`Unsupported batch operation: ${operation}`);
  }

  const zip = await JSZip.loadAsync(input);
  const outZip = new JSZip();
  const entries = Object.entries(zip.files).filter(([, f]) => !f.dir);

  if (entries.length === 0) {
    throw new Error("Batch ZIP contains no files");
  }

  for (const [name, file] of entries) {
    if (!name.toLowerCase().endsWith(".pdf")) {
      outZip.file(name, await file.async("nodebuffer"));
      continue;
    }
    const pdfBytes = await file.async("nodebuffer");
    const compressed = await compressPdfBuffer(pdfBytes);
    const outName = name.replace(/\.pdf$/i, "_compressed.pdf");
    outZip.file(outName, compressed);
  }

  return Buffer.from(await outZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
