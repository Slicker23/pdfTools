"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { baseName, pdfToExcel } from "@/lib/pdf";
import { runServerJob, JOB_OUTPUT_EXT } from "@/lib/jobs/client-jobs";
import { downloadBlob } from "@/lib/utils";

export function PdfToExcelTool() {
  const { data: session } = useSession();
  const [result, setResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <ToolWorkspace
      toolId="pdf-to-excel"
      onProcess={async (files) => {
        setResult(null);
        const base = baseName(files[0].name);

        if (session?.user?.paid) {
          try {
            const blob = await runServerJob(files[0], "pdf_to_excel", undefined, setStatus);
            downloadBlob(blob, `${base}.${JOB_OUTPUT_EXT.pdf_to_excel}`);
            setStatus(null);
            setResult("Excel workbook downloaded — converted on server with LibreOffice");
            return;
          } catch {
            setStatus(null);
          }
        }

        const blob = await pdfToExcel(files[0]);
        downloadBlob(blob, `${base}.xlsx`);
        setResult(
          "Excel workbook downloaded — text extracted into editable cells (one sheet per page)"
        );
      }}
      processLabel={status ?? "Convert to Excel"}
    >
      <p className="text-sm text-muted">
        Extracts PDF text into editable Excel cells. Two-column rows become separate columns.
        Each page becomes its own worksheet. Server conversion via LibreOffice is used when
        available; otherwise extraction runs in your browser.
      </p>
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}
