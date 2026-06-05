import type { Barrier, Field, Player, PlayerVisibility, Point, RayHit, RaySegment } from "../types";
import { getBarrierPolygons } from "./barrierShapes";

const EPSILON = 0.00001;

export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function angleBetween(from: Point, to: Point): number {
  return normalizeAngle((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);
}

export function isAngleInView(angle: number, facing: number, viewAngle: number): boolean {
  const diff = Math.abs(((normalizeAngle(angle - facing) + 540) % 360) - 180);
  return diff <= viewAngle / 2;
}

export function getPlayerViewOrigin(player: Player): Point {
  return { x: player.x, y: player.y };
}

function getEdges(points: Point[]): Array<[Point, Point]> {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

function raySegmentIntersection(origin: Point, angle: number, a: Point, b: Point): RayHit | null {
  const direction = { x: Math.cos(degreesToRadians(angle)), y: Math.sin(degreesToRadians(angle)) };
  const segment = { x: b.x - a.x, y: b.y - a.y };
  const denominator = cross(direction, segment);
  if (Math.abs(denominator) < EPSILON) return null;

  const offset = { x: a.x - origin.x, y: a.y - origin.y };
  const t = cross(offset, segment) / denominator;
  const u = cross(offset, direction) / denominator;

  if (t >= 0 && u >= 0 && u <= 1) {
    return {
      point: { x: origin.x + direction.x * t, y: origin.y + direction.y * t },
      distance: t,
    };
  }

  return null;
}

export function getNearestBarrierHit(origin: Point, angle: number, barriers: Barrier[]): RayHit | null {
  let nearest: RayHit | null = null;

  for (const barrier of barriers) {
    for (const polygon of getBarrierPolygons(barrier)) {
      for (const [a, b] of getEdges(polygon)) {
        const hit = raySegmentIntersection(origin, angle, a, b);
        if (hit && (!nearest || hit.distance < nearest.distance)) {
          nearest = { ...hit, barrierId: barrier.id };
        }
      }
    }
  }

  return nearest;
}

export function buildViewRays(player: Player, barriers: Barrier[], sampleCount = 72): RaySegment[] {
  const origin = getPlayerViewOrigin(player);
  const start = player.angle - player.viewAngle / 2;
  const step = player.viewAngle / Math.max(1, sampleCount - 1);
  const candidateAngles = new Set<number>();

  for (let index = 0; index < sampleCount; index += 1) {
    candidateAngles.add(start + step * index);
  }

  for (const barrier of barriers) {
    for (const polygon of getBarrierPolygons(barrier)) {
      for (const point of polygon) {
        const angle = angleBetween(origin, point);
        if (!isAngleInView(angle, player.angle, player.viewAngle)) continue;
        candidateAngles.add(angle - 0.08);
        candidateAngles.add(angle);
        candidateAngles.add(angle + 0.08);
      }
    }
  }

  const angles = [...candidateAngles]
    .filter((angle) => isAngleInView(angle, player.angle, player.viewAngle))
    .sort((a, b) => normalizeAngle(a - start) - normalizeAngle(b - start));

  return angles.map((angle) => {
    const hit = getNearestBarrierHit(origin, angle, barriers);
    const rayLength = hit ? Math.min(hit.distance, player.range) : player.range;
    const end =
      hit && hit.distance <= player.range
        ? hit.point
        : {
            x: origin.x + Math.cos(degreesToRadians(angle)) * rayLength,
            y: origin.y + Math.sin(degreesToRadians(angle)) * rayLength,
          };

    return { origin, end, angle, hit: hit && hit.distance <= player.range ? hit : null };
  });
}

export function isPointVisible(viewer: Player, targetPoint: Point, barriers: Barrier[]): boolean {
  const origin = getPlayerViewOrigin(viewer);
  const targetAngle = angleBetween(origin, targetPoint);
  const targetDistance = distance(origin, targetPoint);

  if (targetDistance > viewer.range || !isAngleInView(targetAngle, viewer.angle, viewer.viewAngle)) {
    return false;
  }

  const hit = getNearestBarrierHit(origin, targetAngle, barriers);
  return !hit || hit.distance + EPSILON >= targetDistance;
}

function targetSamplePoints(player: Player): Point[] {
  return [
    { x: player.x, y: player.y },
    { x: player.x - 0.25, y: player.y },
    { x: player.x + 0.25, y: player.y },
    { x: player.x, y: player.y - 0.25 },
    { x: player.x, y: player.y + 0.25 },
  ];
}

export function getPlayerVisibility(viewer: Player, target: Player, barriers: Barrier[]): PlayerVisibility {
  const points = targetSamplePoints(target);
  const visiblePoints = points.filter((point) => isPointVisible(viewer, point, barriers)).length;
  const state = visiblePoints === 0 ? "Hidden" : visiblePoints === points.length ? "Visible" : "Partial";

  return {
    viewerId: viewer.id,
    targetId: target.id,
    state,
    visiblePoints,
    totalPoints: points.length,
  };
}

export function getAllEnemyVisibility(field: Field): PlayerVisibility[] {
  const enemies = field.players.filter((player) => player.team === "enemy");
  const allies = field.players.filter((player) => player.team === "ally");

  return enemies.flatMap((enemy) =>
    allies.map((ally) => getPlayerVisibility(enemy, ally, field.barriers)),
  );
}

export function getDangerScoreAt(point: Point, field: Field): number {
  return field.players
    .filter((player) => player.team === "enemy")
    .filter((enemy) => isPointVisible(enemy, point, field.barriers)).length;
}
