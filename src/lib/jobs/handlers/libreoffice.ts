import { convertWithLibreOffice, isLibreOfficeJob } from "@/lib/jobs/libreoffice";

export async function handleLibreOfficeJob(input: Buffer, jobType: string): Promise<Buffer> {
  if (!isLibreOfficeJob(jobType)) {
    throw new Error(`Not a LibreOffice job type: ${jobType}`);
  }

  const converted = await convertWithLibreOffice(input, jobType);
  if (!converted || converted.length === 0) {
    if (jobType === "pdf_to_excel") {
      throw new Error(
        "LibreOffice cannot import PDF to Excel reliably on this server. Use the in-browser converter instead."
      );
    }
    throw new Error(
      "Server conversion unavailable. Install LibreOffice with PDF import, or use the in-browser converter."
    );
  }

  return converted;
}
