"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { baseName, downloadPdf, wordToPdf } from "@/lib/pdf";
import { runServerJob, JOB_OUTPUT_EXT } from "@/lib/jobs/client-jobs";
import { downloadBlob } from "@/lib/utils";

export function WordToPdfTool() {
  const { data: session } = useSession();
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <ToolWorkspace
      toolId="word-to-pdf"
      accept=".docx,.doc"
      onProcess={async (files) => {
        setResult(null);
        const base = baseName(files[0].name);

        if (session?.user?.paid) {
          try {
            const blob = await runServerJob(files[0], "word_to_pdf", undefined, setStatus);
            downloadBlob(blob, `${base}.${JOB_OUTPUT_EXT.word_to_pdf}`);
            setStatus(null);
            setResult(
              "PDF downloaded — server conversion with formatting, fonts, colors, and images preserved"
            );
            return;
          } catch {
            setStatus(null);
          }
        }

        const data = await wordToPdf(files[0]);
        downloadPdf(data, `${base}.pdf`);
        setResult(
          "PDF downloaded — basic text conversion (install LibreOffice on the server for full fidelity)"
        );
      }}
      processLabel={status ?? "Convert to PDF"}
    >
      <p className="text-sm text-muted">
        Converts .docx to PDF with full formatting when signed in (LibreOffice on the server).
        Without the server, plain text is extracted into a simple paginated PDF. Legacy
        .doc files must be saved as .docx first.
      </p>
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}
