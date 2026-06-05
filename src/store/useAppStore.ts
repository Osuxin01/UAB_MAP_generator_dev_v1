import { create } from "zustand";
import { defaultScenario } from "../data/defaultScenario";
import { createBarrierFromShape } from "../geometry/barrierShapes";
import { loadScenario, saveScenario } from "../storage/scenarioStorage";
import type { AppState, Barrier, BarrierShape, CameraMode, Player, Scenario, Stance, ToolMode } from "../types";

type AppActions = {
  setScenario: (scenario: Scenario) => void;
  setSelectedObjectId: (id: string | null) => void;
  setToolMode: (toolMode: ToolMode) => void;
  setCameraMode: (cameraMode: CameraMode) => void;
  toggleLineOfSight: () => void;
  toggleHeatmap: () => void;
  toggle3DPreview: () => void;
  addBarrier: (x: number, y: number, shape?: BarrierShape) => void;
  addPlayer: (team: Player["team"], x: number, y: number) => void;
  updateBarrier: (id: string, patch: Partial<Barrier>) => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  duplicateBarriersAroundMapCenter: () => void;
  deleteObject: (id: string) => void;
  setPlayerStance: (id: string, stance: Stance) => void;
  resetScenario: () => void;
};

function withUpdatedScenario(scenario: Scenario, updater: (scenario: Scenario) => Scenario): Scenario {
  const next = updater(scenario);
  return { ...next, updatedAt: new Date().toISOString() };
}

function persist(next: Partial<AppState> | AppState): void {
  if ("scenario" in next && next.scenario) {
    saveScenario(next.scenario);
  }
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  scenario: loadScenario(),
  selectedObjectId: null,
  toolMode: "select",
  cameraMode: "top_view",
  showHeatmap: false,
  showLineOfSight: true,
  show3DPreview: true,

  setScenario: (scenario) => {
    persist({ scenario });
    set({ scenario, selectedObjectId: null });
  },
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  setToolMode: (toolMode) => set({ toolMode }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  toggleLineOfSight: () => set({ showLineOfSight: !get().showLineOfSight }),
  toggleHeatmap: () => set({ showHeatmap: !get().showHeatmap }),
  toggle3DPreview: () => set({ show3DPreview: !get().show3DPreview }),
  addBarrier: (x, y, shape = "rectangle") => {
    const scenario = withUpdatedScenario(get().scenario, (current) => ({
      ...current,
      field: {
        ...current.field,
        barriers: [
          ...current.field.barriers,
          {
            id: crypto.randomUUID(),
            ...createBarrierFromShape(shape, x, y),
          },
        ],
      },
    }));
    persist({ scenario });
    set({ scenario, selectedObjectId: scenario.field.barriers.at(-1)?.id ?? null, toolMode: "select" });
  },
  addPlayer: (team, x, y) => {
    const count = get().scenario.field.players.filter((player) => player.team === team).length + 1;
    const scenario = withUpdatedScenario(get().scenario, (current) => ({
      ...current,
      field: {
        ...current.field,
        players: [
          ...current.field.players,
          {
            id: crypto.randomUUID(),
            name: `${team === "ally" ? "Ally" : "Enemy"} ${count}`,
            team,
            x,
            y,
            angle: team === "ally" ? 0 : 180,
            stance: "standing",
            eyeHeight: 1.5,
            viewAngle: 75,
            range: 18,
          },
        ],
      },
    }));
    persist({ scenario });
    set({ scenario, selectedObjectId: scenario.field.players.at(-1)?.id ?? null, toolMode: "select" });
  },
  updateBarrier: (id, patch) => {
    const scenario = withUpdatedScenario(get().scenario, (current) => ({
      ...current,
      field: {
        ...current.field,
        barriers: current.field.barriers.map((barrier) =>
          barrier.id === id ? { ...barrier, ...patch } : barrier,
        ),
      },
    }));
    persist({ scenario });
    set({ scenario });
  },
  updatePlayer: (id, patch) => {
    const scenario = withUpdatedScenario(get().scenario, (current) => ({
      ...current,
      field: {
        ...current.field,
        players: current.field.players.map((player) => (player.id === id ? { ...player, ...patch } : player)),
      },
    }));
    persist({ scenario });
    set({ scenario });
  },
  duplicateBarriersAroundMapCenter: () => {
    const scenario = withUpdatedScenario(get().scenario, (current) => {
      const mirroredBarriers = current.field.barriers.map((barrier) => {
        const center = {
          x: barrier.x + barrier.width / 2,
          y: barrier.y + barrier.height / 2,
        };
        const flippedCenter = {
          x: current.field.width - center.x,
          y: current.field.height - center.y,
        };

        return {
          ...barrier,
          id: crypto.randomUUID(),
          x: Math.min(current.field.width - barrier.width, Math.max(0, flippedCenter.x - barrier.width / 2)),
          y: Math.min(current.field.height - barrier.height, Math.max(0, flippedCenter.y - barrier.height / 2)),
          rotation: barrier.rotation + 180,
        };
      });

      return {
        ...current,
        field: {
          ...current.field,
          barriers: [...current.field.barriers, ...mirroredBarriers],
        },
      };
    });
    persist({ scenario });
    set({ scenario });
  },
  deleteObject: (id) => {
    const scenario = withUpdatedScenario(get().scenario, (current) => ({
      ...current,
      field: {
        ...current.field,
        barriers: current.field.barriers.filter((barrier) => barrier.id !== id),
        players: current.field.players.filter((player) => player.id !== id),
      },
    }));
    persist({ scenario });
    set({ scenario, selectedObjectId: get().selectedObjectId === id ? null : get().selectedObjectId });
  },
  setPlayerStance: (id, stance) => {
    const eyeHeight = stance === "crouching" ? 0.9 : 1.5;
    get().updatePlayer(id, { stance, eyeHeight });
  },
  resetScenario: () => {
    persist({ scenario: defaultScenario });
    set({ scenario: defaultScenario, selectedObjectId: null });
  },
}));
