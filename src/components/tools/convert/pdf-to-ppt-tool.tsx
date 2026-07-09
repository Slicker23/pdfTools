"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { baseName, pdfToPptx } from "@/lib/pdf";
import { runServerJob, JOB_OUTPUT_EXT } from "@/lib/jobs/client-jobs";
import { downloadBlob } from "@/lib/utils";

export function PdfToPptTool() {
  const { data: session } = useSession();
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <ToolWorkspace
      toolId="pdf-to-ppt"
      onProcess={async (files) => {
        setResult(null);
        const base = baseName(files[0].name);

        if (session?.user?.paid) {
          try {
            const blob = await runServerJob(files[0], "pdf_to_ppt", undefined, setStatus);
            downloadBlob(blob, `${base}.${JOB_OUTPUT_EXT.pdf_to_ppt}`);
            setStatus(null);
            setResult(
              "PowerPoint downloaded — slides with layout and images via LibreOffice"
            );
            return;
          } catch {
            setStatus(null);
          }
        }

        const blob = await pdfToPptx(files[0]);
        downloadBlob(blob, `${base}.pptx`);
        setResult(
          "PowerPoint downloaded — one slide per page with a high-resolution image"
        );
      }}
      processLabel={status ?? "Convert to PowerPoint"}
    >
      <p className="text-sm text-muted">
        Converts your PDF to PowerPoint slides. When signed in, LibreOffice builds editable
        slides with layout and images. The browser fallback embeds each page as a sharp
        slide image matched to the PDF page proportions.
      </p>
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}
