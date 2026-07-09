/**
 * CFF Type2 charstring interpreter (M6).
 *
 * Decodes Type2 outline charstrings into {@link GlyphOutline} path segments.
 */
import type { GlyphOutline, PathSegment } from "./types";
import type { CffFont } from "./cff";

function readCharstringNumber(data: Uint8Array, pos: number): [number, number] {
  const b0 = data[pos]!;
  if (b0 >= 32 && b0 <= 246) return [b0 - 139, pos + 1];
  if (b0 >= 247 && b0 <= 250) return [(b0 - 247) * 256 + data[pos + 1]! + 108, pos + 2];
  if (b0 >= 251 && b0 <= 254) return [-(b0 - 251) * 256 - data[pos + 1]! - 108, pos + 2];
  if (b0 === 28) return [(data[pos + 1]! << 8) | data[pos + 2]!, pos + 3];
  if (b0 === 29) {
    const v =
      (data[pos + 1]! << 24) |
      (data[pos + 2]! << 16) |
      (data[pos + 3]! << 8) |
      data[pos + 4]!;
    return [v, pos + 5];
  }
  return [0, pos + 1];
}

export function interpretType2Charstring(
  data: Uint8Array,
  subrs: Uint8Array[] = [],
  nominalWidthX = 0
): GlyphOutline {
  const stack: number[] = [];
  const segments: PathSegment[] = [];
  let x = 0;
  let y = 0;
  let widthSet = false;
  let pos = 0;

  const pop = () => stack.pop() ?? 0;
  const push = (n: number) => stack.push(n);

  while (pos < data.length) {
    const op = data[pos]!;
    if (op >= 32 && op <= 255 && op !== 12) {
      const [n, np] = readCharstringNumber(data, pos);
      if (!widthSet && stack.length % 2 === 0) {
        // First number may be width; skip if looks like width operand before path.
        widthSet = true;
      }
      push(n);
      pos = np;
      continue;
    }

    pos++;
    switch (op) {
      case 1: {
        // hstem
        stack.length = 0;
        break;
      }
      case 3: {
        // vstem
        stack.length = 0;
        break;
      }
      case 4: {
        y += pop();
        segments.push({ op: "M", x, y });
        break;
      }
      case 5: {
        while (stack.length >= 2) {
          const dy = pop();
          const dx = pop();
          x += dx;
          y += dy;
          segments.push({ op: "L", x, y });
        }
        break;
      }
      case 6: {
        x += pop();
        segments.push({ op: "L", x, y });
        break;
      }
      case 7: {
        y += pop();
        segments.push({ op: "L", x, y });
        break;
      }
      case 8: {
        while (stack.length >= 6) {
          const y3 = pop();
          const x3 = pop();
          const y2 = pop();
          const x2 = pop();
          const y1 = pop();
          const x1 = pop();
          x += x3;
          y += y3;
          segments.push({
            op: "C",
            x1: x + x1,
            y1: y + y1,
            x2: x + x2,
            y2: y + y2,
            x,
            y,
          });
        }
        break;
      }
      case 10: {
        const subr = pop() + 0; // local subrs not passed here
        if (subr >= 0 && subr < subrs.length) {
          const nested = interpretType2Charstring(subrs[subr]!, subrs, nominalWidthX);
          for (const s of nested.segments) segments.push(s);
        }
        break;
      }
      case 11:
        return { segments };
      case 14:
        segments.push({ op: "Z" });
        break;
      case 18: {
        stack.length = 0;
        break;
      }
      case 19:
      case 20:
        stack.length = 0;
        break;
      case 21: {
        y += pop();
        x += pop();
        segments.push({ op: "L", x, y });
        break;
      }
      case 22: {
        x += pop();
        segments.push({ op: "L", x, y });
        break;
      }
      case 23: {
        stack.length = 0;
        break;
      }
      case 24: {
        const dy = pop();
        const dx = pop();
        const dy1 = pop();
        const dx1 = pop();
        const c1x = x + dx1;
        const c1y = y + dy1;
        x += dx;
        y += dy;
        segments.push({ op: "Q", x1: c1x, y1: c1y, x, y });
        break;
      }
      case 25: {
        const dy = pop();
        const dx = pop();
        x += dx;
        y += dy;
        segments.push({ op: "L", x, y });
        break;
      }
      case 26: {
        const dy = pop();
        const dx = pop();
        const c1x = x + dx;
        const c1y = y;
        x += dx;
        y += dy;
        segments.push({ op: "Q", x1: c1x, y1: c1y, x, y });
        break;
      }
      case 27: {
        const dy = pop();
        const dx = pop();
        const c1x = x;
        const c1y = y + dy;
        x += dx;
        y += dy;
        segments.push({ op: "Q", x1: c1x, y1: c1y, x, y });
        break;
      }
      case 29: {
        const subr = pop() + 0;
        // global subrs handled by caller via extended API
        break;
      }
      case 30: {
        while (stack.length >= 4) {
          const y3 = pop();
          const x3 = pop();
          const y2 = pop();
          const x2 = pop();
          x += x3;
          y += y3;
          segments.push({
            op: "C",
            x1: x + x2,
            y1: y + y2,
            x2: x,
            y2: y,
            x,
            y,
          });
        }
        break;
      }
      case 31: {
        while (stack.length >= 4) {
          const y3 = pop();
          const x3 = pop();
          const y2 = pop();
          const x2 = pop();
          x += x3;
          y += y3;
          segments.push({
            op: "C",
            x1: x,
            y1: y + y2,
            x2: x + x2,
            y2: y + y3,
            x,
            y,
          });
        }
        break;
      }
      case 12: {
        const op2 = data[pos++]!;
        if (op2 === 34 || op2 === 35 || op2 === 36 || op2 === 37) {
          // hvcurveto variants
          while (stack.length >= 4) {
            const d4 = pop();
            const d3 = pop();
            const d2 = pop();
            const d1 = pop();
            if (op2 === 34 || op2 === 36) {
              segments.push({
                op: "C",
                x1: x + d1,
                y1: y,
                x2: x + d1 + d2,
                y2: y + d3,
                x: x + d1 + d2,
                y: y + d3 + d4,
              });
              x += d1 + d2;
              y += d3 + d4;
            } else {
              segments.push({
                op: "C",
                x1: x,
                y1: y + d1,
                x2: x + d2,
                y2: y + d1 + d3,
                x: x + d2 + d4,
                y: y + d1 + d3,
              });
              x += d2 + d4;
              y += d1 + d3;
            }
          }
        } else {
          stack.length = 0;
        }
        break;
      }
      default:
        stack.length = 0;
        break;
    }
  }
  return { segments };
}

export function cffGlyphOutline(cff: CffFont, gid: number): GlyphOutline {
  if (gid < 0 || gid >= cff.charStrings.length) return { segments: [] };
  const cs = cff.charStrings[gid]!;
  return interpretType2Charstring(cs, cff.globalSubrs, cff.nominalWidthX);
}
