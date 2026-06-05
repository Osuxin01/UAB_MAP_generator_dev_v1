import { defaultScenario, FIELD_COLUMNS, FIELD_ROWS } from "../data/defaultScenario";
import { BARRIER_OBSTACLE_HEIGHT } from "../geometry/barrierShapes";
import type { Barrier, Player, Scenario, Stance } from "../types";

const STORAGE_KEY = "uab-los-simulator:scenario";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeBarrier(barrier: Barrier): Barrier {
  const shape = barrier.shape ?? "rectangle";
  const width = clamp(barrier.width, 0.2, FIELD_COLUMNS);
  const height = clamp(barrier.height, 0.2, FIELD_ROWS);

  return {
    ...barrier,
    shape,
    anchorIndex: barrier.anchorIndex ?? 0,
    width,
    height,
    obstacleHeight: BARRIER_OBSTACLE_HEIGHT,
    x: clamp(barrier.x, 0, FIELD_COLUMNS - width),
    y: clamp(barrier.y, 0, FIELD_ROWS - height),
  };
}

function normalizeStance(stance: unknown): Stance {
  return stance === "crouching" ? "crouching" : "standing";
}

function normalizePlayer(player: Player): Player {
  const stance = normalizeStance(player.stance);
  return {
    ...player,
    stance,
    eyeHeight: stance === "crouching" ? 0.9 : 1.5,
    x: clamp(player.x, 0, FIELD_COLUMNS),
    y: clamp(player.y, 0, FIELD_ROWS),
  };
}

function normalizeScenario(scenario: Scenario): Scenario {
  return {
    ...scenario,
    field: {
      ...scenario.field,
      width: FIELD_COLUMNS,
      height: FIELD_ROWS,
      gridSize: 1,
      barriers: scenario.field.barriers.map(normalizeBarrier),
      players: scenario.field.players.map(normalizePlayer),
    },
  };
}

export function loadScenario(): Scenario {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaultScenario;

  try {
    const parsed = JSON.parse(stored) as Scenario;
    if (!parsed.field || !Array.isArray(parsed.field.barriers) || !Array.isArray(parsed.field.players)) {
      return defaultScenario;
    }
    return normalizeScenario(parsed);
  } catch {
    return defaultScenario;
  }
}

export function saveScenario(scenario: Scenario): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeScenario(scenario)));
}

export function exportScenario(scenario: Scenario): string {
  return JSON.stringify({ version: "1.0.0", scenario: normalizeScenario(scenario) }, null, 2);
}

export function importScenario(raw: string): Scenario {
  const parsed = JSON.parse(raw) as { scenario?: Scenario };
  if (!parsed.scenario?.field) {
    throw new Error("JSONにscenario.fieldがありません。");
  }
  return normalizeScenario({
    ...parsed.scenario,
    updatedAt: new Date().toISOString(),
  });
}
