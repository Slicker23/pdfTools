import { describe, expect, it } from "vitest";
import type { PdfEditBlockPatch } from "@/lib/pdf/edit-model";
import {
  canNativeFlatten,
  canNativeFontSwap,
  canNativeInPlace,
  canNativeMove,
  isOverlayBlock,
  predictBlockApply,
} from "../../src/lib/pdf-engine/plan";

const baseBlock = (): PdfEditBlockPatch => ({
  id: "p1:s4:o10",
  page: 1,
  text: "Hello",
  modified: true,
  locator: "p1:s4:o10",
  bbox: { px: 50, py: 700, pw: 40, ph: 12 },
  font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111111" },
  encodableChars: "Hello Hi",
});

const original = {
  text: "Hello",
  font: { name: "Helvetica", size: 12, bold: false, italic: false, color: "#111111" },
  bbox: { px: 50, py: 700, pw: 40, ph: 12 },
  baselineY: 700,
};

describe("predictBlockApply", () => {
  it("routes flatten blocks to native-flatten", () => {
    const block = { ...baseBlock(), flattenToPath: true, supportsOutlines: true };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("native-flatten");
    expect(plan.overlay).toBe(false);
    expect(plan.reason).toBe("outlined");
  });

  it("routes position-only move to native-move", () => {
    const block = {
      ...baseBlock(),
      bbox: { px: 100, py: 700, pw: 40, ph: 12 },
      originalBbox: { px: 50, py: 700, pw: 40, ph: 12 },
    };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("native-move");
    expect(plan.overlay).toBe(false);
  });

  it("routes size-only change to overlay", () => {
    const block = {
      ...baseBlock(),
      font: { ...baseBlock().font!, size: 18 },
    };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("overlay");
    expect(plan.overlay).toBe(true);
    expect(plan.reason).toBe("style");
  });

  it("routes color-only change to overlay", () => {
    const block = {
      ...baseBlock(),
      font: { ...baseBlock().font!, color: "#ff0000" },
    };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("overlay");
    expect(plan.overlay).toBe(true);
    expect(plan.reason).toBe("style");
  });

  it("routes bold-only style change to native-in-place when encodable", () => {
    const block = {
      ...baseBlock(),
      font: { ...baseBlock().font!, bold: true },
    };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("native-in-place");
    expect(plan.overlay).toBe(false);
  });

  it("routes font family change to overlay when page cannot supply target font", () => {
    const block = {
      ...baseBlock(),
      font: { ...baseBlock().font!, name: "Times-Roman" },
    };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("overlay");
    expect(plan.overlay).toBe(true);
    expect(plan.reason).toBe("style");
  });

  it("routes bold change to overlay", () => {
    const block = { ...baseBlock(), text: "Hello Ω" };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("overlay");
    expect(plan.reason).toBe("unencodable");
  });

  it("routes merged multi-segment blocks to overlay", () => {
    const block = {
      ...baseBlock(),
      segments: [
        {
          locator: "p1:s4:o10",
          text: "T",
          bbox: { px: 50, py: 700, pw: 8, ph: 12 },
        },
        {
          locator: "p1:s4:o40",
          text: "ransport",
          bbox: { px: 58, py: 700, pw: 40, ph: 12 },
        },
      ],
    };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("overlay");
    expect(plan.overlay).toBe(true);
    expect(isOverlayBlock(block)).toBe(true);
    expect(canNativeInPlace(block)).toBe(false);
  });

  it("routes in-place text edit to native-in-place", () => {
    const block = { ...baseBlock(), text: "Hi" };
    const plan = predictBlockApply(block, original);
    expect(plan.strategy).toBe("native-in-place");
    expect(plan.overlay).toBe(false);
  });

  it("canNative* helpers align with plan", () => {
    const boldOnly = {
      ...baseBlock(),
      font: { ...baseBlock().font!, bold: true },
    };
    expect(canNativeFontSwap(boldOnly, original)).toBe(true);

    const moved = {
      ...baseBlock(),
      bbox: { px: 80, py: 700, pw: 40, ph: 12 },
      originalBbox: { px: 50, py: 700, pw: 40, ph: 12 },
    };
    expect(canNativeMove(moved)).toBe(true);
    expect(canNativeInPlace(moved)).toBe(false);

    const flat = { ...baseBlock(), flattenToPath: true };
    expect(canNativeFlatten(flat)).toBe(true);
    expect(canNativeMove(flat)).toBe(false);
  });
});
