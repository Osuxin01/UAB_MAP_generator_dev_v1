export type ShapeType = "triangle" | "trapezoid" | "diamond" | "large_triangle";

export type GeneratorConfig = {
  fieldWidth: number;
  fieldHeight: number;
  gridSize: number;
  triangleCount: number;
  trapezoidCount: number;
  diamondCount: number;
  largeTriangleCount: number;
  minScore: number;
  maxAttempts: number;
  safetyWeight: number;
  centralAccessWeight: number;
  sideBalanceWeight: number;
  lineOfSightWeight: number;
  densityWeight: number;
  routeWeight: number;
  centralStrengthWeight: number;
  safetyImportance: number;
  centralAccessImportance: number;
  sideBalanceImportance: number;
  lineOfSightImportance: number;
  densityImportance: number;
  routeImportance: number;
  centralStrengthImportance: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Barrier = {
  id: string;
  shape: ShapeType;
  x: number;
  y: number;
  angle: number;
  polygon: Point[];
  seams: [Point, Point][];
};

export type Evaluation = {
  score: number;
  details: Record<string, number>;
};

export type GeneratedMap = {
  name: string;
  field: {
    width: number;
    height: number;
    gridSize: number;
    bottomStart: Point;
    topStart: Point;
  };
  barriers: Barrier[];
  evaluation: Evaluation;
  attempt: number;
  accepted: boolean;
};

const UNIT_SIDE = 0.9;
const SQRT3 = Math.sqrt(3);
const PLACEMENT_GAP = 1.0;

const SHAPE_LABELS: Record<ShapeType, string> = {
  triangle: "三角形",
  trapezoid: "台形",
  diamond: "ひし形",
  large_triangle: "大三角形",
};

export const defaultGeneratorConfig: GeneratorConfig = {
  fieldWidth: 8,
  fieldHeight: 18,
  gridSize: 0.5,
  triangleCount: 4,
  trapezoidCount: 2,
  diamondCount: 2,
  largeTriangleCount: 2,
  minScore: 70,
  maxAttempts: 500,
  safetyWeight: 50,
  centralAccessWeight: 50,
  sideBalanceWeight: 50,
  lineOfSightWeight: 50,
  densityWeight: 50,
  routeWeight: 50,
  centralStrengthWeight: 50,
  safetyImportance: 18,
  centralAccessImportance: 18,
  sideBalanceImportance: 16,
  lineOfSightImportance: 18,
  densityImportance: 12,
  routeImportance: 12,
  centralStrengthImportance: 6,
};

export function validateConfig(config: GeneratorConfig): string | null {
  const counts: [string, number][] = [
    ["三角形", config.triangleCount],
    ["台形", config.trapezoidCount],
    ["ひし形", config.diamondCount],
    ["大三角形", config.largeTriangleCount],
  ];

  for (const [label, count] of counts) {
    if (!Number.isInteger(count) || count < 0) return `${label}の個数は0以上の整数にしてください。`;
    if (count % 2 !== 0) return `点対称を保つため、${label}の個数は偶数にしてください。`;
  }

  if (counts.reduce((total, [, count]) => total + count, 0) <= 0) {
    return "バリケードを1個以上設定してください。";
  }

  if (config.fieldWidth < 4 || config.fieldHeight < 8) return "フィールドサイズが小さすぎます。";
  if (config.gridSize <= 0) return "グリッド間隔は0より大きくしてください。";
  if (config.minScore < 0 || config.minScore > 100) return "採用スコアは0から100の範囲にしてください。";
  if (config.maxAttempts < 1) return "最大試行回数は1以上にしてください。";
  if (scoreImportanceTotal(config) <= 0) return "重要度の合計は0より大きくしてください。";
  return null;
}

export function generateMap(config: GeneratorConfig, index = 1): GeneratedMap {
  const validation = validateConfig(config);
  if (validation) throw new Error(validation);

  const field = {
    width: config.fieldWidth,
    height: config.fieldHeight,
    gridSize: config.gridSize,
    bottomStart: { x: config.fieldWidth / 2, y: 0.5 },
    topStart: { x: config.fieldWidth / 2, y: config.fieldHeight - 0.5 },
  };
  const shapeCounts = getShapeCounts(config);
  const expectedCount = Object.values(shapeCounts).reduce((total, count) => total + count, 0);
  let best: GeneratedMap | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const barriers = placeBarriers(field, shapeCounts);
    const evaluation = evaluateMap(field, barriers, config);
    const candidate: GeneratedMap = {
      name: `UAB自動生成マップ ${String(index).padStart(2, "0")}`,
      field,
      barriers,
      evaluation,
      attempt,
      accepted: barriers.length === expectedCount && evaluation.score >= config.minScore,
    };

    if (!best || betterCandidate(candidate, best, expectedCount)) best = candidate;
    if (candidate.accepted) {
      return candidate;
    }
  }

  if (!best || best.barriers.length !== expectedCount) {
    throw new Error("設定されたバリケードをすべて配置できませんでした。個数を減らすか、最大試行回数を増やしてください。");
  }
  return best;
}

