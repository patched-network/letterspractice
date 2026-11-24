import { Point } from "./geometry";

export function moveTo(p: Point): string {
  return `M ${p.x} ${p.y}`;
}

export function lineTo(p: Point | number, y?: number): string {
  if (typeof p === "number") {
    if (y === undefined) {
      throw new Error(`lineTo called incorrectly w/ ${p}, ${y}`);
    }
    return `L ${p} ${y}`;
  }
  return `L ${p.x} ${p.y}`;
}

/**
 * Path data equivalent to SVG `<circle cx cy r>`: starts at (cx + r, cy),
 * runs clockwise (screen, y-down), as the native element does.
 */
export function circlePath(cx: number, cy: number, r: number): string {
  return [
    `M ${cx + r} ${cy}`,
    `A ${r} ${r} 0 1 1 ${cx - r} ${cy}`,
    `A ${r} ${r} 0 1 1 ${cx + r} ${cy}`,
    `Z`,
  ].join(" ");
}

/**
 * Path data equivalent to SVG `<rect x y width height rx>` (ry = rx):
 * starts at (x + rx, y), runs clockwise, as the native element does.
 */
export function rectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  rx = 0,
): string {
  const r = Math.min(rx, width / 2, height / 2);
  if (r <= 0) {
    return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  }
  return [
    `M ${x + r} ${y}`,
    `H ${x + width - r}`,
    `A ${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    `Z`,
  ].join(" ");
}
