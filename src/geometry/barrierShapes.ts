import type { Barrier, BarrierShape, Point } from "../types";

const SMALL_TRIANGLE_SIDE = 1.8;
const SMALL_TRIANGLE_HEIGHT = (Math.sqrt(3) / 2) * SMALL_TRIANGLE_SIDE;
export const BARRIER_OBSTACLE_HEIGHT = 2.5;

export type BarrierShapeSpec = {
  label: string;
  width: number;
  height: number;
};

export const barrierShapeSpecs: Record<BarrierShape, BarrierShapeSpec> = {
  rectangle: {
    label: "矩形",
    width: 1.5,
    height: 1,
  },
  small_triangle: {
    label: "小三角",
    width: SMALL_TRIANGLE_SIDE,
    height: SMALL_TRIANGLE_HEIGHT,
  },
  large_triangle: {
    label: "大三角",
    width: SMALL_TRIANGLE_SIDE * 2,
    height: SMALL_TRIANGLE_HEIGHT * 2,
  },
  diamond: {
    label: "ひし形",
    width: SMALL_TRIANGLE_SIDE,
    height: SMALL_TRIANGLE_HEIGHT * 2,
  },
  trapezoid: {
    label: "台形",
    width: SMALL_TRIANGLE_SIDE * 2,
    height: SMALL_TRIANGLE_HEIGHT,
  },
};

export function createBarrierFromShape(shape: BarrierShape, x: number, y: number): Omit<Barrier, "id"> {
  const spec = barrierShapeSpecs[shape];
  const anchor = { x: Math.round(x), y: Math.round(y) };
  const draft: Barrier = {
    id: "draft",
    shape,
    x: 0,
    y: 0,
    width: spec.width,
    height: spec.height,
    rotation: 0,
    obstacleHeight: BARRIER_OBSTACLE_HEIGHT,
  };
  const anchorOffset = getBarrierAnchorOffset(draft);
  return {
    shape,
    anchorIndex: 0,
    x: Math.max(0, anchor.x - anchorOffset.x),
    y: Math.max(0, anchor.y - anchorOffset.y),
    width: spec.width,
    height: spec.height,
    rotation: 0,
    obstacleHeight: BARRIER_OBSTACLE_HEIGHT,
  };
}

export function getBarrierLocalPolygons(barrier: Barrier): Point[][] {
  const { width, height } = barrier;

  switch (barrier.shape) {
    case "small_triangle":
      return [[
        { x: width / 2, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ]];
    case "large_triangle": {
      const side = width / 2;
      const triangleHeight = height / 2;
      return [
        [
          { x: side, y: 0 },
          { x: side * 1.5, y: triangleHeight },
          { x: side * 0.5, y: triangleHeight },
        ],
        [
          { x: side * 0.5, y: triangleHeight },
          { x: side, y: height },
          { x: 0, y: height },
        ],
        [
          { x: side * 1.5, y: triangleHeight },
          { x: width, y: height },
          { x: side, y: height },
        ],
      ];
    }
    case "diamond":
      return [[
        { x: width / 2, y: 0 },
        { x: width, y: height / 2 },
        { x: width / 2, y: height },
        { x: 0, y: height / 2 },
      ]];
    case "trapezoid":
      return [[
        { x: width * 0.25, y: 0 },
        { x: width * 0.75, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ]];
    case "rectangle":
    default:
      return [[
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ]];
  }
}

export function getBarrierLocalPoints(barrier: Barrier): Point[] {
  return getBarrierLocalPolygons(barrier)[0];
}

function pointKey(point: Point): string {
  return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
}

export function getBarrierAnchorCandidates(barrier: Barrier): Point[] {
  const seen = new Set<string>();
  return getBarrierLocalPolygons(barrier)
    .flat()
    .filter((point) => {
      const key = pointKey(point);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getBarrierAnchorLocalPoint(barrier: Barrier): Point {
  const candidates = getBarrierAnchorCandidates(barrier);
  const index = Math.min(candidates.length - 1, Math.max(0, barrier.anchorIndex ?? 0));
  return candidates[index];
}

function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function getBarrierPolygons(barrier: Barrier): Point[][] {
  const center = { x: barrier.x + barrier.width / 2, y: barrier.y + barrier.height / 2 };
  return getBarrierLocalPolygons(barrier).map((polygon) =>
    polygon
      .map((point) => ({ x: barrier.x + point.x, y: barrier.y + point.y }))
      .map((point) => rotatePoint(point, center, barrier.rotation)),
  );
}

export function getBarrierPolygon(barrier: Barrier): Point[] {
  return getBarrierPolygons(barrier)[0];
}

export function getBarrierAnchorOffset(barrier: Barrier): Point {
  const center = { x: barrier.width / 2, y: barrier.height / 2 };
  return rotatePoint(getBarrierAnchorLocalPoint(barrier), center, barrier.rotation);
}

export function getBarrierAnchorPoint(barrier: Barrier): Point {
  const offset = getBarrierAnchorOffset(barrier);
  return {
    x: barrier.x + offset.x,
    y: barrier.y + offset.y,
  };
}

export function getBarrierAnchorPoints(barrier: Barrier): Point[] {
  const center = { x: barrier.x + barrier.width / 2, y: barrier.y + barrier.height / 2 };
  return getBarrierAnchorCandidates(barrier)
    .map((point) => ({ x: barrier.x + point.x, y: barrier.y + point.y }))
    .map((point) => rotatePoint(point, center, barrier.rotation));
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