function getShapeCounts(config: GeneratorConfig): Record<ShapeType, number> {
  return {
    triangle: config.triangleCount,
    trapezoid: config.trapezoidCount,
    diamond: config.diamondCount,
    large_triangle: config.largeTriangleCount,
  };
}

function betterCandidate(candidate: GeneratedMap, current: GeneratedMap, expectedCount: number): boolean {
  const candidateHasAll = candidate.barriers.length === expectedCount;
  const currentHasAll = current.barriers.length === expectedCount;
  if (candidateHasAll !== currentHasAll) return candidateHasAll;
  return candidate.evaluation.score > current.evaluation.score;
}

function placeBarriers(
  field: GeneratedMap["field"],
  shapeCounts: Record<ShapeType, number>,
): Barrier[] {
  const pending = shapePairPlan(shapeCounts).sort(() => Math.random() - 0.5);
  const barriers: Barrier[] = [];
  const anchors = tacticalAnchors(field, pending.length);
  const maxPlacementAttempts = Math.max(240, pending.length * 320);

  for (const anchor of anchors) {
    if (!pending.length) return barriers;
    const candidate = createSnappedBarrier(field, pending[0], anchor.x, anchor.y, randomAngle(pending[0]));
    const pair = [candidate, mirrorBarrier(field, candidate)];
    if (isValidPair(field, pair, barriers)) {
      barriers.push(...pair);
      pending.shift();
    }
  }

  for (let attempt = 0; attempt < maxPlacementAttempts && pending.length; attempt += 1) {
    const x = randomBetween(0.75, field.width - 0.75);
    const y = randomBetween(1.5, field.height / 2 - 0.45);
    const candidate = createSnappedBarrier(field, pending[0], x, y, randomAngle(pending[0]));
    const pair = [candidate, mirrorBarrier(field, candidate)];
    if (isValidPair(field, pair, barriers)) {
      barriers.push(...pair);
      pending.shift();
    }
  }

  return barriers;
}

function shapePairPlan(shapeCounts: Record<ShapeType, number>): ShapeType[] {
  return (Object.entries(shapeCounts) as [ShapeType, number][]).flatMap(([shape, count]) =>
    Array.from({ length: count / 2 }, () => shape),
  );
}

function tacticalAnchors(field: GeneratedMap["field"], count: number): Point[] {
  const yLevels = [field.height * 0.18, field.height * 0.28, field.height * 0.38, field.height * 0.46];
  const xPairs = [
    [field.width * 0.28, field.width * 0.72],
    [field.width * 0.38, field.width * 0.62],
  ];
  const points: Point[] = [
    {
      x: field.width * 0.5 + randomBetween(-0.2, 0.2),
      y: field.height * 0.42 + randomBetween(-0.45, 0.15),
    },
  ];

  for (const y of yLevels) {
    const pair = xPairs[Math.floor(Math.random() * xPairs.length)];
    points.push({ x: pair[0] + randomBetween(-0.35, 0.25), y: y + randomBetween(-0.45, 0.45) });
    points.push({ x: pair[1] + randomBetween(-0.25, 0.35), y: y + randomBetween(-0.45, 0.45) });
  }

  return points.sort(() => Math.random() - 0.5).slice(0, Math.max(count, points.length));
}

