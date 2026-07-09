"use client";

import { useState } from "react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { baseName, downloadPdf, flattenPdf, formatResultSummary } from "@/lib/pdf";

export function FlattenTool() {
  const [result, setResult] = useState<string | null>(null);

  return (
    <ToolWorkspace
      toolId="flatten-pdf"
      onProcess={async (files) => {
        setResult(null);
        const { data, flattenedFields } = await flattenPdf(files[0]);
        downloadPdf(data, `${baseName(files[0].name)}_flattened.pdf`);
        setResult(
          formatResultSummary({ inputSize: files[0].size, outputSize: data.length }) +
            (flattenedFields > 0
              ? ` · flattened ${flattenedFields} form field${flattenedFields !== 1 ? "s" : ""}`
              : " · no form fields found (PDF saved as-is)")
        );
      }}
      processLabel="Flatten PDF"
    >
      <p className="text-sm text-muted">
        Makes interactive form fields non-editable by baking their values into the page content.
        Annotations added in other tools are already flat when exported.
      </p>
      {result && <ResultBanner message={result} />}
    </ToolWorkspace>
  );
}
