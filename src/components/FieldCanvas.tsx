import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  getBarrierAnchorOffset,
  getBarrierAnchorPoint,
  getBarrierAnchorPoints,
  getBarrierPolygons,
  pointInPolygon,
} from "../geometry/barrierShapes";
import {
  buildViewRays,
  getAllEnemyVisibility,
  getDangerScoreAt,
  getPlayerViewOrigin,
} from "../geometry/lineOfSight";
import { useAppStore } from "../store/useAppStore";
import type { Barrier, BarrierShape, Player, Point, ToolMode } from "../types";

const CANVAS_PADDING_X = 18;
const CANVAS_PADDING_TOP = 18;
const CANVAS_PADDING_BOTTOM = 34;

type CanvasMetrics = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

function getMetrics(canvas: HTMLCanvasElement, fieldWidth: number, fieldHeight: number): CanvasMetrics {
  const scale = Math.min(
    (canvas.width - CANVAS_PADDING_X * 2) / fieldWidth,
    (canvas.height - CANVAS_PADDING_TOP - CANVAS_PADDING_BOTTOM) / fieldHeight,
  );
  const availableHeight = canvas.height - CANVAS_PADDING_TOP - CANVAS_PADDING_BOTTOM;
  return {
    scale,
    offsetX: (canvas.width - fieldWidth * scale) / 2,
    offsetY: CANVAS_PADDING_TOP + (availableHeight - fieldHeight * scale) / 2,
  };
}

function worldToCanvas(point: Point, metrics: CanvasMetrics): Point {
  return {
    x: metrics.offsetX + point.x * metrics.scale,
    y: metrics.offsetY + point.y * metrics.scale,
  };
}

function canvasToWorld(point: Point, metrics: CanvasMetrics): Point {
  return {
    x: (point.x - metrics.offsetX) / metrics.scale,
    y: (point.y - metrics.offsetY) / metrics.scale,
  };
}

function drawPolygon(ctx: CanvasRenderingContext2D, points: Point[], metrics: CanvasMetrics): void {
  points.forEach((point, index) => {
    const canvasPoint = worldToCanvas(point, metrics);
    if (index === 0) ctx.moveTo(canvasPoint.x, canvasPoint.y);
    else ctx.lineTo(canvasPoint.x, canvasPoint.y);
  });
  ctx.closePath();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  fieldWidth: number,
  fieldHeight: number,
  metrics: CanvasMetrics,
  gridSize: number,
): void {
  ctx.strokeStyle = "#d6dde2";
  ctx.lineWidth = 1;

  for (let x = 0; x <= fieldWidth; x += gridSize) {
    const canvasX = metrics.offsetX + x * metrics.scale;
    ctx.beginPath();
    ctx.moveTo(canvasX, metrics.offsetY);
    ctx.lineTo(canvasX, metrics.offsetY + fieldHeight * metrics.scale);
    ctx.stroke();
  }

  for (let y = 0; y <= fieldHeight; y += gridSize) {
    const canvasY = metrics.offsetY + y * metrics.scale;
    ctx.beginPath();
    ctx.moveTo(metrics.offsetX, canvasY);
    ctx.lineTo(metrics.offsetX + fieldWidth * metrics.scale, canvasY);
    ctx.stroke();
  }
}

function drawStartAreas(
  ctx: CanvasRenderingContext2D,
  fieldWidth: number,
  fieldHeight: number,
  metrics: CanvasMetrics,
): void {
  const startWidth = 4;
  const startHeight = 2;
  const startX = (fieldWidth - startWidth) / 2;
  const markerRadius = 0.36 * metrics.scale;
  const areas = [
    { x: startX, y: 0, marker: { x: fieldWidth / 2, y: 0 } },
    { x: startX, y: fieldHeight - startHeight, marker: { x: fieldWidth / 2, y: fieldHeight } },
  ];

  areas.forEach((area) => {
    const topLeft = worldToCanvas({ x: area.x, y: area.y }, metrics);
    ctx.strokeStyle = "#9ba5aa";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(topLeft.x, topLeft.y, startWidth * metrics.scale, startHeight * metrics.scale);

    const marker = worldToCanvas(area.marker, metrics);
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, markerRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#f01828";
    ctx.fill();
    ctx.strokeStyle = "#527492";
    ctx.lineWidth = 0.13 * metrics.scale;
    ctx.stroke();
  });
}