function createSnappedBarrier(
  field: GeneratedMap["field"],
  shape: ShapeType,
  x: number,
  y: number,
  angle: number,
): Barrier {
  const draft = createBarrier(shape, x, y, angle);
  const vertex = draft.polygon[Math.floor(Math.random() * draft.polygon.length)];
  const grid = nearestGridPoint(field, vertex);
  return createBarrier(shape, x + grid.x - vertex.x, y + grid.y - vertex.y, angle);
}

export function createBarrier(shape: ShapeType, x: number, y: number, angle: number, id: string = crypto.randomUUID()): Barrier {
  const localPolygon = shapePolygon(shape);
  const localSeams = seamLines(shape);
  const polygon = localPolygon.map((point) => translatePoint(rotatePoint(point, angle), x, y));
  const seams = localSeams.map(([a, b]) => [
    translatePoint(rotatePoint(a, angle), x, y),
    translatePoint(rotatePoint(b, angle), x, y),
  ] as [Point, Point]);
  return {
    id,
    shape,
    x,
    y,
    angle,
    polygon,
    seams,
  };
}

export function rebuildBarrier(barrier: Barrier, x: number, y: number, angle: number): Barrier {
  return createBarrier(barrier.shape, x, y, ((angle % 360) + 360) % 360, barrier.id);
}

export function refreshGeneratedMap(map: GeneratedMap, config: GeneratorConfig, barriers = map.barriers): GeneratedMap {
  const evaluation = evaluateMap(map.field, barriers, config);
  return {
    ...map,
    barriers,
    evaluation,
    accepted: barriers.length > 0 && evaluation.score >= config.minScore,
  };
}

function mirrorBarrier(field: GeneratedMap["field"], barrier: Barrier): Barrier {
  return createBarrier(
    barrier.shape,
    field.width - barrier.x,
    field.height - barrier.y,
    (barrier.angle + 180) % 360,
  );
}

function shapePolygon(shape: ShapeType): Point[] {
  const side = UNIT_SIDE;
  const h = (side * SQRT3) / 2;
  if (shape === "triangle") return centerPolygon([{ x: -side / 2, y: -h / 3 }, { x: side / 2, y: -h / 3 }, { x: 0, y: (2 * h) / 3 }]);
  if (shape === "diamond") return centerPolygon([{ x: 0, y: 0 }, { x: side, y: 0 }, { x: side * 1.5, y: h }, { x: side * 0.5, y: h }]);
  if (shape === "trapezoid") return centerPolygon([{ x: 0, y: 0 }, { x: side * 2, y: 0 }, { x: side * 1.5, y: h }, { x: side * 0.5, y: h }]);

  const largeSide = side * 2;
  const largeH = (largeSide * SQRT3) / 2;
  return centerPolygon([
    { x: -largeSide / 2, y: -largeH / 3 },
    { x: largeSide / 2, y: -largeH / 3 },
    { x: 0, y: (2 * largeH) / 3 },
  ]);
}

function seamLines(shape: ShapeType): [Point, Point][] {
  const side = UNIT_SIDE;
  const h = (side * SQRT3) / 2;
  if (shape === "diamond") {
    const base = [{ x: 0, y: 0 }, { x: side, y: 0 }, { x: side * 1.5, y: h }, { x: side * 0.5, y: h }];
    return centerLines([ [{ x: side, y: 0 }, { x: side * 0.5, y: h }] ], base);
  }
  if (shape === "trapezoid") {
    const base = [{ x: 0, y: 0 }, { x: side * 2, y: 0 }, { x: side * 1.5, y: h }, { x: side * 0.5, y: h }];
    return centerLines([
      [{ x: side, y: 0 }, { x: side * 0.5, y: h }],
      [{ x: side, y: 0 }, { x: side * 1.5, y: h }],
    ], base);
  }
  if (shape === "large_triangle") {
    const largeH = (side * 2 * SQRT3) / 2;
    return [
      [{ x: -side / 2, y: -largeH / 3 + h }, { x: side / 2, y: -largeH / 3 + h }],
      [{ x: 0, y: -largeH / 3 }, { x: -side / 2, y: -largeH / 3 + h }],
      [{ x: 0, y: -largeH / 3 }, { x: side / 2, y: -largeH / 3 + h }],
    ];
  }
  return [];
}

