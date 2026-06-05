import {
  barrierShapeSpecs,
  getBarrierAnchorCandidates,
  getBarrierAnchorOffset,
  getBarrierAnchorPoint,
  BARRIER_OBSTACLE_HEIGHT,
} from "../geometry/barrierShapes";
import { exportScenario, importScenario } from "../storage/scenarioStorage";
import { useAppStore } from "../store/useAppStore";
import type { Barrier, Player, Stance } from "../types";

const stances: Array<{ id: Stance; label: string }> = [
  { id: "standing", label: "立ち" },
  { id: "crouching", label: "しゃがみ" },
];

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="input-row">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function PlayerEditor({ player }: { player: Player }) {
  const { updatePlayer, deleteObject, setPlayerStance } = useAppStore();

  return (
    <div className="panel-section">
      <h2>{player.name}</h2>
      <div className={`team-badge ${player.team}`}>{player.team === "ally" ? "味方" : "敵"}</div>
      <NumberField label="X" value={player.x} min={0} onChange={(x) => updatePlayer(player.id, { x })} />
      <NumberField label="Y" value={player.y} min={0} onChange={(y) => updatePlayer(player.id, { y })} />
      <NumberField
        label="角度"
        value={player.angle}
        min={-360}
        max={360}
        step={1}
        onChange={(angle) => updatePlayer(player.id, { angle })}
      />
      <NumberField
        label="視野角"
        value={player.viewAngle}
        min={20}
        max={180}
        step={1}
        onChange={(viewAngle) => updatePlayer(player.id, { viewAngle })}
      />
      <NumberField label="射程" value={player.range} min={1} step={1} onChange={(range) => updatePlayer(player.id, { range })} />

      <div className="segmented">
        {stances.map((stance) => (
          <button
            key={stance.id}
            className={player.stance === stance.id ? "active" : ""}
            type="button"
            onClick={() => setPlayerStance(player.id, stance.id)}
          >
            {stance.label}
          </button>
        ))}
      </div>
      <button className="danger full" type="button" onClick={() => deleteObject(player.id)}>
        削除
      </button>
    </div>
  );
}

function BarrierEditor({ barrier }: { barrier: Barrier }) {
  const { scenario, updateBarrier, deleteObject } = useAppStore();
  const anchorCandidates = getBarrierAnchorCandidates(barrier);

  function clampPosition(x: number, y: number) {
    return {
      x: Math.min(scenario.field.width - barrier.width, Math.max(0, x)),
      y: Math.min(scenario.field.height - barrier.height, Math.max(0, y)),
    };
  }

  function getPositionKeepingAnchor(nextBarrier: Barrier) {
    const anchor = getBarrierAnchorPoint(barrier);
    const nextOffset = getBarrierAnchorOffset(nextBarrier);
    return clampPosition(anchor.x - nextOffset.x, anchor.y - nextOffset.y);
  }

  function setAnchorIndex(anchorIndex: number) {
    const nextBarrier = { ...barrier, anchorIndex };
    const anchor = getBarrierAnchorPoint(nextBarrier);
    const snappedAnchor = {
      x: Math.round(anchor.x),
      y: Math.round(anchor.y),
    };
    updateBarrier(barrier.id, {
      anchorIndex,
      ...clampPosition(barrier.x + snappedAnchor.x - anchor.x, barrier.y + snappedAnchor.y - anchor.y),
    });
  }

  function rotateKeepingAnchor(rotation: number) {
    const nextBarrier = { ...barrier, rotation };
    updateBarrier(barrier.id, {
      rotation,
      ...getPositionKeepingAnchor(nextBarrier),
    });
  }

  return (
    <div className="panel-section">
      <h2>{barrierShapeSpecs[barrier.shape].label}</h2>
      <div className="segmented">
        {anchorCandidates.map((_, index) => (
          <button
            key={index}
            className={(barrier.anchorIndex ?? 0) === index ? "active" : ""}
            type="button"
            onClick={() => setAnchorIndex(index)}
          >
            支点{index + 1}
          </button>
        ))}
      </div>
      <NumberField label="X" value={barrier.x} min={0} onChange={(x) => updateBarrier(barrier.id, { x })} />
      <NumberField label="Y" value={barrier.y} min={0} onChange={(y) => updateBarrier(barrier.id, { y })} />
      <div className="segmented">
        <button type="button" onClick={() => rotateKeepingAnchor(barrier.rotation - 15)}>
          -15°
        </button>
        <button type="button" onClick={() => rotateKeepingAnchor(barrier.rotation + 15)}>
          +15°
        </button>
      </div>
      <NumberField label="回転" value={barrier.rotation} min={-180} max={180} step={1} onChange={rotateKeepingAnchor} />
      <p className="stat-line">障害物高 {BARRIER_OBSTACLE_HEIGHT}マス</p>
      <button className="danger full" type="button" onClick={() => deleteObject(barrier.id)}>
        削除
      </button>
    </div>
  );
}

export function PropertyPanel() {
  const { scenario, selectedObjectId, setScenario } = useAppStore();
  const selectedPlayer = scenario.field.players.find((player) => player.id === selectedObjectId);
  const selectedBarrier = scenario.field.barriers.find((barrier) => barrier.id === selectedObjectId);

  function handleExport() {
    const blob = new Blob([exportScenario(scenario)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scenario.name}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setScenario(importScenario(text));
  }

  return (
    <aside className="property-panel" aria-label="プロパティ">
      {selectedPlayer && <PlayerEditor player={selectedPlayer} />}
      {selectedBarrier && <BarrierEditor barrier={selectedBarrier} />}
      {!selectedObjectId && (
        <div className="panel-section">
          <h2>Scenario</h2>
          <p className="muted">{scenario.field.name}</p>
          <p className="stat-line">
            {scenario.field.width}m x {scenario.field.height}m
          </p>
          <p className="stat-line">
            Barriers {scenario.field.barriers.length} / Players {scenario.field.players.length}
          </p>
        </div>
      )}

      <div className="panel-section">
        <h2>Share</h2>
        <button className="secondary full" type="button" onClick={handleExport}>
          JSONエクスポート
        </button>
        <label className="file-button">
          JSONインポート
          <input type="file" accept="application/json" onChange={(event) => void handleImport(event.target.files?.[0])} />
        </label>
      </div>
    </aside>
  );
}
