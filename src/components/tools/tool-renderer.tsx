"use client";

import type { ToolId } from "@/lib/constants";
import { TOOL_COMPONENTS } from "@/components/tools/tool-registry";

export function ToolRenderer({ tool }: { tool: ToolId }) {
  const Component = TOOL_COMPONENTS[tool];

  if (!Component) {
    return <p className="text-red-600">Tool not found: {tool}</p>;
  }

  return <Component />;
}
