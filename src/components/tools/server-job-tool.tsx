"use client";

import { ServerJobPanel } from "@/components/tools/shared/server-job-panel";
import type { ServerJobType } from "@/lib/jobs/client-jobs";

interface ServerJobToolProps {
  toolId: string;
  jobType: ServerJobType;
  accept?: string;
}

/** @deprecated Use ServerJobPanel from shared/server-job-panel.tsx */
export function ServerJobTool({ toolId, jobType, accept }: ServerJobToolProps) {
  return <ServerJobPanel toolId={toolId} jobType={jobType} accept={accept} />;
}
