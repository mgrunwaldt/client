import "./field-assets";

import {
  ContactShadows,
  Html,
  OrthographicCamera,
  Preload,
  Sky,
  useProgress,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import {
  type MouseEvent as ReactMouseEvent,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import * as THREE from "three";

import playersData from "../../../data/players.json";
import { Ball, type BallAimDraft } from "../../components/models/in-game/Ball";
import GameModel from "../../components/models/in-game/GameModel";
import Stadium from "../../components/models/in-game/Stadium";
import {
  type BackendFieldPlayer,
  type BackendMatchResponse,
  createMatchCommand,
  processBackendMatchAction,
} from "../../lib/backend-match";
import { useMatchSessionStore } from "../../match/session-store";

const FIELD_Y = 111;
const BALL_Y = 111.25;
const LATERAL_SCALE = 0.72;
const LENGTH_SCALE = 2.8;
const PLAYER_RENDER_Z_OFFSET = -13.5;
const VISIBLE_FIELD_CENTER_Y = 28.5;
const STADIUM_Z_CALIBRATION = -10;
const OPPONENT_NEAR_BALL_DISTANCE = 10;
const PLAYER_TRAJECTORY_TRACK_DISTANCE = 10;
const RECEIVER_CONTROL_BALL_OFFSET_Y = 1.1;
const PLAYER_TRACK_TURN_SPEED = 9;
const DEFAULT_STRIKE_POINT = { x: 74, y: 58 };
const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 358, 234];
const DEFAULT_CAMERA_ROTATION: [number, number, number] = [-0.7, 0, 0];
const DEFAULT_CAMERA_ZOOM = 8;
const DEFAULT_CAMERA_WINDOW = {
  maxFieldY: 30,
  minFieldX: 25,
  maxFieldX: 75,
};
const DYNAMIC_PLAYER_SCREEN_NDC_Y = -0.6;

function fieldToWorld(x: number, y: number): [number, number, number] {
  return [
    (x - 50) * LATERAL_SCALE,
    FIELD_Y,
    (y - VISIBLE_FIELD_CENTER_Y) * LENGTH_SCALE + STADIUM_Z_CALIBRATION,
  ];
}

function renderWorldToField(x: number, z: number) {
  return {
    x: clamp(x / LATERAL_SCALE + 50, 0, 100),
    y: clamp(
      (z - PLAYER_RENDER_Z_OFFSET - STADIUM_Z_CALIBRATION) / LENGTH_SCALE +
        VISIBLE_FIELD_CENTER_Y,
      0,
      100,
    ),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distanceInField(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function roundPoint(value: number) {
  return Math.round(value * 10) / 10;
}

function vectorPower(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const magnitude = Math.sqrt(dx * dx + dy * dy);
  return clamp(Math.round(magnitude * 2.4), 10, 100);
}

function contactCurve(point: { x: number; y: number }) {
  return clamp(Math.round((point.x - 50) * 2), -100, 100);
}

function inferKickIntent(
  ballFieldPosition: { x: number; y: number },
  vector: { x: number; y: number },
  power: number,
) {
  if (vector.x <= 1 || vector.x >= 99 || vector.y <= 1 || vector.y >= 99) {
    return "OUT";
  }
  if (vector.y <= 12 && vector.x >= 36 && vector.x <= 64 && power >= 28) {
    return "SHOT_ON_GOAL";
  }
  if (vector.y <= 28) {
    return "CROSS";
  }
  if (vector.y < ballFieldPosition.y - 10) {
    return "DANGEROUS_PASS";
  }
  if (vector.y < ballFieldPosition.y) {
    return "FORWARD_PASS";
  }
  return "KEEP_BALL";
}

function inferSelectionQuality(
  power: number,
  curve: number,
  intentHint: string,
) {
  const curvePenalty = Math.min(Math.abs(curve) * 0.25, 18);
  const powerBonus = Math.max(0, 24 - Math.abs(power - 72));
  const targetBonus = ["SHOT_ON_GOAL", "DANGEROUS_PASS", "CROSS"].includes(
    intentHint,
  )
    ? 6
    : 3;
  return clamp(
    Math.round(58 + powerBonus * 0.4 - curvePenalty * 0.3 + targetBonus),
    45,
    88,
  );
}

function buildKickPayload(
  releasedAimDraft: BallAimDraft,
  strikePoint: { x: number; y: number },
  ballFieldPosition: { x: number; y: number },
) {
  const endFieldPoint = renderWorldToField(
    releasedAimDraft.dragStart.x + releasedAimDraft.shotVector.x,
    releasedAimDraft.dragStart.z + releasedAimDraft.shotVector.z,
  );
  const power = vectorPower(ballFieldPosition, endFieldPoint);
  const curve = contactCurve(strikePoint);
  const intentHint = inferKickIntent(ballFieldPosition, endFieldPoint, power);

  return {
    choice: "KICK",
    end_x: roundPoint(endFieldPoint.x),
    end_y: roundPoint(endFieldPoint.y),
    contact_x: roundPoint(strikePoint.x),
    contact_y: roundPoint(strikePoint.y),
    power,
    curve,
    selection_quality: inferSelectionQuality(power, curve, intentHint),
    intent_hint: intentHint,
    seed: Date.now(),
  };
}

function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function sampleFlightPath(
  path: Array<{ x: number; y: number; z: number; t: number }>,
  t: number,
) {
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (t <= current.t) {
      const span = current.t - previous.t || 1;
      const alpha = (t - previous.t) / span;
      return {
        x: previous.x + (current.x - previous.x) * alpha,
        y: previous.y + (current.y - previous.y) * alpha,
      };
    }
  }

  const lastPoint = path[path.length - 1];
  return lastPoint ? { x: lastPoint.x, y: lastPoint.y } : null;
}

function minDistanceToFlightPath(
  player: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
) {
  let best = Number.POSITIVE_INFINITY;
  path.forEach((point) => {
    best = Math.min(best, distanceInField(player, point));
  });
  return best;
}

function resolveControlledBallPosition(
  response: BackendMatchResponse,
  fallbackPoint: { x: number; y: number } | null,
) {
  const decisionResult = response.decision_result;
  if (
    decisionResult?.flight_outcome === "TEAMMATE_CONTROL" &&
    decisionResult.receiver
  ) {
    return {
      x: decisionResult.receiver.x,
      y: Math.min(
        100,
        decisionResult.receiver.y + RECEIVER_CONTROL_BALL_OFFSET_Y,
      ),
    };
  }

  return fallbackPoint;
}

type StagedKickResult = {
  response: BackendMatchResponse;
  submittedPayload: ReturnType<typeof buildKickPayload>;
};

function shouldUseDefaultCamera(player: BackendFieldPlayer | null) {
  if (!player) {
    return true;
  }

  return (
    player.y <= DEFAULT_CAMERA_WINDOW.maxFieldY &&
    player.x >= DEFAULT_CAMERA_WINDOW.minFieldX &&
    player.x <= DEFAULT_CAMERA_WINDOW.maxFieldX
  );
}

function projectPointAtCameraZ(
  camera: THREE.OrthographicCamera,
  point: THREE.Vector3,
  x: number,
  z: number,
) {
  camera.position.set(x, DEFAULT_CAMERA_POSITION[1], z);
  camera.rotation.set(...DEFAULT_CAMERA_ROTATION);
  camera.zoom = DEFAULT_CAMERA_ZOOM;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return point.clone().project(camera).y;
}

function findDynamicCameraZ(
  baseCamera: THREE.OrthographicCamera,
  playerWorldPosition: [number, number, number],
) {
  const probe = baseCamera.clone() as THREE.OrthographicCamera;
  probe.left = baseCamera.left;
  probe.right = baseCamera.right;
  probe.top = baseCamera.top;
  probe.bottom = baseCamera.bottom;
  probe.near = baseCamera.near;
  probe.far = baseCamera.far;

  const playerPoint = new THREE.Vector3(...playerWorldPosition);
  let bestZ = DEFAULT_CAMERA_POSITION[2];
  let bestDistance = Number.POSITIVE_INFINITY;
  let previousZ = playerWorldPosition[2] - 800;
  let previousDelta =
    projectPointAtCameraZ(
      probe,
      playerPoint,
      playerWorldPosition[0],
      previousZ,
    ) - DYNAMIC_PLAYER_SCREEN_NDC_Y;
  let bracket: [number, number] | null = null;

  const updateBest = (z: number, delta: number) => {
    const distance = Math.abs(delta);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestZ = z;
    }
  };

  updateBest(previousZ, previousDelta);

  for (
    let z = playerWorldPosition[2] - 760;
    z <= playerWorldPosition[2] + 800;
    z += 40
  ) {
    const delta =
      projectPointAtCameraZ(probe, playerPoint, playerWorldPosition[0], z) -
      DYNAMIC_PLAYER_SCREEN_NDC_Y;
    updateBest(z, delta);

    if (previousDelta === 0 || delta === 0 || previousDelta * delta < 0) {
      bracket = [previousZ, z];
      break;
    }

    previousZ = z;
    previousDelta = delta;
  }

  if (!bracket) {
    return bestZ;
  }

  let [low, high] = bracket;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    const delta =
      projectPointAtCameraZ(probe, playerPoint, playerWorldPosition[0], mid) -
      DYNAMIC_PLAYER_SCREEN_NDC_Y;
    updateBest(mid, delta);

    if (delta === 0) {
      return mid;
    }

    const lowDelta =
      projectPointAtCameraZ(probe, playerPoint, playerWorldPosition[0], low) -
      DYNAMIC_PLAYER_SCREEN_NDC_Y;
    if (lowDelta * delta <= 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return bestZ;
}

function FieldCameraController({
  legendPlayer,
  legendWorldPosition,
  cameraLocked,
}: {
  legendPlayer: BackendFieldPlayer | null;
  legendWorldPosition: [number, number, number] | null;
  cameraLocked: boolean;
}) {
  const camera = useThree((state) => state.camera) as THREE.OrthographicCamera;
  const size = useThree((state) => state.size);

  useEffect(() => {
    if (cameraLocked) {
      return;
    }

    camera.rotation.set(...DEFAULT_CAMERA_ROTATION);
    camera.zoom = DEFAULT_CAMERA_ZOOM;

    if (!legendWorldPosition || shouldUseDefaultCamera(legendPlayer)) {
      camera.position.set(...DEFAULT_CAMERA_POSITION);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      return;
    }

    const dynamicCameraZ = findDynamicCameraZ(camera, legendWorldPosition);
    camera.position.set(
      legendWorldPosition[0],
      DEFAULT_CAMERA_POSITION[1],
      dynamicCameraZ,
    );
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [
    camera,
    cameraLocked,
    legendPlayer,
    legendWorldPosition,
    size.height,
    size.width,
  ]);

  return null;
}

function rotationTowardsFieldTarget(
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  const [sourceX, , sourceZ] = fieldToWorld(source.x, source.y);
  const [targetX, , targetZ] = fieldToWorld(target.x, target.y);
  return Math.atan2(targetX - sourceX, targetZ - sourceZ);
}

function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildModelVariant(player: BackendFieldPlayer, isTeammate: boolean) {
  const variants = playersData as Array<{
    body_type: 0 | 1 | 2;
    skin_color: 0 | 1 | 2;
    beard_type: 0 | 1;
    hair_type: 0 | 1;
    hair_color: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    visor_type: 0 | 1 | 2;
    visor_color: 0 | 1 | 2;
  }>;
  const seed = hashString(player.id);
  const variant = variants[seed % variants.length];
  const isGoalKeeper = player.role === "GK";

  return {
    ...variant,
    team_id: isTeammate ? 1 : 2,
    goalkeeper: {
      isGoalKeeper,
      type: (isTeammate ? 0 : 1) as 0 | 1,
    },
  };
}

function PlayerLabel({
  player,
  isTeammate,
  worldPosition,
}: {
  player: BackendFieldPlayer;
  isTeammate: boolean;
  worldPosition: [number, number, number];
}) {
  if (!player.is_legend) {
    return null;
  }

  return (
    <Html
      position={[worldPosition[0], FIELD_Y + 0.5, worldPosition[2]]}
      center
      className={`translate-y-8 rounded-full px-2 py-1 text-[10px] font-bold tracking-[0.18em] uppercase ${
        isTeammate ? "bg-black/65 text-[#d8ff6f]" : "bg-black/65 text-[#9fd1ff]"
      }`}
    >
      YOU
    </Html>
  );
}

function FieldLoadingOverlay({
  visible,
  progress,
}: {
  visible: boolean;
  progress: number;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-linear-to-b from-[#0f5f7a] via-[#0f7a69] to-[#0a4739]">
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22%_16%] opacity-35" />
      <div className="absolute inset-x-[14%] top-[12%] h-[16%] rounded-b-[2.5rem] border-4 border-t-0 border-cyan-200/35" />
      <div className="absolute inset-x-[24%] top-[4.5%] h-[5.5%] rounded-sm border-[6px] border-slate-200/70 bg-slate-300/35" />
      <div className="absolute inset-x-[30%] top-[34%] h-px bg-cyan-200/25" />
      <div className="absolute inset-x-[12%] top-[66%] h-[18%] rounded-t-[7rem] border border-cyan-200/18" />
      <div className="absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-slate-950/92 via-slate-950/70 to-transparent px-6 py-8 text-white">
        <div className="rounded-full bg-black/45 px-3 py-1 text-xs font-bold tracking-[0.24em] text-cyan-300 uppercase">
          Loading Field
        </div>
        <div className="mt-3 rounded-2xl bg-black/45 px-4 py-4 backdrop-blur-sm">
          <p className="text-lg font-bold">Preparing match scene</p>
          <div className="mt-3 h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-linear-to-r from-cyan-300 via-sky-400 to-emerald-300 transition-[width] duration-300"
              style={{ width: `${Math.max(10, Math.min(100, progress))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-linear-to-b from-[#0c5871] via-[#11816f] to-[#0b4a3c]">
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22%_16%] opacity-30" />
      <div className="absolute inset-x-[14%] top-[12%] h-[16%] rounded-b-[2.5rem] border-4 border-t-0 border-cyan-200/35" />
      <div className="absolute inset-x-[24%] top-[4.5%] h-[5.5%] rounded-sm border-[6px] border-slate-200/70 bg-slate-300/35" />
      <div className="absolute inset-x-[18%] top-[28%] h-px bg-cyan-200/20" />
      <div className="absolute inset-x-[10%] top-[60%] h-[26%] rounded-t-[10rem] border border-cyan-200/16" />
    </div>
  );
}

function BackendPlayerModel({
  player,
  isTeammate,
  ballFieldPosition,
  stagedDecisionResult,
  isResultAnimating,
}: {
  player: BackendFieldPlayer;
  isTeammate: boolean;
  ballFieldPosition: { x: number; y: number };
  stagedDecisionResult?: BackendMatchResponse["decision_result"];
  isResultAnimating: boolean;
}) {
  const worldPosition = fieldToWorld(player.x, player.y);
  const renderWorldPosition: [number, number, number] = [
    worldPosition[0],
    worldPosition[1],
    worldPosition[2] + PLAYER_RENDER_Z_OFFSET,
  ];
  const modelVariant = buildModelVariant(player, isTeammate);
  const stagedFlightPath = stagedDecisionResult?.flight_path || [];
  const involvedPlayerId =
    stagedDecisionResult?.receiver?.id ||
    stagedDecisionResult?.interceptor?.id ||
    null;
  const tracksTrajectory =
    stagedFlightPath.length > 0 &&
    minDistanceToFlightPath(player, stagedFlightPath) <=
      PLAYER_TRAJECTORY_TRACK_DISTANCE;
  const tracksBallNow =
    distanceInField(player, ballFieldPosition) <= OPPONENT_NEAR_BALL_DISTANCE;
  const shouldTrackBall =
    Boolean(stagedDecisionResult) &&
    (tracksTrajectory || tracksBallNow || player.id === involvedPlayerId);
  const opponentNearBall =
    !isTeammate &&
    distanceInField(player, ballFieldPosition) <= OPPONENT_NEAR_BALL_DISTANCE;
  const backendFacingTarget =
    typeof player.facing_target_x === "number" &&
    typeof player.facing_target_y === "number"
      ? { x: player.facing_target_x, y: player.facing_target_y }
      : null;
  const rotationY =
    shouldTrackBall && (isResultAnimating || player.id === involvedPlayerId)
      ? rotationTowardsFieldTarget(player, ballFieldPosition)
      : backendFacingTarget
        ? rotationTowardsFieldTarget(player, backendFacingTarget)
        : isTeammate
          ? Math.PI
          : opponentNearBall
            ? rotationTowardsFieldTarget(player, ballFieldPosition)
            : player.role === "GK"
              ? 0
              : player.y < ballFieldPosition.y
                ? 0
                : Math.PI;
  const groupRef = useRef<THREE.Group>(null);
  const currentRotationRef = useRef(rotationY);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const current = currentRotationRef.current;
    const target = rotationY;
    const deltaAngle = normalizeAngle(target - current);
    const step = Math.min(1, delta * PLAYER_TRACK_TURN_SPEED);
    const next = current + deltaAngle * step;
    currentRotationRef.current = normalizeAngle(next);
    group.rotation.y = currentRotationRef.current;
  });

  return (
    <>
      <group ref={groupRef} position={renderWorldPosition}>
        <GameModel
          {...modelVariant}
          isTeamMate={isTeammate}
          animationName="DefensiveIdle"
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          scale={0.1}
          targetPosition={null}
          renderOnly={true}
        />
      </group>
      <PlayerLabel
        player={player}
        isTeammate={isTeammate}
        worldPosition={renderWorldPosition}
      />
    </>
  );
}

export default function GameScene({ active = true }: { active?: boolean }) {
  const navigate = useNavigate();
  const {
    active: assetsActive,
    progress: assetsProgress,
    loaded: assetsLoaded,
    total: assetsTotal,
  } = useProgress();
  const match = useMatchSessionStore((state) => state.match);
  const pendingAction = useMatchSessionStore((state) => state.pendingAction);
  const fieldState = useMatchSessionStore((state) => state.fieldState);
  const myTeam = useMatchSessionStore((state) => state.myTeam);
  const opponentTeam = useMatchSessionStore((state) => state.opponentTeam);
  const setActionResponse = useMatchSessionStore(
    (state) => state.setActionResponse,
  );
  const setLoading = useMatchSessionStore((state) => state.setLoading);
  const setError = useMatchSessionStore((state) => state.setError);
  const pendingCommand = useMatchSessionStore((state) => state.pendingCommand);
  const retainPendingCommand = useMatchSessionStore(
    (state) => state.retainPendingCommand,
  );
  const [releasedAimDraft, setReleasedAimDraft] = useState<BallAimDraft | null>(
    null,
  );
  const [strikePoint, setStrikePoint] = useState(DEFAULT_STRIKE_POINT);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stagedKickResult, setStagedKickResult] =
    useState<StagedKickResult | null>(null);
  const [animatedBallFieldPosition, setAnimatedBallFieldPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isResultAnimating, setIsResultAnimating] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const stagedDecisionResult = stagedKickResult?.response.decision_result;
  const hasImmediateFollowUpFieldState =
    Boolean(stagedKickResult?.response.pending_action?.field_state) &&
    stagedKickResult?.response.pending_action?.minute ===
      (stagedKickResult?.response.prev_time ??
        pendingAction?.minute ??
        match?.current_time ??
        0);
  const stagedFieldState =
    !isResultAnimating &&
    hasImmediateFollowUpFieldState &&
    stagedKickResult?.response.pending_action?.field_state
      ? stagedKickResult.response.pending_action.field_state
      : null;
  const displayFieldState = stagedFieldState || fieldState;
  const myPlayers = displayFieldState?.my_team_positions || [];
  const opponentPlayers = displayFieldState?.opponent_positions || [];
  const legendPlayer =
    myPlayers.find((player) => player.is_legend) ||
    (displayFieldState?.legend_player_id
      ? myPlayers.find(
          (player) => player.id === displayFieldState.legend_player_id,
        ) || null
      : null);
  const baseBallFieldPosition = displayFieldState
    ? { x: displayFieldState.ball_x, y: displayFieldState.ball_y }
    : { x: 50, y: VISIBLE_FIELD_CENTER_Y };
  const ballFieldPosition = animatedBallFieldPosition || baseBallFieldPosition;
  const [ballX, , logicalBallZ] = displayFieldState
    ? fieldToWorld(ballFieldPosition.x, ballFieldPosition.y)
    : [0, BALL_Y, 0];
  const ballZ = logicalBallZ + PLAYER_RENDER_Z_OFFSET;
  const legendWorldPosition = legendPlayer
    ? (() => {
        const [x, y, z] = fieldToWorld(legendPlayer.x, legendPlayer.y);
        return [x, y, z + PLAYER_RENDER_Z_OFFSET] as [number, number, number];
      })()
    : null;
  const canAim =
    !stagedKickResult &&
    !assetsActive &&
    pendingAction?.action_team === "MY_TEAM" &&
    pendingAction?.scene_type !== "DRIBBLE" &&
    pendingAction?.scene_type !== undefined;
  const showFieldLoadingOverlay =
    assetsActive || (assetsTotal > 0 && assetsLoaded < assetsTotal);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const clearStagedKickResult = () => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setStagedKickResult(null);
    setAnimatedBallFieldPosition(null);
    setIsResultAnimating(false);
  };

  const startBallPlayback = (
    response: BackendMatchResponse,
    submittedPayload: ReturnType<typeof buildKickPayload>,
  ) => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    const flightPath = response.decision_result?.flight_path;
    if (Array.isArray(flightPath) && flightPath.length > 1) {
      const startedAt = performance.now();
      const durationMs = Math.max(
        500,
        flightPath[flightPath.length - 1].t * 1000,
      );
      setIsResultAnimating(true);

      const tick = (now: number) => {
        const elapsed = now - startedAt;
        const progressMs = Math.min(durationMs, elapsed);
        const point = sampleFlightPath(flightPath, progressMs / 1000);
        if (point) {
          setAnimatedBallFieldPosition(point);
        }

        if (progressMs < durationMs) {
          animationFrameRef.current = window.requestAnimationFrame(tick);
        } else {
          animationFrameRef.current = null;
          const rawFinalPoint = response.decision_result?.final_point
            ? {
                x: response.decision_result.final_point.x,
                y: response.decision_result.final_point.y,
              }
            : point;
          const resolvedFinalPoint = resolveControlledBallPosition(
            response,
            rawFinalPoint || null,
          );
          setAnimatedBallFieldPosition(resolvedFinalPoint || null);
          setIsResultAnimating(false);
        }
      };

      animationFrameRef.current = window.requestAnimationFrame(tick);
      return;
    }

    const start = baseBallFieldPosition;
    const end = { x: submittedPayload.end_x, y: submittedPayload.end_y };
    const duration = Math.max(
      650,
      Math.min(1400, 420 + submittedPayload.power * 7),
    );
    const lift = Math.max(6, Math.min(18, distanceBetween(start, end) * 0.12));
    const startedAt = performance.now();
    setIsResultAnimating(true);

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) * (1 - progress);
      setAnimatedBallFieldPosition({
        x: start.x + (end.x - start.x) * eased,
        y:
          start.y +
          (end.y - start.y) * eased -
          Math.sin(Math.PI * eased) * lift,
      });

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        animationFrameRef.current = null;
        const resolvedFinalPoint = resolveControlledBallPosition(response, end);
        setAnimatedBallFieldPosition(resolvedFinalPoint || null);
        setIsResultAnimating(false);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
  };

  const handleAimRelease = (draft: BallAimDraft) => {
    setSubmitError(null);
    setReleasedAimDraft(draft);
    setStrikePoint(DEFAULT_STRIKE_POINT);
  };

  const handleStrikePanelClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setStrikePoint({
      x: clamp(x, 8, 92),
      y: clamp(y, 8, 92),
    });
  };

  const handleKick = async () => {
    if (!match?.id || !pendingAction || !releasedAimDraft) {
      return;
    }

    const payload = buildKickPayload(
      releasedAimDraft,
      strikePoint,
      ballFieldPosition,
    );

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setLoading(true);
      setError(null);

      const command =
        pendingCommand?.operation === "action" &&
        pendingCommand.matchId === match.id &&
        pendingCommand.actionId === pendingAction.id
          ? pendingCommand
          : createMatchCommand(
              "action",
              {
                match_id: match.id,
                action_id: pendingAction.id,
                match_decision: payload,
              },
              {
                matchId: match.id,
                revision: match.revision ?? null,
                actionId: pendingAction.id,
              },
            );
      retainPendingCommand(command);
      const response = await processBackendMatchAction(
        match,
        pendingAction.id,
        payload,
        command,
      );
      setReleasedAimDraft(null);
      setStagedKickResult({
        response,
        submittedPayload: payload,
      });
      setLoading(false);
      startBallPlayback(response, payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit kick.";
      setSubmitError(message);
      setError(message);
      setLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextAction = () => {
    if (!match?.id || !stagedKickResult) {
      return;
    }

    setActionResponse(stagedKickResult.response);
    clearStagedKickResult();
    navigate(`/match/${match.id}`);
  };

  const resultDescription =
    stagedKickResult?.response.decision_result?.description ||
    stagedKickResult?.response.events?.[0]?.description ||
    "Action resolved.";
  const resultMinute =
    stagedKickResult?.response.prev_time ??
    pendingAction?.minute ??
    match?.current_time ??
    0;

  return (
    <div
      data-testid="game-field"
      data-player-count={myPlayers.length + opponentPlayers.length}
      className={`fixed inset-0 overflow-hidden bg-[#0a4739] ${
        active ? "z-40 opacity-100" : "pointer-events-none -z-10 opacity-0"
      }`}
      aria-hidden={!active}
    >
      <FieldBackdrop />
      <div className="absolute right-0 bottom-0 left-0 z-20 flex flex-col gap-2 p-4 text-white">
        <div className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold tracking-[0.24em] text-cyan-300 uppercase">
          {pendingAction?.title || "Field"}
        </div>
        <div className="rounded-xl bg-black/50 px-4 py-2 text-sm text-white/90 backdrop-blur-sm">
          <div className="font-bold">
            {myTeam?.name || "My Team"} vs {opponentTeam?.name || "Opponent"}
          </div>
          <div>{pendingAction?.description || "Waiting for field state."}</div>
        </div>
        {!fieldState && (
          <div className="max-w-sm rounded-xl bg-red-950/65 px-4 py-3 text-sm text-red-100 backdrop-blur-sm">
            No backend field state is available for this screen yet.
          </div>
        )}
      </div>

      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        dpr={[1, 2]}
        style={{ touchAction: "none", background: "transparent" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <OrthographicCamera
          makeDefault
          position={DEFAULT_CAMERA_POSITION}
          rotation={DEFAULT_CAMERA_ROTATION}
          zoom={DEFAULT_CAMERA_ZOOM}
          near={0.1}
          far={1000}
        />
        <FieldCameraController
          legendPlayer={legendPlayer}
          legendWorldPosition={legendWorldPosition}
          cameraLocked={Boolean(stagedKickResult)}
        />

        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} colliders={"ball"}>
            <Sky sunPosition={[10, 10, 0]} />
            <ContactShadows
              frames={1}
              scale={10}
              position={[0, -2, 0]}
              blur={4}
              opacity={0.2}
            />
            <Stadium position={[0, 0, 0]} scale={10} rotation={[0, 0, 0]} />

            <Ball
              position={[ballX, BALL_Y, ballZ]}
              interactive={false}
              renderOnly={true}
              aimEnabled={Boolean(canAim && !releasedAimDraft)}
              onAimRelease={handleAimRelease}
            />

            {myPlayers.map((player) => (
              <BackendPlayerModel
                key={player.id}
                player={player}
                isTeammate={true}
                ballFieldPosition={ballFieldPosition}
                stagedDecisionResult={stagedDecisionResult}
                isResultAnimating={isResultAnimating}
              />
            ))}
            {opponentPlayers.map((player) => (
              <BackendPlayerModel
                key={player.id}
                player={player}
                isTeammate={false}
                ballFieldPosition={ballFieldPosition}
                stagedDecisionResult={stagedDecisionResult}
                isResultAnimating={isResultAnimating}
              />
            ))}
            <Preload all />
          </Physics>
        </Suspense>
      </Canvas>
      <FieldLoadingOverlay
        visible={showFieldLoadingOverlay}
        progress={assetsProgress}
      />
      {releasedAimDraft && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/18 px-4 py-6 backdrop-blur-[1px]">
          <div className="w-full max-w-sm rounded-[2rem] border border-cyan-300/45 bg-linear-to-b from-cyan-400/18 via-slate-950/88 to-[#14235c]/92 p-4 shadow-[0_0_40px_rgba(34,211,238,0.18)]">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-[10px] font-bold tracking-[0.32em] text-cyan-200/80 uppercase">
                  Strike Point
                </p>
                <p className="text-sm font-semibold text-white">
                  Choose where to hit the ball
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/70"
                onClick={() => {
                  setReleasedAimDraft(null);
                  setSubmitError(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="rounded-[1.6rem] border border-cyan-200/40 bg-linear-to-b from-cyan-300/12 via-[#14235c]/78 to-[#0f1738] p-4">
              <div
                className="relative mx-auto aspect-square w-full max-w-[260px] cursor-crosshair rounded-full border-2 border-cyan-300/70 bg-radial-[circle_at_35%_35%] from-cyan-100/95 via-sky-400/28 to-[#091132] shadow-[0_0_30px_rgba(56,189,248,0.28)]"
                onClick={handleStrikePanelClick}
              >
                <div className="absolute inset-[10%] rounded-full border border-cyan-200/18" />
                <div className="absolute inset-[23%] rounded-full border border-cyan-200/12" />
                <div className="absolute top-[10%] left-1/2 h-[80%] w-px -translate-x-1/2 bg-cyan-100/12" />
                <div className="absolute top-1/2 left-[10%] h-px w-[80%] -translate-y-1/2 bg-cyan-100/12" />
                <div
                  className="absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-orange-400/95 shadow-[0_0_22px_rgba(251,146,60,0.65)]"
                  style={{
                    left: `${strikePoint.x}%`,
                    top: `${strikePoint.y}%`,
                  }}
                >
                  <div className="absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-200/90" />
                  <div className="absolute top-1/2 left-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-amber-200/90" />
                  <div className="absolute top-1/2 left-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 bg-amber-200/90" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/72">
                <div className="rounded-2xl bg-black/22 px-3 py-2">
                  Pull power:{" "}
                  {Math.round(releasedAimDraft.normalizedPower * 100)}%
                </div>
                <div className="rounded-2xl bg-black/22 px-3 py-2">
                  Contact: {Math.round(strikePoint.x)},{" "}
                  {Math.round(strikePoint.y)}
                </div>
              </div>
              {submitError && (
                <div className="mt-3 rounded-2xl border border-red-400/25 bg-red-950/40 px-3 py-2 text-xs text-red-100">
                  {submitError}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              className="mt-4 w-full rounded-2xl bg-linear-to-b from-amber-300 via-orange-400 to-red-500 px-4 py-3 text-center text-2xl font-black tracking-[0.12em] text-white uppercase shadow-[0_10px_26px_rgba(249,115,22,0.42)]"
              onClick={handleKick}
            >
              {isSubmitting ? "Kicking..." : "Kick"}
            </button>
          </div>
        </div>
      )}
      {stagedKickResult && (
        <div className="absolute inset-x-0 bottom-0 z-30 p-4 text-white">
          <div className="mx-auto w-full max-w-md rounded-[1.8rem] border border-cyan-300/30 bg-slate-950/88 p-4 shadow-[0_0_35px_rgba(34,211,238,0.18)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.28em] text-cyan-200/75 uppercase">
                  Scene Result
                </p>
                <p className="mt-1 text-sm font-semibold text-white/92">
                  {resultMinute}' · {pendingAction?.scene_type || "ACTION"}
                </p>
              </div>
              <div className="rounded-full bg-cyan-400/12 px-3 py-1 text-[10px] font-bold tracking-[0.24em] text-cyan-200 uppercase">
                {isResultAnimating ? "In Motion" : "Resolved"}
              </div>
            </div>

            <p className="mt-3 text-base leading-tight font-semibold text-white">
              {resultDescription}
            </p>

            <button
              type="button"
              onClick={handleNextAction}
              disabled={isResultAnimating}
              className="mt-4 w-full rounded-2xl border border-cyan-300/35 bg-cyan-400/10 px-4 py-3 text-center text-sm font-black tracking-[0.2em] text-cyan-100 uppercase disabled:cursor-not-allowed disabled:opacity-45"
            >
              Next Action
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