function centerPolygon(points: Point[]): Point[] {
  const centroid = polygonCentroid(points);
  return points.map((point) => ({ x: point.x - centroid.x, y: point.y - centroid.y }));
}

function centerLines(lines: [Point, Point][], polygon: Point[]): [Point, Point][] {
  const centroid = polygonCentroid(polygon);
  return lines.map(([a, b]) => [
    { x: a.x - centroid.x, y: a.y - centroid.y },
    { x: b.x - centroid.x, y: b.y - centroid.y },
  ]);
}

function polygonCentroid(points: Point[]): Point {
  let signedArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    signedArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  signedArea *= 0.5;
  return { x: cx / (6 * signedArea), y: cy / (6 * signedArea) };
}

function isValidPair(field: GeneratedMap["field"], pair: Barrier[], existing: Barrier[]): boolean {
  const [first, second] = pair;
  if (polygonsTooClose(first.polygon, second.polygon, PLACEMENT_GAP)) return false;
  return isValidPlacement(field, first, existing) && isValidPlacement(field, second, [...existing, first]);
}

function isValidPlacement(field: GeneratedMap["field"], candidate: Barrier, existing: Barrier[]): boolean {
  if (!polygonInsideField(field, candidate.polygon, 0.05)) return false;
  if (candidate.y < 1.1 || candidate.y > field.height - 1.1) return false;
  if (candidate.polygon.some((point) => distance(point, field.bottomStart) < 0.35 || distance(point, field.topStart) < 0.35)) return false;
  if (pointInPolygon(field.bottomStart, candidate.polygon) || pointInPolygon(field.topStart, candidate.polygon)) return false;
  if (existing.some((barrier) => polygonsTooClose(candidate.polygon, barrier.polygon, PLACEMENT_GAP))) return false;

  return true;
}

function evaluateMap(field: GeneratedMap["field"], barriers: Barrier[], config: GeneratorConfig): Evaluation {
  const centerPoints = sampleArea(
    [
      field.width * 0.12,
      field.width * 0.25,
      field.width * 0.37,
      field.width * 0.5,
      field.width * 0.62,
      field.width * 0.75,
      field.width * 0.87,
    ],
    [field.height * 0.42, field.height * 0.5, field.height * 0.58],
  );
  const bottomCenterOpen = coverVerticesToAreaOpenRatio(field, barriers, centerPoints, false);
  const topCenterOpen = coverVerticesToAreaOpenRatio(field, barriers, centerPoints, true);
  const crossOpen = controlledAreaOpenRatio(field, barriers);
  const weights = normalizedScoreImportance(config);
  const centralOpenTarget = centralAccessTarget(config.centralAccessWeight);
  const startSafety = startSafetyScore(field, barriers, isBlocked(field.bottomStart, field.topStart, barriers), config.safetyWeight);
  const centralAccess = clampScore(
    100 - Math.abs(centralOpenTarget - bottomCenterOpen) * 95 - Math.abs(centralOpenTarget - topCenterOpen) * 95,
  );
  const lineOfSight = lineOfSightScore(crossOpen, config.lineOfSightWeight);
  const sideBalance = sideBalanceScore(field, barriers, config.sideBalanceWeight);
  const density = densityScore(field, barriers, config.densityWeight);
  const route = routeScore(field, barriers, config.routeWeight);
  const center = centralDensityScore(field, barriers, config.centralStrengthWeight);
  const score = Math.round(clampScore(
    startSafety * weights.safety +
      centralAccess * weights.centralAccess +
      sideBalance * weights.sideBalance +
      lineOfSight * weights.lineOfSight +
      density * weights.density +
      route * weights.route +
      center * weights.centralStrength,
  ));

  return {
    score,
    details: {
      ブレイク: Math.round(startSafety * 10) / 10,
      上がりやすさ: Math.round(centralAccess * 10) / 10,
      左右バランス: Math.round(sideBalance * 10) / 10,
      射線制御: Math.round(lineOfSight * 10) / 10,
      バリケ間距離: Math.round(density * 10) / 10,
      到達性: Math.round(route * 10) / 10,
      中央の密度: Math.round(center * 10) / 10,
    },
  };
}

