"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { UsageGate, UsageBanner } from "@/components/tools/paywall";
import { downloadBlob } from "@/lib/utils";
import { toUserMessage } from "@/lib/pdf";

interface ToolWorkspaceProps {
  toolId: string;
  accept?: string;
  multiple?: boolean;
  minFiles?: number;
  children?: React.ReactNode;
  onFilesChange?: (files: File[]) => void;
  onProcess: (files: File[]) => Promise<void>;
  processLabel?: string;
  requiresAuth?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  afterActions?: React.ReactNode;
}

export function ToolWorkspace({
  toolId,
  accept = ".pdf",
  multiple = false,
  minFiles = 1,
  children,
  onFilesChange,
  onProcess,
  processLabel,
  requiresAuth = true,
  disabled = false,
  disabledReason,
  afterActions,
}: ToolWorkspaceProps) {
  const t = useTranslations("common");
  const { status } = useSession();
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesChange = (next: File[]) => {
    setFiles(next);
    setError(null);
    onFilesChange?.(next);
  };

  const canProcess = files.length >= minFiles && !processing && !disabled;

  const runProcess = async () => {
    setError(null);
    setProcessing(true);
    try {
      await onProcess(files);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setProcessing(false);
    }
  };

  const runProcessWithUsage = async (
    recordUsage: () => Promise<{ allowed: boolean; reason?: string }>
  ) => {
    setError(null);
    setProcessing(true);
    try {
      const usage = await recordUsage();
      if (!usage.allowed) {
        setError(usage.reason ?? "Could not process this document.");
        return;
      }
      await onProcess(files);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setProcessing(false);
    }
  };

  const actionHint =
    disabled && disabledReason
      ? disabledReason
      : status === "unauthenticated" && requiresAuth
        ? "Sign in to download results."
        : null;

  const renderActions = (onClick: () => void) => (
    <>
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      {actionHint && !error && (
        <p className="text-sm text-muted">{actionHint}</p>
      )}
      <Button
        type="button"
        disabled={!canProcess}
        onClick={onClick}
        size="lg"
        className="w-full"
      >
        {processing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("processing")}
          </>
        ) : (
          processLabel ?? t("download")
        )}
      </Button>
    </>
  );

  const body = (
    <div className="space-y-6">
      <UsageBanner />
      <FileDropzone
        accept={accept}
        multiple={multiple}
        files={files}
        onFilesChange={handleFilesChange}
        label={t("dropFiles")}
      />
      {children}
      {renderActions(runProcess)}
      {afterActions}
    </div>
  );

  if (!requiresAuth) return body;

  return (
    <UsageGate toolId={toolId}>
      {({ recordUsage }) => (
        <div className="space-y-6">
          <UsageBanner />
          <FileDropzone
            accept={accept}
            multiple={multiple}
            files={files}
            onFilesChange={handleFilesChange}
            label={t("dropFiles")}
          />
          {children}
          {renderActions(() => runProcessWithUsage(recordUsage))}
          {afterActions}
        </div>
      )}
    </UsageGate>
  );
}

export function downloadPdf(data: Uint8Array, filename: string) {
  downloadBlob(new Blob([new Uint8Array(data)], { type: "application/pdf" }), filename);
}
