"use client";

import type { FC } from "react";
import type { ToolId } from "@/lib/constants";
import { MergeTool } from "@/components/tools/merge/merge-tool";
import { SplitTool } from "@/components/tools/split/split-tool";
import { ExtractTool } from "@/components/tools/extract/extract-tool";
import { RotateTool } from "@/components/tools/rotate/rotate-tool";
import { ReorderTool } from "@/components/tools/reorder/reorder-tool";
import { CompressTool } from "@/components/tools/compress/compress-tool";
import { PdfToJpgTool } from "@/components/tools/convert/pdf-to-jpg-tool";
import { JpgToPdfTool } from "@/components/tools/convert/jpg-to-pdf-tool";
import { PdfToWordTool } from "@/components/tools/convert/pdf-to-word-tool";
import { PdfToExcelTool } from "@/components/tools/convert/pdf-to-excel-tool";
import { PdfToPptTool } from "@/components/tools/convert/pdf-to-ppt-tool";
import { WordToPdfTool } from "@/components/tools/convert/word-to-pdf-tool";
import { AnnotateTool } from "@/components/tools/annotate/annotate-tool";
import { EditTool } from "@/components/tools/edit/edit-tool";
import { WatermarkTool } from "@/components/tools/watermark/watermark-tool";
import { FlattenTool } from "@/components/tools/flatten/flatten-tool";
import { RemoveMetadataTool } from "@/components/tools/remove-metadata/remove-metadata-tool";
import { PageNumbersTool } from "@/components/tools/page-numbers/page-numbers-tool";
import { ExtractImagesTool } from "@/components/tools/extract-images/extract-images-tool";
import { SignTool } from "@/components/tools/sign/sign-tool";
import { FormTool } from "@/components/tools/form/form-tool";
import { CompareTool } from "@/components/tools/compare/compare-tool";
import { BatchTool } from "@/components/tools/batch/batch-tool";
import { PasswordTool } from "@/components/tools/password/password-tool";
import { OcrTool } from "@/components/tools/ocr/ocr-tool";
import { RedactTool } from "@/components/tools/redact/redact-tool";
import { AiChatTool } from "@/components/tools/ai-chat-tool";
import { CollaborateRoom } from "@/components/tools/collaborate-room";

function CollaborateTool() {
  return <CollaborateRoom roomId="demo-room" />;
}

export const TOOL_COMPONENTS: Record<ToolId, FC> = {
  "merge-pdf": MergeTool,
  "split-pdf": SplitTool,
  "extract-pdf": ExtractTool,
  "rotate-pdf": RotateTool,
  "reorder-pdf": ReorderTool,
  "compress-pdf": CompressTool,
  "pdf-to-jpg": PdfToJpgTool,
  "jpg-to-pdf": JpgToPdfTool,
  "annotate-pdf": AnnotateTool,
  "edit-pdf": EditTool,
  "pdf-to-word": PdfToWordTool,
  "pdf-to-excel": PdfToExcelTool,
  "pdf-to-ppt": PdfToPptTool,
  "word-to-pdf": WordToPdfTool,
  "ocr-pdf": OcrTool,
  "form-pdf": FormTool,
  "sign-pdf": SignTool,
  "watermark-pdf": WatermarkTool,
  "compare-pdf": CompareTool,
  "extract-images": ExtractImagesTool,
  "page-numbers": PageNumbersTool,
  "flatten-pdf": FlattenTool,
  "remove-metadata": RemoveMetadataTool,
  "password-protect": PasswordTool,
  "batch-process": BatchTool,
  "chat-pdf": AiChatTool,
  "template-pdf": () => <AiChatTool mode="template" />,
  "redact-pdf": RedactTool,
  collaborate: CollaborateTool,
};