function densityScore(field: GeneratedMap["field"], barriers: Barrier[], densityValue: number): number {
  if (!barriers.length) return 0;
  const spread = distributionScore(field, barriers);
  const band = bandCoverageScore(field, barriers);
  const spacing = spacingScore(barriers, densityValue);
  return clampScore(spacing * 0.6 + spread * 0.25 + band * 0.15);
}

function distributionScore(field: GeneratedMap["field"], barriers: Barrier[]): number {
  const columns = 3;
  const rows = 4;
  const occupied = new Set<string>();
  barriers.forEach((barrier) => {
    const col = Math.min(columns - 1, Math.max(0, Math.floor((barrier.x / field.width) * columns)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((barrier.y / field.height) * rows)));
    occupied.add(`${col},${row}`);
  });
  const targetCells = Math.min(barriers.length, columns * rows);
  return clampScore((occupied.size / targetCells) * 100);
}

function bandCoverageScore(field: GeneratedMap["field"], barriers: Barrier[]): number {
  const yBands: [number, number][] = [
    [field.height * 0.12, field.height * 0.32],
    [field.height * 0.32, field.height * 0.5],
    [field.height * 0.5, field.height * 0.68],
    [field.height * 0.68, field.height * 0.88],
  ];
  const xBands: [number, number][] = [
    [field.width * 0.08, field.width * 0.4],
    [field.width * 0.4, field.width * 0.6],
    [field.width * 0.6, field.width * 0.92],
  ];
  const yHits = yBands.filter(([low, high]) => barriers.some((barrier) => barrier.y >= low && barrier.y <= high)).length;
  const xHits = xBands.filter(([low, high]) => barriers.some((barrier) => barrier.x >= low && barrier.x <= high)).length;
  return clampScore(((yHits / yBands.length) * 0.65 + (xHits / xBands.length) * 0.35) * 100);
}

