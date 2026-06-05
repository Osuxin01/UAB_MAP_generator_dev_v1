import { useAppStore } from "../store/useAppStore";
import type { ToolMode } from "../types";

const editTools: Array<{ id: ToolMode; label: string }> = [
  { id: "select", label: "選択" },
  { id: "move", label: "移動" },
  { id: "add_ally", label: "味方" },
  { id: "add_enemy", label: "敵" },
];

const barrierTools: Array<{ id: ToolMode; label: string }> = [
  { id: "add_small_triangle", label: "小三角" },
  { id: "add_large_triangle", label: "大三角" },
  { id: "add_diamond", label: "ひし形" },
  { id: "add_trapezoid", label: "台形" },
];

export function ToolPanel() {
  const {
    toolMode,
    showLineOfSight,
    showHeatmap,
    show3DPreview,
    setToolMode,
    toggleLineOfSight,
    toggleHeatmap,
    toggle3DPreview,
    duplicateBarriersAroundMapCenter,
    resetScenario,
  } = useAppStore();

  return (
    <aside className="tool-panel" aria-label="ツール">
      <div className="panel-section">
        <h2>Tools</h2>
        <div className="segmented vertical">
          {editTools.map((tool) => (
            <button
              key={tool.id}
              className={toolMode === tool.id ? "active" : ""}
              type="button"
              onClick={() => setToolMode(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <h2>Barriers</h2>
        <div className="segmented vertical">
          {barrierTools.map((tool) => (
            <button
              key={tool.id}
              className={toolMode === tool.id ? "active" : ""}
              type="button"
              onClick={() => setToolMode(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <button className="secondary full" type="button" onClick={duplicateBarriersAroundMapCenter}>
          点対称反転
        </button>
      </div>

      <div className="panel-section">
        <h2>View</h2>
        <label className="toggle-row">
          <input type="checkbox" checked={showLineOfSight} onChange={toggleLineOfSight} />
          <span>射線表示</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={showHeatmap} onChange={toggleHeatmap} />
          <span>ヒートマップ</span>
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={show3DPreview} onChange={toggle3DPreview} />
          <span>3Dプレビュー</span>
        </label>
      </div>

      <button className="secondary full" type="button" onClick={resetScenario}>
        初期配置へ戻す
      </button>
    </aside>
  );
}
