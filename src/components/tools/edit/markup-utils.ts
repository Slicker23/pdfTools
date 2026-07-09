import type { PageViewport } from "pdfjs-dist";
import type { EditObject } from "@/lib/pdf";
import type { ScreenBox } from "./object-view";

export function screenPointToPdf(
  viewport: PageViewport,
  sx: number,
  sy: number
): { px: number; py: number } {
  const [px, py] = viewport.convertToPdfPoint(sx, sy) as [number, number];
  return { px, py };
}

export function screenBoxToPdfBBox(viewport: PageViewport, box: ScreenBox) {
  const [px1, py1] = viewport.convertToPdfPoint(box.left, box.top + box.height) as [
    number,
    number,
  ];
  const [px2, py2] = viewport.convertToPdfPoint(box.left + box.width, box.top) as [
    number,
    number,
  ];
  return {
    px: Math.min(px1, px2),
    py: Math.min(py1, py2),
    pw: Math.max(Math.abs(px2 - px1), 0.5),
    ph: Math.max(Math.abs(py2 - py1), 0.5),
  };
}

export function pdfBBoxFromScreenDrag(
  viewport: PageViewport,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  return screenBoxToPdfBBox(viewport, {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  });
}

export function brushPointsToScreenString(
  viewport: PageViewport,
  box: ScreenBox,
  points: { x: number; y: number }[]
): string {
  return points
    .map((p) => {
      const [sx, sy] = viewport.convertToViewportPoint(p.x, p.y) as [number, number];
      return `${sx - box.left},${sy - box.top}`;
    })
    .join(" ");
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hitTestEditObject(
  objects: EditObject[],
  page: number,
  px: number,
  py: number,
  threshold = 6
): EditObject | null {
  const pageObjs = objects.filter((o) => o.page === page);
  for (let i = pageObjs.length - 1; i >= 0; i--) {
    const obj = pageObjs[i];
    if (obj.type === "brush") {
      for (let j = 1; j < obj.points.length; j++) {
        const a = obj.points[j - 1];
        const b = obj.points[j];
        if (distToSegment(px, py, a.x, a.y, b.x, b.y) <= threshold + obj.strokeWidth / 2) {
          return obj;
        }
      }
      continue;
    }
    if (px >= obj.px && px <= obj.px + obj.pw && py >= obj.py && py <= obj.py + obj.ph) {
      return obj;
    }
  }
  return null;
}

export function brushBoundsFromPoints(
  points: { x: number; y: number }[],
  strokeWidth: number
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = strokeWidth / 2 + 1;
  return {
    px: minX - pad,
    py: minY - pad,
    pw: Math.max(maxX - minX + pad * 2, 1),
    ph: Math.max(maxY - minY + pad * 2, 1),
  };
}
