import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  defaultGeneratorConfig,
  barrierClearsStartBoxes,
  createBarrier,
  generateMap,
  getShapeLabel,
  rebuildBarrier,
  refreshGeneratedMap,
  type Barrier,
  type GeneratedMap,
  type GeneratorConfig,
  type Point,
  type ShapeType,
} from "./mapGenerator";
import "./styles.css";

const CANVAS_WIDTH = 1100;
const CANVAS_HEIGHT = 1900;
const PADDING = 92;

type ConfigKey = keyof GeneratorConfig;

type ScoreTuningField = {
  key: ConfigKey;
  importanceKey: ConfigKey;
  label: string;
  low: string;
  mid: string;
  high: string;
};

const IMPORTANCE_OPTIONS = [
  { value: 1, label: "1 低い" },
  { value: 2, label: "2 やや低い" },
  { value: 3, label: "3 標準" },
  { value: 4, label: "4 高い" },
  { value: 5, label: "5 最優先" },
];

const ADD_SHAPE_OPTIONS: ShapeType[] = ["triangle", "trapezoid", "diamond", "large_triangle"];

type Metrics = {
  scale: number;
  offsetX: number;
  offsetY: number;
  fieldHeight: number;
};

const basicConfigFields: { key: ConfigKey; label: string; step: number; min: number; max: number }[] = [
  { key: "minScore", label: "採用スコア", step: 1, min: 0, max: 100 },
];

const detailConfigFields: { key: ConfigKey; label: string; step: number; min: number; max: number }[] = [
  { key: "fieldWidth", label: "フィールド幅", step: 0.5, min: 4, max: 20 },
  { key: "fieldHeight", label: "フィールド奥行き", step: 0.5, min: 8, max: 30 },
  { key: "gridSize", label: "グリッド間隔", step: 0.5, min: 0.5, max: 2 },
  { key: "triangleCount", label: "三角形の個数", step: 2, min: 0, max: 24 },
  { key: "trapezoidCount", label: "台形の個数", step: 2, min: 0, max: 24 },
  { key: "diamondCount", label: "ひし形の個数", step: 2, min: 0, max: 24 },
  { key: "largeTriangleCount", label: "大三角形の個数", step: 2, min: 0, max: 16 },
  { key: "maxAttempts", label: "最大試行回数", step: 50, min: 50, max: 3000 },
];

const scoreTuningFields: ScoreTuningField[] = [
  {
    key: "safetyWeight",
    importanceKey: "safetyImportance",
    label: "ブレイク",
    low: "初動リスクを許容",
    mid: "標準的な初動安全",
    high: "最初の一手をかなり安全に",
  },
  {
    key: "centralAccessWeight",
    importanceKey: "centralAccessImportance",
    label: "上がりやすさ",
    low: "中央に入りにくい",
    mid: "上がりやすさは標準",
    high: "中央に入りやすい",
  },
  {
    key: "sideBalanceWeight",
    importanceKey: "sideBalanceImportance",
    label: "左右バランス",
    low: "左右差を許容",
    mid: "左右差は標準",
    high: "左右差を少なくする",
  },
  {
    key: "lineOfSightWeight",
    importanceKey: "lineOfSightImportance",
    label: "射線制御",
    low: "長い射線を許容",
    mid: "射線制御は標準",
    high: "長い射線を抑える",
  },
  {
    key: "densityWeight",
    importanceKey: "densityImportance",
    label: "バリケ間距離",
    low: "バリケード間隔を広めにする",
    mid: "標準的な間隔にする",
    high: "バリケード間隔を詰める",
  },
  {
    key: "routeWeight",
    importanceKey: "routeImportance",
    label: "到達性",
    low: "入りにくいバリケードも許容",
    mid: "標準的な到達性",
    high: "各バリケードへ入りやすくする",
  },
  {
    key: "centralStrengthWeight",
    importanceKey: "centralStrengthImportance",
    label: "中央の密度",
    low: "中央を薄めにする",
    mid: "中央を標準密度にする",
    high: "中央を厚めにする",
  },
];

const basicTuningFields = scoreTuningFields.filter((field) =>
  ["safetyWeight", "centralAccessWeight", "densityWeight", "centralStrengthWeight"].includes(field.key),
);

