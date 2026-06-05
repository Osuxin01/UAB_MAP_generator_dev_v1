import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  PerspectiveCamera,
  Vector3,
} from "three";
import { BARRIER_OBSTACLE_HEIGHT, getBarrierLocalPolygons, getBarrierPolygons } from "../geometry/barrierShapes";
import { buildViewRays, getPlayerViewOrigin, isPointVisible } from "../geometry/lineOfSight";
import { useAppStore } from "../store/useAppStore";
import type { Barrier, Player, Point } from "../types";

function playerHeight(player: Player): number {
  return player.stance === "crouching" ? 1.1 : 1.7;
}

function horizontalToVerticalFov(horizontalFovDegrees: number, aspect: number): number {
  const horizontalFov = (horizontalFovDegrees * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(horizontalFov / 2) / Math.max(0.1, aspect)) * 180) / Math.PI;
}

function createPrismGeometry(points: Array<{ x: number; y: number }>, barrier: Barrier): BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];

  points.forEach((point) => {
    vertices.push(point.x - barrier.width / 2, 0, point.y - barrier.height / 2);
  });
  points.forEach((point) => {
    vertices.push(point.x - barrier.width / 2, BARRIER_OBSTACLE_HEIGHT, point.y - barrier.height / 2);
  });

  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(points.length, points.length + index, points.length + index + 1);
  }

  points.forEach((_, index) => {
    const next = (index + 1) % points.length;
    indices.push(index, next, points.length + next);
    indices.push(index, points.length + next, points.length + index);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWorldPrismGeometry(points: Point[]): BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];

  points.forEach((point) => {
    vertices.push(point.x, 0, point.y);
  });
  points.forEach((point) => {
    vertices.push(point.x, BARRIER_OBSTACLE_HEIGHT, point.y);
  });

  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(points.length, points.length + index, points.length + index + 1);
  }

  points.forEach((_, index) => {
    const next = (index + 1) % points.length;
    indices.push(index, next, points.length + next);
    indices.push(index, points.length + next, points.length + index);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWorldWallGeometry(a: Point, b: Point): BufferGeometry {
  const vertices = [
    a.x,
    0,
    a.y,
    b.x,
    0,
    b.y,
    b.x,
    BARRIER_OBSTACLE_HEIGHT,
    b.y,
    a.x,
    BARRIER_OBSTACLE_HEIGHT,
    a.y,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function BarrierMesh({ barrier }: { barrier: Barrier }) {
  const geometries = useMemo(
    () => getBarrierLocalPolygons(barrier).map((polygon) => createPrismGeometry(polygon, barrier)),
    [barrier],
  );

  return (
    <group
      position={[barrier.x + barrier.width / 2, 0, barrier.y + barrier.height / 2]}
      rotation={[0, (barrier.rotation * Math.PI) / 180, 0]}
    >
      {geometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshStandardMaterial color="#405568" side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function ClippedBarrierMesh({ barrier, viewerPlayer, barriers }: { barrier: Barrier; viewerPlayer: Player; barriers: Barrier[] }) {
  const geometries = useMemo(() => {
    const visibleEdges: Point[][] = [];
    const hitSurfaces: Point[][] = [];
    const rays = buildViewRays(viewerPlayer, barriers, 128);

    for (let index = 0; index < rays.length - 1; index += 1) {
      const currentRay = rays[index];
      const nextRay = rays[index + 1];
      if (currentRay.hit?.barrierId !== barrier.id || nextRay.hit?.barrierId !== barrier.id) continue;
      hitSurfaces.push([currentRay.end, nextRay.end]);
    }

    getBarrierPolygons(barrier).forEach((barrierPolygon) => {
      barrierPolygon.forEach((point, index) => {
        const next = barrierPolygon[(index + 1) % barrierPolygon.length];
        const samplePoints = [
          { x: point.x * 0.75 + next.x * 0.25, y: point.y * 0.75 + next.y * 0.25 },
          { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 },
          { x: point.x * 0.25 + next.x * 0.75, y: point.y * 0.25 + next.y * 0.75 },
        ];

        if (samplePoints.some((samplePoint) => isPointVisible(viewerPlayer, samplePoint, barriers))) {
          visibleEdges.push([point, next]);
        }
      });
    });

    return [...hitSurfaces, ...visibleEdges].map((edge) => createWorldWallGeometry(edge[0], edge[1]));
  }, [barrier, barriers, viewerPlayer]);

  return (
    <>
      {geometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshStandardMaterial color="#405568" side={DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

function FpsVisibleFloor({ player, barriers }: { player: Player; barriers: Barrier[] }) {
  const geometry = useMemo(() => {
    const origin = getPlayerViewOrigin(player);
    const rays = buildViewRays(player, barriers, 128);
    const vertices = [origin.x, -0.02, origin.y];
    const indices: number[] = [];

    rays.forEach((ray) => {
      vertices.push(ray.end.x, -0.02, ray.end.y);
    });

    for (let index = 1; index < rays.length; index += 1) {
      indices.push(0, index, index + 1);
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    nextGeometry.setIndex(indices);
    nextGeometry.computeVertexNormals();
    return nextGeometry;
  }, [barriers, player]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#e9eef1" side={DoubleSide} />
    </mesh>
  );
}

function barrierSamplePoints(barrier: Barrier) {
  const polygons = getBarrierPolygons(barrier);
  const center = { x: barrier.x + barrier.width / 2, y: barrier.y + barrier.height / 2 };
  return [center, ...polygons.flat()];
}

function SceneObjects({ viewerPlayer }: { viewerPlayer?: Player }) {
  const field = useAppStore((state) => state.scenario.field);
  const center = useMemo(() => [field.width / 2, 0, field.height / 2] as const, [field.height, field.width]);
  const viewRays = useMemo(
    () => (viewerPlayer ? buildViewRays(viewerPlayer, field.barriers, 96) : []),
    [field.barriers, viewerPlayer],
  );
  const visibleBarriers = useMemo(
    () =>
      field.barriers.filter((barrier) => {
        if (!viewerPlayer) return true;
        if (viewRays.some((ray) => ray.hit?.barrierId === barrier.id)) return true;
        return barrierSamplePoints(barrier).some((point) => isPointVisible(viewerPlayer, point, field.barriers));
      }),
    [field.barriers, viewRays, viewerPlayer],
  );
  const visiblePlayers = useMemo(
    () =>
      field.players.filter((player) => {
        if (player.id === viewerPlayer?.id) return false;
        if (!viewerPlayer) return true;
        return isPointVisible(viewerPlayer, player, field.barriers);
      }),
    [field.barriers, field.players, viewerPlayer],
  );

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 10, 4]} intensity={1.2} />
      {viewerPlayer ? (
        <FpsVisibleFloor player={viewerPlayer} barriers={field.barriers} />
      ) : (
        <>
          <mesh position={[center[0], -0.02, center[2]]} receiveShadow>
            <boxGeometry args={[field.width, 0.04, field.height]} />
            <meshStandardMaterial color="#e9eef1" />
          </mesh>
          <gridHelper
            args={[Math.max(field.width, field.height), Math.max(field.width, field.height), "#9aa9b4", "#cbd5db"]}
          />
        </>
      )}
      {visibleBarriers.map((barrier) =>
        viewerPlayer ? (
          <ClippedBarrierMesh
            key={barrier.id}
            barrier={barrier}
            viewerPlayer={viewerPlayer}
            barriers={field.barriers}
          />
        ) : (
          <BarrierMesh key={barrier.id} barrier={barrier} />
        ),
      )}
      {visiblePlayers.map((player) => (
        <group
          key={player.id}
          position={[player.x, playerHeight(player) / 2, player.y]}
          rotation={[0, -((player.angle - 90) * Math.PI) / 180, 0]}
        >
          <mesh>
            <capsuleGeometry args={[0.22, playerHeight(player) - 0.44, 8, 16]} />
            <meshStandardMaterial color={player.team === "ally" ? "#2c8f7b" : "#c84e4e"} />
          </mesh>
          <mesh position={[0, playerHeight(player) / 2 + 0.05, 0]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial color={player.team === "ally" ? "#226f63" : "#a93b3b"} />
          </mesh>
          <mesh position={[0, 0.35, 0.38]}>
            <boxGeometry args={[0.08, 0.08, 0.48]} />
            <meshStandardMaterial color="#1b2730" />
          </mesh>
        </group>
      ))}
    </>
  );
}

function PlayerFpsCamera({ player, pitch }: { player: Player; pitch: number }) {
  const { camera, size } = useThree();
  const origin = getPlayerViewOrigin(player);

  useLayoutEffect(() => {
    const eye = new Vector3(origin.x, player.eyeHeight, origin.y);
    const pitchRadians = (pitch * Math.PI) / 180;
    const direction = new Vector3(
      Math.cos((player.angle * Math.PI) / 180) * Math.cos(pitchRadians),
      Math.sin(pitchRadians),
      Math.sin((player.angle * Math.PI) / 180) * Math.cos(pitchRadians),
    );
    camera.position.copy(eye);
    camera.lookAt(eye.clone().add(direction));
    const perspectiveCamera = camera as PerspectiveCamera;
    const aspect = Math.max(0.1, size.width / Math.max(1, size.height));
    perspectiveCamera.aspect = aspect;
    perspectiveCamera.fov = horizontalToVerticalFov(player.viewAngle, aspect);
    camera.updateProjectionMatrix();
  }, [camera, origin.x, origin.y, pitch, player.angle, player.eyeHeight, player.viewAngle, size.height, size.width]);

  return null;
}

function FpsPreviewCard({ player }: { player: Player }) {
  const { setSelectedObjectId, updatePlayer } = useAppStore();
  const [pitch, setPitch] = useState(0);
  const previewRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; pointerType: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    function preventTouchGesture(event: TouchEvent) {
      event.preventDefault();
    }

    preview.addEventListener("touchstart", preventTouchGesture, { passive: false });
    preview.addEventListener("touchmove", preventTouchGesture, { passive: false });
    preview.addEventListener("touchend", preventTouchGesture, { passive: false });
    return () => {
      preview.removeEventListener("touchstart", preventTouchGesture);
      preview.removeEventListener("touchmove", preventTouchGesture);
      preview.removeEventListener("touchend", preventTouchGesture);
    };
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    event.preventDefault();
    setSelectedObjectId(player.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    event.preventDefault();

    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    const isTouch = dragRef.current.pointerType === "touch" || dragRef.current.pointerType === "pen";
    const angleSensitivity = isTouch ? 0.44 : 0.28;
    const pitchSensitivity = isTouch ? 0.26 : 0.18;
    dragRef.current = {
      pointerId: event.pointerId,
      pointerType: dragRef.current.pointerType,
      x: event.clientX,
      y: event.clientY,
    };

    const currentPlayer = useAppStore.getState().scenario.field.players.find((candidate) => candidate.id === player.id);
    updatePlayer(player.id, { angle: (currentPlayer?.angle ?? player.angle) + dx * angleSensitivity });
    setPitch((current) => Math.max(-35, Math.min(35, current - dy * pitchSensitivity)));
  }

  function handlePointerEnd(event: PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
      dragRef.current = null;
    }
  }

  function handlePointerLeave(event: PointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerType === "touch" || dragRef.current?.pointerType === "pen") return;
    handlePointerEnd(event);
  }

  return (
    <aside
      ref={previewRef}
      className="fps-preview"
      aria-label={`${player.name}のFPS視点プレビュー`}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerLeave}
    >
      <div className="fps-preview-head">
        <span>FPS View</span>
        <strong>{player.name}</strong>
      </div>
      <Canvas camera={{ fov: horizontalToVerticalFov(player.viewAngle, 16 / 9), near: 0.05, far: Math.max(80, player.range + 20) }}>
        <color attach="background" args={["#dce8ec"]} />
        <PlayerFpsCamera player={player} pitch={pitch} />
        <SceneObjects viewerPlayer={player} />
      </Canvas>
      <div className="fps-crosshair" aria-hidden="true" />
    </aside>
  );
}

export function FpsPreviews() {
  const { scenario, show3DPreview } = useAppStore();
  const allies = scenario.field.players.filter((player) => player.team === "ally");
  const enemies = scenario.field.players.filter((player) => player.team === "enemy");

  if (!show3DPreview || (allies.length === 0 && enemies.length === 0)) return null;

  return (
    <>
      {enemies.length > 0 && (
        <div className="fps-preview-list fps-preview-list-enemy" aria-label="敵FPS視点プレビュー">
          {enemies.map((player) => (
            <FpsPreviewCard key={player.id} player={player} />
          ))}
        </div>
      )}
      {allies.length > 0 && (
        <div className="fps-preview-list fps-preview-list-ally" aria-label="味方FPS視点プレビュー">
          {allies.map((player) => (
            <FpsPreviewCard key={player.id} player={player} />
          ))}
        </div>
      )}
    </>
  );
}

export function Preview3D() {
  const { scenario, show3DPreview, cameraMode, setCameraMode } = useAppStore();
  const field = scenario.field;

  if (!show3DPreview) return null;

  return (
    <section className="preview-3d">
      <div className="preview-head">
        <h2>3D Preview</h2>
        <select value={cameraMode} onChange={(event) => setCameraMode(event.target.value as typeof cameraMode)}>
          <option value="top_view">Top View</option>
          <option value="third_person">Third Person</option>
          <option value="first_person">First Person</option>
          <option value="enemy_view">Enemy View</option>
          <option value="peek_preview">Peek Preview</option>
        </select>
      </div>
      <Canvas camera={{ position: [field.width / 2, 13, field.height + 7], fov: 48, near: 0.1, far: 100 }}>
        <SceneObjects />
      </Canvas>
    </section>
  );
}