function spacingScore(barriers: Barrier[], densityValue: number): number {
  if (barriers.length < 2) return 100;
  const target = densitySpacingTarget(densityValue);
  const scores = barriers.map((barrier) => {
    const nearest = Math.min(...barriers
      .filter((other) => other !== barrier)
      .map((other) => polygonDistance(barrier.polygon, other.polygon)));
    return clampScore(100 - Math.abs(nearest - target) * 32);
  });
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function densitySpacingTarget(densityValue: number): number {
  const value = clamp(densityValue, 0, 100);
  return 4.2 - (value / 100) * 3;
}

function centralAccessTarget(value: number): number {
  return 0.25 + (clamp(value, 0, 100) / 100) * 0.5;
}

function lineOfSightScore(crossOpen: number, value: number): number {
  const targetOpen = 0.75 - (clamp(value, 0, 100) / 100) * 0.6;
  return clampScore(100 - Math.abs(crossOpen - targetOpen) * 130);
}

function sideBalanceScore(field: GeneratedMap["field"], barriers: Barrier[], value: number): number {
  if (!barriers.length) return 0;
  const left = barriers.filter((barrier) => barrier.x < field.width / 2).length;
  const right = barriers.length - left;
  const imbalance = Math.abs(left - right) / barriers.length;
  const target = (1 - clamp(value, 0, 100) / 100) * 0.55;
  return clampScore(100 - Math.abs(imbalance - target) * 150);
}

function controlledAreaOpenRatio(field: GeneratedMap["field"], barriers: Barrier[], inset = 1.5): number {
  const judgePoints = insetGridPoints(field, inset);
  const basePoints = insetBoundaryPoints(field, inset);
  const minDistance = Math.max(2, Math.min(field.width, field.height) * 0.35);
  let total = 0;
  let open = 0;

  for (const base of basePoints) {
    for (const target of judgePoints) {
      if (distance(base, target) < minDistance) continue;
      total += 1;
      if (!isBlocked(base, target, barriers)) open += 1;
    }
  }

  return total ? open / total : 0;
}

function insetGridPoints(field: GeneratedMap["field"], inset: number): Point[] {
  const xs = gridAxis(inset, field.width - inset, field.gridSize);
  const ys = gridAxis(inset, field.height - inset, field.gridSize);
  return xs.flatMap((x) => ys.map((y) => ({ x, y })));
}

function insetBoundaryPoints(field: GeneratedMap["field"], inset: number): Point[] {
  const xs = gridAxis(inset, field.width - inset, field.gridSize);
  const ys = gridAxis(inset, field.height - inset, field.gridSize);
  const pointMap = new Map<string, Point>();
  const add = (point: Point) => pointMap.set(`${point.x},${point.y}`, point);
  xs.forEach((x) => {
    add({ x, y: inset });
    add({ x, y: field.height - inset });
  });
  ys.forEach((y) => {
    add({ x: inset, y });
    add({ x: field.width - inset, y });
  });
  return [...pointMap.values()];
}

function gridAxis(start: number, end: number, step: number): number[] {
  const values: number[] = [];
  for (let current = start; current <= end + 1e-9; current += step) {
    values.push(Math.round(current * 1_000_000) / 1_000_000);
  }
  if (values.length && values[values.length - 1] < end - 1e-9) {
    values.push(Math.round(end * 1_000_000) / 1_000_000);
  }
  return values;
}

function coverVerticesToAreaOpenRatio(
  field: GeneratedMap["field"],
  barriers: Barrier[],
  targetPoints: Point[],
  topHalf: boolean,
): number {
  const midY = field.height / 2;
  const sourceBarriers = barriers.filter((barrier) => (
    topHalf ? barrier.y >= midY : barrier.y <= midY
  ));
  let total = 0;
  let open = 0;

  for (const source of sourceBarriers) {
    const blockers = barriers.filter((barrier) => barrier !== source);
    for (const vertex of source.polygon) {
      for (const target of targetPoints) {
        total += 1;
        if (!isBlocked(vertex, target, blockers)) open += 1;
      }
    }
  }

  return total ? open / total : 0;
}

function startSafetyScore(
  field: GeneratedMap["field"],
  barriers: Barrier[],
  startToStartBlocked: boolean,
  safetyValue: number,
): number {
  const quality = startSafetyQuality(field, barriers, startToStartBlocked);
  const target = startSafetyTarget(safetyValue);
  return clampScore(100 - Math.abs(target - quality) * 1.15);
}

function startSafetyQuality(field: GeneratedMap["field"], barriers: Barrier[], startToStartBlocked: boolean): number {
  const directScore = startToStartBlocked ? 100 : 25;
  const firstCoverScore = firstCoverSafetyScore(field, barriers);
  return clampScore(directScore * 0.45 + firstCoverScore * 0.55);
}

function startSafetyTarget(safetyValue: number): number {
  return 35 + (clamp(safetyValue, 0, 100) / 100) * 65;
}

function firstCoverSafetyScore(field: GeneratedMap["field"], barriers: Barrier[]): number {
  const checks: [Point, Point, "left" | "right", boolean][] = [
    [field.bottomStart, field.topStart, "left", false],
    [field.bottomStart, field.topStart, "right", false],
    [field.topStart, field.bottomStart, "left", true],
    [field.topStart, field.bottomStart, "right", true],
  ];
  const scores = checks.map(([ownStart, opponentStart, side, topHalf]) => {
    const target = nearestSideCover(field, barriers, ownStart, side, topHalf);
    if (!target) return 20;

    const otherBarriers = barriers.filter((barrier) => barrier !== target);
    const losScore = isBlocked(opponentStart, target, otherBarriers) ? 100 : 35;
    const distanceScore = firstCoverDistanceScore(ownStart, target);
    return losScore * 0.7 + distanceScore * 0.3;
  });
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function nearestSideCover(
  field: GeneratedMap["field"],
  barriers: Barrier[],
  start: Point,
  side: "left" | "right",
  topHalf: boolean,
): Barrier | null {
  const midX = field.width / 2;
  const midY = field.height / 2;
  const candidates = barriers.filter((barrier) => {
    if (side === "left" && barrier.x >= midX) return false;
    if (side === "right" && barrier.x < midX) return false;
    if (topHalf && barrier.y < midY) return false;
    if (!topHalf && barrier.y > midY) return false;
    return true;
  });

  if (!candidates.length) return null;
  return candidates.reduce((nearest, barrier) => (
    distance(barrier, start) < distance(nearest, start) ? barrier : nearest
  ));
}

function firstCoverDistanceScore(start: Point, cover: Point): number {
  const dist = distance(start, cover);
  if (dist >= 2 && dist <= 5) return 100;
  if (dist < 2) return clampScore(70 + (dist / 2) * 30);
  return clampScore(100 - (dist - 5) * 12);
}

function centralDensityScore(field: GeneratedMap["field"], barriers: Barrier[], centralDensityValue: number): number {
  if (!barriers.length) return 0;
  const actual = centralDensityRatio(field, barriers);
  const target = centralDensityTarget(centralDensityValue);
  return clampScore(100 - Math.abs(actual - target) * 170);
}

function centralDensityRatio(field: GeneratedMap["field"], barriers: Barrier[]): number {
  return barriers.filter((barrier) => isInCentralArea(field, barrier)).length / barriers.length;
}

function centralDensityTarget(value: number): number {
  return 0.05 + (clamp(value, 0, 100) / 100) * 0.55;
}

function isInCentralArea(field: GeneratedMap["field"], barrier: Barrier): boolean {
  return barrier.x >= field.width * 0.25 &&
    barrier.x <= field.width * 0.75 &&
    barrier.y >= field.height * 0.38 &&
    barrier.y <= field.height * 0.62;
}

function routeScore(field: GeneratedMap["field"], barriers: Barrier[], routeValue: number): number {
  if (!barriers.length) return 0;
  const midY = field.height / 2;
  const qualityScores = barriers.map((barrier) => {
    const ownStart = barrier.y >= midY ? field.topStart : field.bottomStart;
    const opponentStart = barrier.y >= midY ? field.bottomStart : field.topStart;
    const blockers = barriers.filter((item) => item !== barrier);
    const pathClear = !blockers.some((blocker) => segmentNearPolygon(ownStart, barrier, blocker.polygon, 0.28));
    const exposure = routeExposureRatio(ownStart, barrier, opponentStart, blockers);
    const pathScore = pathClear ? 100 : 30;
    const exposureScore = clampScore(100 - exposure * 75);
    const distanceScore = reachabilityDistanceScore(distance(ownStart, barrier));
    return pathScore * 0.45 + exposureScore * 0.35 + distanceScore * 0.2;
  });
  const quality = qualityScores.reduce((total, score) => total + score, 0) / qualityScores.length;
  const target = 35 + (clamp(routeValue, 0, 100) / 100) * 65;
  return clampScore(100 - Math.abs(quality - target) * 1.15);
}

function routeExposureRatio(start: Point, end: Point, opponentStart: Point, blockers: Barrier[]): number {
  const samples = [0.25, 0.5, 0.75, 1].map((t) => ({
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  }));
  const open = samples.filter((sample) => !isBlocked(opponentStart, sample, blockers)).length;
  return open / samples.length;
}

function reachabilityDistanceScore(routeDistance: number): number {
  if (routeDistance >= 2 && routeDistance <= 7) return 100;
  if (routeDistance < 2) return clampScore(65 + (routeDistance / 2) * 35);
  return clampScore(100 - (routeDistance - 7) * 10);
}

function scoreImportanceTotal(config: GeneratorConfig): number {
  return Math.max(0, config.safetyImportance) +
    Math.max(0, config.centralAccessImportance) +
    Math.max(0, config.sideBalanceImportance) +
    Math.max(0, config.lineOfSightImportance) +
    Math.max(0, config.densityImportance) +
    Math.max(0, config.routeImportance) +
    Math.max(0, config.centralStrengthImportance);
}

function normalizedScoreImportance(config: GeneratorConfig) {
  const total = scoreImportanceTotal(config);
  return {
    safety: Math.max(0, config.safetyImportance) / total,
    centralAccess: Math.max(0, config.centralAccessImportance) / total,
    sideBalance: Math.max(0, config.sideBalanceImportance) / total,
    lineOfSight: Math.max(0, config.lineOfSightImportance) / total,
    density: Math.max(0, config.densityImportance) / total,
    route: Math.max(0, config.routeImportance) / total,
    centralStrength: Math.max(0, config.centralStrengthImportance) / total,
  };
}

function isBlocked(a: Point, b: Point, barriers: Barrier[]): boolean {
  return barriers.some((barrier) => segmentIntersectsPolygon(a, b, barrier.polygon));
}

function visibleRatio(pointsA: Point[], pointsB: Point[], barriers: Barrier[]): number {
  let total = 0;
  let open = 0;
  for (const a of pointsA) {
    for (const b of pointsB) {
      total += 1;
      if (!isBlocked(a, b, barriers)) open += 1;
    }
  }
  return total ? open / total : 0;
}

function sampleArea(xs: number[], ys: number[]): Point[] {
  return xs.flatMap((x) => ys.map((y) => ({ x, y })));
}

function polygonsTooClose(a: Point[], b: Point[], gap: number): boolean {
  if (polygonsIntersect(a, b)) return true;
  return a.some((point) => distanceToPolygon(point, b) < gap) || b.some((point) => distanceToPolygon(point, a) < gap);
}

function polygonsIntersect(a: Point[], b: Point[]): boolean {
  if (a.some((point) => pointInPolygon(point, b)) || b.some((point) => pointInPolygon(point, a))) return true;
  return polygonEdges(a).some(([a1, a2]) => polygonEdges(b).some(([b1, b2]) => segmentsIntersect(a1, a2, b1, b2)));
}

function segmentIntersectsPolygon(a: Point, b: Point, polygon: Point[]): boolean {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true;
  return polygonEdges(polygon).some(([p1, p2]) => segmentsIntersect(a, b, p1, p2));
}

function segmentNearPolygon(a: Point, b: Point, polygon: Point[], clearance: number): boolean {
  if (segmentIntersectsPolygon(a, b, polygon)) return true;
  return polygonEdges(polygon).some(([p1, p2]) => segmentDistance(a, b, p1, p2) < clearance);
}

function polygonEdges(points: Point[]): [Point, Point][] {
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return false;
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonInsideField(field: GeneratedMap["field"], polygon: Point[], margin: number): boolean {
  return polygon.every(
    (point) => point.x >= margin && point.y >= margin && point.x <= field.width - margin && point.y <= field.height - margin,
  );
}

function nearestGridPoint(field: GeneratedMap["field"], point: Point): Point {
  return {
    x: clamp(Math.round(point.x / field.gridSize) * field.gridSize, 0, field.width),
    y: clamp(Math.round(point.y / field.gridSize) * field.gridSize, 0, field.height),
  };
}

function rotatePoint(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function translatePoint(point: Point, x: number, y: number): Point {
  return { x: point.x + x, y: point.y + y };
}

function polygonArea(points: Point[]): number {
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function distanceToPolygon(point: Point, polygon: Point[]): number {
  return Math.min(...polygonEdges(polygon).map(([a, b]) => pointSegmentDistance(point, a, b)));
}

function pointSegmentDistance(point: Point, a: Point, b: Point): number {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (lengthSquared === 0) return distance(point, a);
  const t = clamp(((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared, 0, 1);
  return distance(point, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function polygonDistance(a: Point[], b: Point[]): number {
  if (polygonsIntersect(a, b)) return 0;
  return Math.min(
    ...a.map((point) => distanceToPolygon(point, b)),
    ...b.map((point) => distanceToPolygon(point, a)),
  );
}

function clampScore(value: number): number {
  return clamp(value, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomAngle(shape: ShapeType): number {
  const angles = shape === "diamond"
    ? [0, 30, 90, 120, 180, 210, 270, 300]
    : [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  return angles[Math.floor(Math.random() * angles.length)];
}

export function getShapeLabel(shape: ShapeType): string {
  return SHAPE_LABELS[shape];
}