const detailTuningFields = scoreTuningFields.filter((field) =>
  ["sideBalanceWeight", "lineOfSightWeight", "routeWeight"].includes(field.key),
);

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [config, setConfig] = useState<GeneratorConfig>(defaultGeneratorConfig);
  const [generated, setGenerated] = useState<GeneratedMap>(() => generateMap(defaultGeneratorConfig));
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedBarrierId, setSelectedBarrierId] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState(0);
  const [addShape, setAddShape] = useState<ShapeType>("triangle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawMap(canvas, generated, selectedBarrierId, selectedVertexIndex);
  }, [generated, selectedBarrierId, selectedVertexIndex]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!editMode || !selectedBarrierId) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelected(0, 0.5);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelected(0, -0.5);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelected(-0.5, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelected(0.5, 0);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editMode, selectedBarrierId, selectedVertexIndex, generated, config]);

  function updateConfig(key: ConfigKey, value: number) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    try {
      const next = generateMap(config);
      setGenerated(next);
      setSelectedBarrierId(null);
      setError(null);
      setSettingsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fileName = `uab-map-score-${generated.evaluation.score}.png`;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const file = new File([blob], fileName, { type: "image/png" });
    const canShareImage =
      typeof navigator !== "undefined" &&
      "share" in navigator &&
      "canShare" in navigator &&
      navigator.canShare({ files: [file] });
    const prefersMobileSave =
      typeof window !== "undefined" && (window.matchMedia("(max-width: 720px)").matches || navigator.maxTouchPoints > 0);

    if (prefersMobileSave && canShareImage) {
      try {
        await navigator.share({
          files: [file],
          title: "UABマップ",
          text: "生成したUABマップです。",
        });
        return;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
      }
    }

    const link = document.createElement("a");
    link.download = fileName;
    link.href = URL.createObjectURL(blob);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function updateEditedBarriers(nextBarriers: Barrier[], nextSelectedId = selectedBarrierId) {
    setGenerated((current) => refreshGeneratedMap(current, config, nextBarriers));
    setSelectedBarrierId(nextSelectedId);
  }

  function selectedBarrier(): Barrier | null {
    return generated.barriers.find((barrier) => barrier.id === selectedBarrierId) ?? null;
  }

  function selectedPivotIndex(barrier: Barrier): number {
    return Math.min(selectedVertexIndex, barrier.polygon.length - 1);
  }

  function mirroredBarrierOf(source: Barrier, partner: Barrier): Barrier {
    return createBarrier(
      source.shape,
      generated.field.width - source.x,
      generated.field.height - source.y,
      source.angle + 180,
      partner.id,
    );
  }

  function symmetricPartnerOf(source: Barrier): Barrier | null {
    const mirrorCenter = {
      x: generated.field.width - source.x,
      y: generated.field.height - source.y,
    };
    const candidates = generated.barriers.filter((barrier) => barrier.id !== source.id && barrier.shape === source.shape);
    if (!candidates.length) return null;
    return candidates.reduce((nearest, barrier) => (
      pointDistance(barrier, mirrorCenter) < pointDistance(nearest, mirrorCenter) ? barrier : nearest
    ));
  }

  function updateBarrierWithSymmetricPartner(original: Barrier, updated: Barrier) {
    const partner = symmetricPartnerOf(original);
    const mirrored = partner ? mirroredBarrierOf(updated, partner) : null;
    if (!barrierClearsStartBoxes(generated.field, updated)) return;
    if (mirrored && !barrierInsideField(mirrored, generated.field)) return;
    if (mirrored && !barrierClearsStartBoxes(generated.field, mirrored)) return;

    updateEditedBarriers(generated.barriers.map((barrier) => {
      if (barrier.id === updated.id) return updated;
      if (mirrored && barrier.id === mirrored.id) return mirrored;
      return barrier;
    }));
  }

  function moveSelected(dx: number, dy: number) {
    const target = selectedBarrier();
    if (!target) return;
    const pivot = target.polygon[selectedPivotIndex(target)];
    const nextPivot = nextPivotGridPoint(pivot, dx, dy, generated.field);
    const moved = rebuildBarrier(
      target,
      target.x + nextPivot.x - pivot.x,
      target.y + nextPivot.y - pivot.y,
      target.angle,
    );
    if (!barrierInsideField(moved, generated.field)) return;
    if (!barrierClearsStartBoxes(generated.field, moved)) return;
    updateBarrierWithSymmetricPartner(target, moved);
  }

  function rotateSelected(delta: number) {
    const target = selectedBarrier();
    if (!target) return;
    const pivot = target.polygon[selectedPivotIndex(target)];
    const rotatedCenter = rotateAround({ x: target.x, y: target.y }, pivot, delta);
    const rotated = rebuildBarrier(target, rotatedCenter.x, rotatedCenter.y, target.angle + delta);
    if (!barrierInsideField(rotated, generated.field)) return;
    if (!barrierClearsStartBoxes(generated.field, rotated)) return;
    updateBarrierWithSymmetricPartner(target, rotated);
  }

  function deleteSelected() {
    if (!selectedBarrierId) return;
    updateEditedBarriers(generated.barriers.filter((barrier) => barrier.id !== selectedBarrierId), null);
  }

  function addBarrier() {
    const created = createBarrier(addShape, generated.field.width / 2, generated.field.height / 2, 0);
    updateEditedBarriers([...generated.barriers, created], created.id);
    setSelectedVertexIndex(0);
  }

  function handleCanvasClick(event: MouseEvent<HTMLCanvasElement>) {
    if (!editMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const metrics = getMetrics(generated.field.width, generated.field.height);
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasPoint = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
    const world = canvasToWorld(canvasPoint, metrics);
    const clicked = [...generated.barriers].reverse().find((barrier) => pointInPolygonLocal(world, barrier.polygon));
    setSelectedBarrierId(clicked?.id ?? null);
    setSelectedVertexIndex(0);
  }

  const counts = generated.barriers.reduce<Record<string, number>>((total, barrier) => {
    total[barrier.shape] = (total[barrier.shape] ?? 0) + 1;
    return total;
  }, {});

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>UABマップ自動生成ツール</h1>
          <p>点対称・頂点グリッド合わせ対応の2D競技マップ自動生成ツール</p>
        </div>
        <div className="score-block">
          <span>設定一致度</span>
          <strong>{generated.evaluation.score}</strong>
        </div>
      </header>

      <div className="mobile-action-bar">
        <button
          className="menu-button mobile-menu-action"
          type="button"
          aria-label="設定を開く"
          aria-expanded={settingsOpen}
          disabled={isGenerating}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <button className="primary-button mobile-generate-action" type="button" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? "生成中..." : "生成"}
        </button>
        <button className="secondary-button mobile-save-action" type="button" onClick={handleDownload} disabled={isGenerating}>
          PNG保存
        </button>
        <button className={`secondary-button mobile-edit-action ${editMode ? "active-button" : ""}`} type="button" onClick={() => setEditMode((value) => !value)} disabled={isGenerating}>
          編集{editMode ? "ON" : "OFF"}
        </button>
      </div>

      <section className="generator-layout">
        {settingsOpen && <button className="drawer-backdrop" type="button" aria-label="設定を閉じる" onClick={() => setSettingsOpen(false)} />}
        <aside className={`settings-panel ${settingsOpen ? "open" : ""}`} aria-label="マップ設定">
          <div className="panel-head">
            <h2>設定</h2>
            <button className="primary-button" type="button" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "生成中..." : "生成"}
            </button>
          </div>

          <div className="score-settings">
            <div>
              <h2>基本設定</h2>
              <p>普段はここだけ調整すれば生成できます。スライダーは点数ではなく、作りたいマップの傾向です。</p>
            </div>
            <div className="settings-grid">
              {basicConfigFields.map((field) => (
                <label className="input-row" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={config[field.key]}
                    onChange={(event) => updateConfig(field.key, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
            <div className="tuning-list">
              {basicTuningFields.map((field) => (
                <label className="tuning-row" key={field.key}>
                  <span className="tuning-head">
                    <span>{field.label}</span>
                    <strong>{config[field.key]}</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={config[field.key]}
                    onChange={(event) => updateConfig(field.key, Number(event.target.value))}
                  />
                  <span className="tuning-foot">
                    <span>{tuningText(field, Number(config[field.key]))}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={config[field.key]}
                      onChange={(event) => updateConfig(field.key, Number(event.target.value))}
                    />
                  </span>
                  <span className="importance-inline">
                    <span>重要度</span>
                    <select
                      value={importanceLevel(Number(config[field.importanceKey]))}
                      onChange={(event) => updateConfig(field.importanceKey, importanceValueFromLevel(Number(event.target.value)))}
                    >
                      {IMPORTANCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="edit-settings">
            <div className="edit-head">
              <div>
                <h2>編集モード</h2>
                <p>マップ上のバリケードをクリックして選択します。</p>
              </div>
              <button className="secondary-button compact-button" type="button" onClick={() => setEditMode((value) => !value)}>
                {editMode ? "ON" : "OFF"}
              </button>
            </div>
            {editMode && (
              <div className="edit-tools">
                <p className="selected-label">
                  {selectedBarrier() ? `選択中: ${getShapeLabel(selectedBarrier()!.shape)}` : "バリケード未選択"}
                </p>
                {selectedBarrier() && (
                  <label className="pivot-row">
                    <span>基準頂点</span>
                    <select
                      value={selectedPivotIndex(selectedBarrier()!)}
                      onChange={(event) => setSelectedVertexIndex(Number(event.target.value))}
                    >
                      {selectedBarrier()!.polygon.map((_, index) => (
                        <option key={index} value={index}>
                          頂点 {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="nudge-grid">
                  <span />
                  <button type="button" onClick={() => moveSelected(0, 0.5)} disabled={!selectedBarrierId}>↑</button>
                  <span />
                  <button type="button" onClick={() => moveSelected(-0.5, 0)} disabled={!selectedBarrierId}>←</button>
                  <button type="button" onClick={() => moveSelected(0, -0.5)} disabled={!selectedBarrierId}>↓</button>
                  <button type="button" onClick={() => moveSelected(0.5, 0)} disabled={!selectedBarrierId}>→</button>
                </div>
                <div className="edit-button-row">
                  <button type="button" onClick={() => rotateSelected(-15)} disabled={!selectedBarrierId}>-15°</button>
                  <button type="button" onClick={() => rotateSelected(15)} disabled={!selectedBarrierId}>+15°</button>
                  <button type="button" className="danger-button" onClick={deleteSelected} disabled={!selectedBarrierId}>削除</button>
                </div>
                <div className="add-row">
                  <select value={addShape} onChange={(event) => setAddShape(event.target.value as ShapeType)}>
                    {ADD_SHAPE_OPTIONS.map((shape) => (
                      <option key={shape} value={shape}>{getShapeLabel(shape)}</option>
                    ))}
                  </select>
                  <button type="button" onClick={addBarrier}>追加</button>
                </div>
              </div>
            )}
          </div>

          <details className="detail-settings">
            <summary>詳細設定</summary>
            <div className="settings-grid">
              {detailConfigFields.map((field) => (
                <label className="input-row" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={config[field.key]}
                    onChange={(event) => updateConfig(field.key, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
            <div className="score-settings nested">
              <div>
                <h2>補助傾向</h2>
                <p>必要なときだけ調整します。重要度は各スライダーの直下で選べます。</p>
              </div>
              <div className="tuning-list">
                {detailTuningFields.map((field) => (
                  <label className="tuning-row" key={field.key}>
                    <span className="tuning-head">
                      <span>{field.label}</span>
                      <strong>{config[field.key]}</strong>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={config[field.key]}
                      onChange={(event) => updateConfig(field.key, Number(event.target.value))}
                    />
                    <span className="tuning-foot">
                      <span>{tuningText(field, Number(config[field.key]))}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={config[field.key]}
                        onChange={(event) => updateConfig(field.key, Number(event.target.value))}
                      />
                    </span>
                    <span className="importance-inline">
                      <span>重要度</span>
                      <select
                        value={importanceLevel(Number(config[field.importanceKey]))}
                        onChange={(event) => updateConfig(field.importanceKey, importanceValueFromLevel(Number(event.target.value)))}
                      >
                        {IMPORTANCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </details>

          {error && <p className="error-message">{error}</p>}
          {!generated.accepted && (
            <p className="warning-message">
              採用スコア未達です。最良候補を表示しています。
            </p>
          )}

          <button className="secondary-button" type="button" onClick={handleDownload} disabled={isGenerating}>
            PNG保存
          </button>

          <div className="summary-panel">
            <p>{generated.accepted ? "採用条件を満たしています。" : `採用スコア ${config.minScore} に未達です。`}</p>
            <h2>生成結果</h2>
            <p>採用までの試行: {generated.attempt}回</p>
            <p>バリケード数: {generated.barriers.length}個</p>
            <div className="shape-counts">
              {(Object.entries(counts) as [Barrier["shape"], number][]).map(([shape, count]) => (
                <span key={shape}>
                  {getShapeLabel(shape)} {count}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <section className="map-panel" aria-label="生成マッププレビュー">
          <div className="map-toolbar">
            <div>
              <h2>{generated.name}</h2>
              <p>
                {generated.field.width}m x {generated.field.height}m / グリッド {generated.field.gridSize}m
              </p>
            </div>
            {!generated.accepted && <p className="toolbar-warning">採用スコア未達: 最良候補を表示中</p>}
            <div className="metric-list">
              {Object.entries(generated.evaluation.details).map(([label, value]) => (
                <span key={label}>
                  {label} {value}
                </span>
              ))}
            </div>
          </div>
          <div className="canvas-frame">
            {isGenerating && (
              <div className="generating-overlay" role="status" aria-live="polite">
                <div className="spinner" />
                <strong>生成中...</strong>
                <span>条件に合うマップを探しています</span>
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onClick={handleCanvasClick}
              className={editMode ? "editable-canvas" : ""}
            />
          </div>
        </section>
      </section>

      {editMode && (
        <div className="mobile-edit-bar">
          <div className="mobile-edit-status">
            <strong>{selectedBarrier() ? getShapeLabel(selectedBarrier()!.shape) : "未選択"}</strong>
            {selectedBarrier() && (
              <select
                value={selectedPivotIndex(selectedBarrier()!)}
                onChange={(event) => setSelectedVertexIndex(Number(event.target.value))}
              >
                {selectedBarrier()!.polygon.map((_, index) => (
                  <option key={index} value={index}>
                    頂点 {index + 1}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mobile-edit-controls">
            <button type="button" onClick={() => moveSelected(-0.5, 0)} disabled={!selectedBarrierId}>←</button>
            <button type="button" onClick={() => moveSelected(0, 0.5)} disabled={!selectedBarrierId}>↑</button>
            <button type="button" onClick={() => moveSelected(0, -0.5)} disabled={!selectedBarrierId}>↓</button>
            <button type="button" onClick={() => moveSelected(0.5, 0)} disabled={!selectedBarrierId}>→</button>
            <button type="button" onClick={() => rotateSelected(-15)} disabled={!selectedBarrierId}>-15°</button>
            <button type="button" onClick={() => rotateSelected(15)} disabled={!selectedBarrierId}>+15°</button>
            <button type="button" className="danger-button" onClick={deleteSelected} disabled={!selectedBarrierId}>削除</button>
          </div>
          <div className="mobile-add-row">
            <select value={addShape} onChange={(event) => setAddShape(event.target.value as ShapeType)}>
              {ADD_SHAPE_OPTIONS.map((shape) => (
                <option key={shape} value={shape}>{getShapeLabel(shape)}</option>
              ))}
            </select>
            <button type="button" onClick={addBarrier}>追加</button>
          </div>
        </div>
      )}
    </main>
  );
}

function tuningText(field: ScoreTuningField, value: number): string {
  if (value <= 33) return field.low;
  if (value <= 66) return field.mid;
  return field.high;
}

function importanceLevel(value: number): number {
  if (value <= 8) return 1;
  if (value <= 12) return 2;
  if (value <= 18) return 3;
  if (value <= 28) return 4;
  return 5;
}

function importanceValueFromLevel(level: number): number {
  return [0, 6, 12, 18, 30, 50][level] ?? 18;
}

function drawMap(canvas: HTMLCanvasElement, generated: GeneratedMap, selectedBarrierId: string | null, selectedVertexIndex: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const metrics = getMetrics(generated.field.width, generated.field.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f4f7f8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTitle(ctx, generated);
  drawField(ctx, generated, metrics);
  drawGrid(ctx, generated, metrics);
  drawStartBoxes(ctx, generated, metrics);
  drawStarts(ctx, generated, metrics);
  generated.barriers.forEach((barrier) => drawBarrier(
    ctx,
    barrier,
    metrics,
    barrier.id === selectedBarrierId,
    barrier.id === selectedBarrierId ? Math.min(selectedVertexIndex, barrier.polygon.length - 1) : null,
  ));
}

function getMetrics(fieldWidth: number, fieldHeight: number): Metrics {
  const availableWidth = CANVAS_WIDTH - PADDING * 2;
  const availableHeight = CANVAS_HEIGHT - PADDING * 2 - 72;
  const scale = Math.min(availableWidth / fieldWidth, availableHeight / fieldHeight);
  return {
    scale,
    offsetX: (CANVAS_WIDTH - fieldWidth * scale) / 2,
    offsetY: PADDING + 72,
    fieldHeight,
  };
}

function worldToCanvas(point: Point, metrics: Metrics): Point {
  return {
    x: metrics.offsetX + point.x * metrics.scale,
    y: metrics.offsetY + (metrics.fieldHeight - point.y) * metrics.scale,
  };
}

function canvasToWorld(point: Point, metrics: Metrics): Point {
  return {
    x: (point.x - metrics.offsetX) / metrics.scale,
    y: metrics.fieldHeight - (point.y - metrics.offsetY) / metrics.scale,
  };
}

function rotateAround(point: Point, pivot: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nextPivotGridPoint(
  pivot: Point,
  dx: number,
  dy: number,
  field: GeneratedMap["field"],
): Point {
  const grid = field.gridSize;
  const onGridX = isOnGrid(pivot.x, grid);
  const onGridY = isOnGrid(pivot.y, grid);
  const nearestX = snapToGrid(pivot.x, grid);
  const nearestY = snapToGrid(pivot.y, grid);

  if (dx > 0) {
    return {
      x: clampValue(onGridX && onGridY ? pivot.x + grid : Math.ceil((pivot.x + 1e-9) / grid) * grid, 0, field.width),
      y: clampValue(nearestY, 0, field.height),
    };
  }
  if (dx < 0) {
    return {
      x: clampValue(onGridX && onGridY ? pivot.x - grid : Math.floor((pivot.x - 1e-9) / grid) * grid, 0, field.width),
      y: clampValue(nearestY, 0, field.height),
    };
  }
  if (dy > 0) {
    return {
      x: clampValue(nearestX, 0, field.width),
      y: clampValue(onGridX && onGridY ? pivot.y + grid : Math.ceil((pivot.y + 1e-9) / grid) * grid, 0, field.height),
    };
  }
  return {
    x: clampValue(nearestX, 0, field.width),
    y: clampValue(onGridX && onGridY ? pivot.y - grid : Math.floor((pivot.y - 1e-9) / grid) * grid, 0, field.height),
  };
}

function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function isOnGrid(value: number, grid: number): boolean {
  return Math.abs(value - snapToGrid(value, grid)) < 1e-6;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function barrierInsideField(barrier: Barrier, field: GeneratedMap["field"]): boolean {
  return barrier.polygon.every((point) =>
    point.x >= 0.05 &&
    point.y >= 0.05 &&
    point.x <= field.width - 0.05 &&
    point.y <= field.height - 0.05,
  );
}

function pointInPolygonLocal(point: Point, polygon: Point[]): boolean {
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

function drawTitle(ctx: CanvasRenderingContext2D, generated: GeneratedMap) {
  ctx.fillStyle = "#162631";
  ctx.font = "700 34px 'Yu Gothic', Meiryo, Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${generated.name} | 設定一致度: ${generated.evaluation.score}/100`, CANVAS_WIDTH / 2, 58);

  ctx.font = "500 18px 'Yu Gothic', Meiryo, Inter, system-ui, sans-serif";
  ctx.fillStyle = "#526775";
  const details = Object.entries(generated.evaluation.details).map(([label, value]) => `${label} ${value}`).join("   ");
  ctx.fillText(details, CANVAS_WIDTH / 2, 94);
}

function drawField(ctx: CanvasRenderingContext2D, generated: GeneratedMap, metrics: Metrics) {
  const topLeft = worldToCanvas({ x: 0, y: generated.field.height }, metrics);
  ctx.fillStyle = "#fbfcfd";
  ctx.fillRect(topLeft.x, topLeft.y, generated.field.width * metrics.scale, generated.field.height * metrics.scale);
  ctx.strokeStyle = "#0f171d";
  ctx.lineWidth = 7;
  ctx.strokeRect(topLeft.x, topLeft.y, generated.field.width * metrics.scale, generated.field.height * metrics.scale);
}

function drawGrid(ctx: CanvasRenderingContext2D, generated: GeneratedMap, metrics: Metrics) {
  for (let x = 0; x <= generated.field.width + 1e-9; x += generated.field.gridSize) {
    const a = worldToCanvas({ x, y: 0 }, metrics);
    const b = worldToCanvas({ x, y: generated.field.height }, metrics);
    const major = Math.abs(x - Math.round(x)) < 1e-9;
    const center = Math.abs(x - generated.field.width / 2) < 1e-9;
    ctx.strokeStyle = center ? "#324b59" : major ? "#6f8391" : "#bcc8d1";
    ctx.lineWidth = center ? 3.8 : major ? 1.8 : 1.1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let y = 0; y <= generated.field.height + 1e-9; y += generated.field.gridSize) {
    const a = worldToCanvas({ x: 0, y }, metrics);
    const b = worldToCanvas({ x: generated.field.width, y }, metrics);
    const major = Math.abs(y - Math.round(y)) < 1e-9;
    const center = Math.abs(y - generated.field.height / 2) < 1e-9;
    ctx.strokeStyle = center ? "#324b59" : major ? "#6f8391" : "#bcc8d1";
    ctx.lineWidth = center ? 3.8 : major ? 1.8 : 1.1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawStartBoxes(ctx: CanvasRenderingContext2D, generated: GeneratedMap, metrics: Metrics) {
  const boxWidth = 2;
  const boxHeight = 1;
  const left = generated.field.width / 2 - boxWidth / 2;
  const boxes = [
    { x: left, y: 0 },
    { x: left, y: generated.field.height - boxHeight },
  ];

  ctx.strokeStyle = "#324b59";
  ctx.lineWidth = 3.8;
  boxes.forEach((box) => {
    const topLeft = worldToCanvas({ x: box.x, y: box.y + boxHeight }, metrics);
    ctx.strokeRect(topLeft.x, topLeft.y, boxWidth * metrics.scale, boxHeight * metrics.scale);
  });
}

function drawStarts(ctx: CanvasRenderingContext2D, generated: GeneratedMap, metrics: Metrics) {
  [
    { x: generated.field.bottomStart.x, y: 0 },
    { x: generated.field.topStart.x, y: generated.field.height },
  ].forEach((point) => {
    const canvasPoint = worldToCanvas(point as Point, metrics);
    ctx.beginPath();
    ctx.arc(canvasPoint.x, canvasPoint.y, 0.16 * metrics.scale, 0, Math.PI * 2);
    ctx.fillStyle = "#d93a35";
    ctx.fill();
  });
}

function drawBarrier(
  ctx: CanvasRenderingContext2D,
  barrier: Barrier,
  metrics: Metrics,
  selected = false,
  pivotIndex: number | null = null,
) {
  ctx.beginPath();
  barrier.polygon.forEach((point, index) => {
    const canvasPoint = worldToCanvas(point, metrics);
    if (index === 0) ctx.moveTo(canvasPoint.x, canvasPoint.y);
    else ctx.lineTo(canvasPoint.x, canvasPoint.y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(47, 115, 216, 0.9)";
  ctx.fill();
  ctx.strokeStyle = selected ? "#f5a400" : "#123d80";
  ctx.lineWidth = selected ? 8 : 4;
  ctx.stroke();

  if (selected) {
    const center = worldToCanvas({ x: barrier.x, y: barrier.y }, metrics);
    ctx.beginPath();
    ctx.arc(center.x, center.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#f5a400";
    ctx.fill();
    if (pivotIndex !== null) {
      const pivot = worldToCanvas(barrier.polygon[pivotIndex], metrics);
      ctx.beginPath();
      ctx.arc(pivot.x, pivot.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#f5a400";
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  barrier.seams.forEach(([a, b]) => {
    const ca = worldToCanvas(a, metrics);
    const cb = worldToCanvas(b, metrics);
    ctx.strokeStyle = "#4cc9df";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(ca.x, ca.y);
    ctx.lineTo(cb.x, cb.y);
    ctx.stroke();
  });
}
