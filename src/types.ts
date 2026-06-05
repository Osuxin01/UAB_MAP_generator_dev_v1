export type Stance = "standing" | "crouching";

export type Team = "ally" | "enemy";

export type CameraMode =
  | "top_view"
  | "third_person"
  | "first_person"
  | "enemy_view"
  | "peek_preview";

export type BarrierShape =
  | "rectangle"
  | "small_triangle"
  | "large_triangle"
  | "diamond"
  | "trapezoid";

export type Barrier = {
  id: string;
  shape: BarrierShape;
  anchorIndex?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  obstacleHeight: number;
};

export type Player = {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  angle: number;
  stance: Stance;
  eyeHeight: number;
  viewAngle: number;
  range: number;
};

export type Field = {
  id: string;
  name: string;
  width: number;
  height: number;
  gridSize: number;
  barriers: Barrier[];
  players: Player[];
};

export type Scenario = {
  id: string;
  name: string;
  field: Field;
  createdAt: string;
  updatedAt: string;
};

export type ToolMode =
  | "select"
  | "move"
  | "add_barrier"
  | "add_small_triangle"
  | "add_large_triangle"
  | "add_diamond"
  | "add_trapezoid"
  | "add_ally"
  | "add_enemy";

export type VisibilityState = "Hidden" | "Partial" | "Visible";

export type AppState = {
  scenario: Scenario;
  selectedObjectId: string | null;
  toolMode: ToolMode;
  cameraMode: CameraMode;
  showHeatmap: boolean;
  showLineOfSight: boolean;
  show3DPreview: boolean;
};

export type Point = {
  x: number;
  y: number;
};

export type RayHit = {
  point: Point;
  distance: number;
  barrierId?: string;
};

export type RaySegment = {
  origin: Point;
  end: Point;
  angle: number;
  hit: RayHit | null;
};

export type PlayerVisibility = {
  viewerId: string;
  targetId: string;
  state: VisibilityState;
  visiblePoints: number;
  totalPoints: number;
};
