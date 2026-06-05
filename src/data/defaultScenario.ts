import type { Scenario } from "../types";

const now = new Date().toISOString();

export const FIELD_COLUMNS = 16;
export const FIELD_ROWS = 36;

export const defaultScenario: Scenario = {
  id: "scenario-default",
  name: "UAB基本射線トレーニング",
  createdAt: now,
  updatedAt: now,
  field: {
    id: "field-default",
    name: "基本フィールド",
    width: FIELD_COLUMNS,
    height: FIELD_ROWS,
    gridSize: 1,
    barriers: [],
    players: [],
  },
};
