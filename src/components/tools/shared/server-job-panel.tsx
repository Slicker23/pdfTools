"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ToolWorkspace } from "@/components/tools/tool-workspace";
import { ResultBanner } from "@/components/tools/shared/tool-ui";
import { baseName } from "@/lib/pdf";
import { downloadBlob } from "@/lib/utils";
import {
  JOB_OUTPUT_EXT,
  runServerJob,
  type ServerJobType,
} from "@/lib/jobs/client-jobs";

interface ServerJobPanelProps {
  toolId: string;
  jobType: ServerJobType;
  accept?: string;
  metadata?: Record<string, unknown>;
  outputFileName?: (inputName: string) => string;
  onSuccess?: (message: string) => void;
  multiple?: boolean;
  /** Build input file from selected files (e.g. ZIP for batch). Default: first file. */
  buildInput?: (files: File[]) => Promise<File>;
  children?: React.ReactNode;
  processLabel?: string;
}

export function ServerJobPanel({
  toolId,
  jobType,
  accept = ".pdf",
  metadata,
  outputFileName,
  onSuccess,
  multiple = false,
  buildInput,
  children,
  processLabel = "Process on server",
}: ServerJobPanelProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  return (
    <ToolWorkspace
      toolId={toolId}
      accept={accept}
      multiple={multiple}
      onProcess={async (files) => {
        setResult(null);
        const input = buildInput ? await buildInput(files) : files[0];
        const blob = await runServerJob(input, jobType, metadata, setStatus);
        const ext = JOB_OUTPUT_EXT[jobType] ?? "bin";
        const name = outputFileName?.(files[0].name) ?? `${baseName(files[0].name)}.${ext}`;
        downloadBlob(blob, name);
        const msg = "Server job complete — file downloaded";
        setResult(msg);
        onSuccess?.(msg);
        setStatus(null);
      }}
      processLabel={status ?? processLabel}
    >
      <div className="space-y-3">
        {children ?? (
          <p className="text-sm text-muted">
            Uploads your file for server-side processing. Files are auto-deleted within 1 hour.
            Fair use: 50 jobs per day.
          </p>
        )}
        {jobId && (
          <p className="flex items-center gap-2 text-sm text-muted">
            Job ID: {jobId}
            {status && <Loader2 className="h-3 w-3 animate-spin" />}
          </p>
        )}
        {result && <ResultBanner message={result} />}
      </div>
    </ToolWorkspace>
  );
}