function drawBarrier(ctx: CanvasRenderingContext2D, barrier: Barrier, metrics: CanvasMetrics, isSelected: boolean): void {
  getBarrierPolygons(barrier).forEach((polygon) => {
    ctx.beginPath();
    drawPolygon(ctx, polygon, metrics);
    ctx.fillStyle = isSelected ? "#314457" : "#405568";
    ctx.fill();
    ctx.strokeStyle = isSelected ? "#f2b84b" : "#20303d";
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.stroke();
  });

  if (isSelected) {
    const anchors = getBarrierAnchorPoints(barrier);
    anchors.forEach((candidate, index) => {
      const point = worldToCanvas(candidate, metrics);
      ctx.beginPath();
      ctx.arc(point.x, point.y, index === (barrier.anchorIndex ?? 0) ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = index === (barrier.anchorIndex ?? 0) ? "#f2b84b" : "#f8fafc";
      ctx.fill();
      ctx.strokeStyle = "#20303d";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, metrics: CanvasMetrics, isSelected: boolean): void {
  const point = worldToCanvas(player, metrics);
  const radius = 0.28 * metrics.scale;
  const angle = (player.angle * Math.PI) / 180;

  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = player.team === "ally" ? "#2c8f7b" : "#c84e4e";
  ctx.fill();
  ctx.strokeStyle = isSelected ? "#f2b84b" : "#f8fafc";
  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(point.x + Math.cos(angle) * radius * 2, point.y + Math.sin(angle) * radius * 2);
  ctx.strokeStyle = "#12202b";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#10202b";
  ctx.font = "12px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(player.name, point.x, point.y - radius - 8);
}

function drawLineOfSight(ctx: CanvasRenderingContext2D, player: Player, barriers: Barrier[], metrics: CanvasMetrics): void {
  const rays = buildViewRays(player, barriers, 96);
  const origin = worldToCanvas(getPlayerViewOrigin(player), metrics);

  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  rays.forEach((ray) => {
    const end = worldToCanvas(ray.end, metrics);
    ctx.lineTo(end.x, end.y);
  });
  ctx.closePath();
  ctx.fillStyle = player.team === "ally" ? "rgba(44, 143, 123, 0.13)" : "rgba(200, 78, 78, 0.11)";
  ctx.fill();

  ctx.strokeStyle = player.team === "ally" ? "rgba(44, 143, 123, 0.42)" : "rgba(200, 78, 78, 0.38)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function findObjectAt(point: Point, barriers: Barrier[], players: Player[]): string | null {
  const player = [...players]
    .reverse()
    .find((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= 0.38);
  if (player) return player.id;

  const barrier = [...barriers]
    .reverse()
    .find((candidate) => getBarrierPolygons(candidate).some((polygon) => pointInPolygon(point, polygon)));
  return barrier?.id ?? null;
}

const barrierShapeByTool: Partial<Record<ToolMode, BarrierShape>> = {
  add_barrier: "rectangle",
  add_small_triangle: "small_triangle",
  add_large_triangle: "large_triangle",
  add_diamond: "diamond",
  add_trapezoid: "trapezoid",
};

function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function getBarrierAnchor(barrier: Barrier): Point {
  return getBarrierAnchorPoint(barrier);
}

function getBarrierPositionFromAnchor(barrier: Barrier, anchor: Point, fieldWidth: number, fieldHeight: number): Point {
  const anchorOffset = getBarrierAnchorOffset(barrier);
  return {
    x: Math.min(fieldWidth - barrier.width, Math.max(0, anchor.x - anchorOffset.x)),
    y: Math.min(fieldHeight - barrier.height, Math.max(0, anchor.y - anchorOffset.y)),
  };
}

function getSnappedBarrierPosition(
  barrier: Barrier,
  anchor: Point,
  fieldWidth: number,
  fieldHeight: number,
  step: number,
): Point {
  const anchorOffset = getBarrierAnchorOffset(barrier);
  const snappedAnchor = {
    x: Math.min(fieldWidth - barrier.width + anchorOffset.x, Math.max(anchorOffset.x, snapToStep(anchor.x, step))),
    y: Math.min(fieldHeight - barrier.height + anchorOffset.y, Math.max(anchorOffset.y, snapToStep(anchor.y, step))),
  };
  return getBarrierPositionFromAnchor(barrier, snappedAnchor, fieldWidth, fieldHeight);
}

export function FieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragOffset, setDragOffset] = useState<Point | null>(null);
  const discreteKeysRef = useRef<Set<string>>(new Set());
  const pendingDiscreteKeysRef = useRef<Set<string>>(new Set());
  const smoothKeysRef = useRef<Set<string>>(new Set());
  const shiftPressedRef = useRef(false);
  const discreteTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const {
    scenario,
    selectedObjectId,
    toolMode,
    showHeatmap,
    showLineOfSight,
    addBarrier,
    addPlayer,
    setSelectedObjectId,
    updateBarrier,
    updatePlayer,
  } = useAppStore();

  const field = scenario.field;
  const visibility = useMemo(() => getAllEnemyVisibility(field), [field]);

  useEffect(() => {
    const movementByKey: Record<string, Point> = {
      arrowup: { x: 0, y: 1 },
      w: { x: 0, y: 1 },
      arrowdown: { x: 0, y: -1 },
      s: { x: 0, y: -1 },
      arrowleft: { x: -1, y: 0 },
      a: { x: -1, y: 0 },
      arrowright: { x: 1, y: 0 },
      d: { x: 1, y: 0 },
    };

    function isEditingText(): boolean {
      const activeElement = document.activeElement;
      return (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      );
    }

    function stopSmoothMovement() {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      lastFrameTimeRef.current = null;
    }

    function stopDiscreteMovement() {
      if (discreteTimerRef.current !== null) {
        window.clearTimeout(discreteTimerRef.current);
      }
      discreteTimerRef.current = null;
    }

    function moveSelectedPlayer(delta: Point) {
      const state = useAppStore.getState();
      const currentField = state.scenario.field;
      const selectedPlayer = currentField.players.find((player) => player.id === state.selectedObjectId);
      if (!selectedPlayer) return;

      state.updatePlayer(selectedPlayer.id, {
        x: Math.min(currentField.width, Math.max(0, selectedPlayer.x + delta.x)),
        y: Math.min(currentField.height, Math.max(0, selectedPlayer.y + delta.y)),
      });
    }

    function moveSelectedBarrier(delta: Point) {
      const state = useAppStore.getState();
      const currentField = state.scenario.field;
      const selectedBarrier = currentField.barriers.find((barrier) => barrier.id === state.selectedObjectId);
      if (!selectedBarrier) return;
      const currentAnchor = getBarrierAnchor(selectedBarrier);
      const step = shiftPressedRef.current ? 0.5 : currentField.gridSize;
      const snappedAnchor = {
        x: snapToStep(currentAnchor.x, step) + delta.x,
        y: snapToStep(currentAnchor.y, step) + delta.y,
      };
      const position = getSnappedBarrierPosition(
        selectedBarrier,
        snappedAnchor,
        currentField.width,
        currentField.height,
        step,
      );

      state.updateBarrier(selectedBarrier.id, {
        x: position.x,
        y: position.y,
      });
    }

    function isBarrierSelected(): boolean {
      const state = useAppStore.getState();
      return state.scenario.field.barriers.some((barrier) => barrier.id === state.selectedObjectId);
    }

    function toScreenRelativeDelta(localVector: Point, distance: number): Point {
      const length = Math.hypot(localVector.x, localVector.y);
      if (length === 0) return { x: 0, y: 0 };

      const strafe = localVector.x / length;
      const forward = localVector.y / length;
      const forwardVector = { x: 0, y: -1 };
      const rightVector = { x: 1, y: 0 };

      return {
        x: (forwardVector.x * forward + rightVector.x * strafe) * distance,
        y: (forwardVector.y * forward + rightVector.y * strafe) * distance,
      };
    }

    function getMovementVector(keys: Set<string>): Point {
      let vector = { x: 0, y: 0 };
      keys.forEach((key) => {
        const movement = movementByKey[key];
        if (!movement) return;
        vector = { x: vector.x + movement.x, y: vector.y + movement.y };
      });
      return {
        x: Math.max(-1, Math.min(1, vector.x)),
        y: Math.max(-1, Math.min(1, vector.y)),
      };
    }

    function scheduleDiscreteMovement() {
      if (discreteTimerRef.current !== null) return;

      discreteTimerRef.current = window.setTimeout(() => {
        discreteTimerRef.current = null;
        const vector = getMovementVector(pendingDiscreteKeysRef.current);
        pendingDiscreteKeysRef.current.clear();
        if (vector.x === 0 && vector.y === 0) return;

        const state = useAppStore.getState();
        const step = isBarrierSelected() && shiftPressedRef.current ? 0.5 : state.scenario.field.gridSize;
        const delta = toScreenRelativeDelta(vector, step);

        if (isBarrierSelected()) {
          moveSelectedBarrier(delta);
          return;
        }

        moveSelectedPlayer(delta);
      }, 35);
    }

    function tickSmoothMovement(timestamp: number) {
      if (!shiftPressedRef.current || smoothKeysRef.current.size === 0) {
        stopSmoothMovement();
        return;
      }

      const previousTimestamp = lastFrameTimeRef.current ?? timestamp;
      const deltaSeconds = Math.min(0.05, (timestamp - previousTimestamp) / 1000);
      lastFrameTimeRef.current = timestamp;

      let vector = { x: 0, y: 0 };
      vector = getMovementVector(smoothKeysRef.current);

      const length = Math.hypot(vector.x, vector.y);
      if (length > 0) {
        const speed = 5;
        moveSelectedPlayer(toScreenRelativeDelta(vector, speed * deltaSeconds));
      }

      animationFrameRef.current = requestAnimationFrame(tickSmoothMovement);
    }

    function startSmoothMovement() {
      if (animationFrameRef.current !== null) return;
      animationFrameRef.current = requestAnimationFrame(tickSmoothMovement);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditingText()) return;

      const key = event.key.toLowerCase();
      if (key === "delete" || key === "backspace") {
        const state = useAppStore.getState();
        if (!state.selectedObjectId) return;
        event.preventDefault();
        state.deleteObject(state.selectedObjectId);
        return;
      }

      if (key === "shift") {
        shiftPressedRef.current = true;
        if (isBarrierSelected()) return;
        smoothKeysRef.current = new Set(discreteKeysRef.current);
        startSmoothMovement();
        return;
      }

      const movement = movementByKey[key];
      if (!movement) return;

      event.preventDefault();

      if (isBarrierSelected()) {
        shiftPressedRef.current = event.shiftKey || shiftPressedRef.current;
        discreteKeysRef.current.add(key);
        discreteKeysRef.current.forEach((pressedKey) => pendingDiscreteKeysRef.current.add(pressedKey));
        pendingDiscreteKeysRef.current.add(key);
        scheduleDiscreteMovement();
        return;
      }

      if (event.shiftKey || shiftPressedRef.current) {
        shiftPressedRef.current = true;
        smoothKeysRef.current.add(key);
        startSmoothMovement();
        return;
      }

      if (!event.repeat) {
        discreteKeysRef.current.add(key);
        discreteKeysRef.current.forEach((pressedKey) => pendingDiscreteKeysRef.current.add(pressedKey));
        pendingDiscreteKeysRef.current.add(key);
        scheduleDiscreteMovement();
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if (key === "shift") {
        shiftPressedRef.current = false;
        smoothKeysRef.current.clear();
        stopSmoothMovement();
        return;
      }

      if (movementByKey[key]) {
        discreteKeysRef.current.delete(key);
        smoothKeysRef.current.delete(key);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      stopDiscreteMovement();
      stopSmoothMovement();
      discreteKeysRef.current.clear();
      pendingDiscreteKeysRef.current.clear();
      smoothKeysRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const logicalCanvas = { width: rect.width, height: rect.height } as HTMLCanvasElement;
    const metrics = getMetrics(logicalCanvas, field.width, field.height);

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#eef3f5";
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "#f9fbfc";
    ctx.fillRect(metrics.offsetX, metrics.offsetY, field.width * metrics.scale, field.height * metrics.scale);
    drawGrid(ctx, field.width, field.height, metrics, field.gridSize);

    if (showHeatmap) {
      for (let x = 0; x < field.width; x += field.gridSize) {
        for (let y = 0; y < field.height; y += field.gridSize) {
          const score = getDangerScoreAt({ x: x + field.gridSize / 2, y: y + field.gridSize / 2 }, field);
          if (score === 0) continue;
          const cell = worldToCanvas({ x, y }, metrics);
          ctx.fillStyle = score === 1 ? "rgba(237, 191, 67, 0.32)" : "rgba(204, 66, 66, 0.36)";
          ctx.fillRect(cell.x, cell.y, field.gridSize * metrics.scale, field.gridSize * metrics.scale);
        }
      }
    }

    if (showLineOfSight) {
      field.players.forEach((player) => drawLineOfSight(ctx, player, field.barriers, metrics));
    }

    drawStartAreas(ctx, field.width, field.height, metrics);
    field.barriers.forEach((barrier) => drawBarrier(ctx, barrier, metrics, barrier.id === selectedObjectId));
    field.players.forEach((player) => drawPlayer(ctx, player, metrics, player.id === selectedObjectId));

    visibility.forEach((result) => {
      const target = field.players.find((player) => player.id === result.targetId);
      if (!target || result.state === "Hidden") return;
      const canvasPoint = worldToCanvas(target, metrics);
      ctx.beginPath();
      ctx.arc(canvasPoint.x, canvasPoint.y, 0.48 * metrics.scale, 0, Math.PI * 2);
      ctx.strokeStyle = result.state === "Visible" ? "#d33d3d" : "#edbf43";
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }, [field, selectedObjectId, showHeatmap, showLineOfSight, visibility]);

  function getWorldFromEvent(event: PointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const metrics = getMetrics(rect as unknown as HTMLCanvasElement, field.width, field.height);
    const point = canvasToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, metrics);

    if (point.x < 0 || point.y < 0 || point.x > field.width || point.y > field.height) {
      return null;
    }
    return point;
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = getWorldFromEvent(event);
    if (!point) return;

    const barrierShape = barrierShapeByTool[toolMode];
    if (barrierShape) {
      addBarrier(point.x, point.y, barrierShape);
      return;
    }
    if (toolMode === "add_ally" || toolMode === "add_enemy") {
      addPlayer(toolMode === "add_ally" ? "ally" : "enemy", point.x, point.y);
      return;
    }

    const id = findObjectAt(point, field.barriers, field.players);
    setSelectedObjectId(id);
    if (!id) return;

    const player = field.players.find((candidate) => candidate.id === id);
    if (player) {
      setDragOffset({ x: point.x - player.x, y: point.y - player.y });
      return;
    }

    const barrier = field.barriers.find((candidate) => candidate.id === id);
    if (barrier) {
      const anchor = getBarrierAnchor(barrier);
      setDragOffset({ x: point.x - anchor.x, y: point.y - anchor.y });
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!dragOffset || !selectedObjectId) return;
    const point = getWorldFromEvent(event);
    if (!point) return;

    const player = field.players.find((candidate) => candidate.id === selectedObjectId);
    if (player) {
      updatePlayer(player.id, {
        x: Math.min(field.width, Math.max(0, point.x - dragOffset.x)),
        y: Math.min(field.height, Math.max(0, point.y - dragOffset.y)),
      });
      return;
    }

    const barrier = field.barriers.find((candidate) => candidate.id === selectedObjectId);
    if (barrier) {
      const position = getSnappedBarrierPosition(
        barrier,
        { x: point.x - dragOffset.x, y: point.y - dragOffset.y },
        field.width,
        field.height,
        field.gridSize,
      );
      updateBarrier(barrier.id, position);
    }
  }

  return (
    <div className="field-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="field-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragOffset(null)}
        onPointerLeave={() => setDragOffset(null)}
      />
    </div>
  );
}
