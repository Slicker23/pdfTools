/**
 * Client helpers for edit preview — re-exports engine apply planner (M6 UX).
 */
export type {
  ApplyPlan,
  ApplyStrategy,
  BlockOriginalSnapshot,
  OverlayReason,
} from "@/lib/pdf-engine/plan";
export {
  bboxDiffers,
  predictBlockApply,
  willRemoveOnDownload,
  willUseOverlay,
} from "@/lib/pdf-engine/plan";
