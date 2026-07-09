"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { baseName, pdfToDocx } from "@/lib/pdf";
import { detectTwoColumnPdf } from "@/lib/pdf/layout-extract";
import { runServerJob, JOB_OUTPUT_EXT } from "@/lib/jobs/client-jobs";
import { downloadBlob } from "@/lib/utils";

export function PdfToWordTool() {
  const { data: session } = useSession();
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <ToolWorkspace
      toolId="pdf-to-word"
      onProcess={async (files) => {
        setResult(null);
        const base = baseName(files[0].name);
        const twoColumn = await detectTwoColumnPdf(files[0]);

        if (session?.user?.paid) {
          try {
            const blob = await runServerJob(files[0], "pdf_to_word", undefined, setStatus);
            downloadBlob(blob, `${base}.${JOB_OUTPUT_EXT.pdf_to_word}`);
            setStatus(null);
            setResult(
              twoColumn
                ? "Editable CV downloaded — LibreOffice conversion with sidebar restored on the server"
                : "Editable Word document downloaded — converted on the server with LibreOffice"
            );
            return;
          } catch {
            setStatus(null);
          }
        }

        const blob = await pdfToDocx(files[0]);
        downloadBlob(blob, `${base}.docx`);
        setResult(
          twoColumn
            ? "Editable CV downloaded in your browser — for best CV layout, use a paid account (server LibreOffice)"
            : "Editable Word document downloaded — text and layout rebuilt in your browser"
        );
      }}
      processLabel={status ?? "Convert to Word"}
    >
      <p className="text-sm text-muted">
        CV and resume PDFs are converted with LibreOffice on the server (paid accounts) for
        editable text, photos, and layout. The sidebar background is restored automatically.
        Free accounts use an in-browser fallback.
      </p>
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}
