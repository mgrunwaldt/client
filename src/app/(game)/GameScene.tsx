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
  Component,
  type ReactNode,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import * as THREE from "three";

import playersData from "../../../data/players.json";
import { Ball, type BallAimDraft } from "../../components/models/in-game/Ball";
import GameModel from "../../components/models/in-game/GameModel";
import Stadium from "../../components/models/in-game/Stadium";
import {
  type BackendFieldPlayer,
  type BackendFieldState,
  type BackendMatchResponse,
  createMatchCommand,
  fetchBackendMatch,
  type MatchCommand,
  processBackendMatchAction,
} from "../../lib/backend-match";
import {
  type AutomaticFinishPresentation,
  automaticFinishPresentation,
} from "../../match/automatic-finish-presentation";
import { BALL_MODEL_REGISTRATION } from "../../match/ball-registration";
import {
  createDribbleSubmissionGate,
  type DribbleDecision,
  dribblePresentationAtSecond,
  type DribblePresentationState,
  parseDribblePattern,
  selectDribbleDefenderTemplate,
} from "../../match/dribble-input";
import {
  createFieldCameraPose,
  type FieldCameraPose,
} from "../../match/field-camera";
import {
  reportFieldPresentationReadiness,
  reportFieldPresented,
} from "../../match/field-presentation-readiness";
import {
  createFieldTransform,
  FIELD_WORLD_SCALE,
  type FieldViewWindow,
  fixedAttackingView,
  followLegendView,
  worldVectorToFieldAim,
} from "../../match/field-transform";
import { deriveFieldVisualPhase } from "../../match/field-visual-phase";
import {
  buildCanonicalKickDecision,
  createKickSubmissionGate,
  isCanonicalKickScene,
  parseKickControlEnvelope,
} from "../../match/kick-input";
import {
  type KickFailurePresentation,
  kickFailurePresentation,
} from "../../match/kick-outcome-presentation";
import {
  advancePlayerRotation,
  minDistanceToFieldPath,
  rotationTowardsFieldTarget,
} from "../../match/player-orientation";
import { PLAYER_MODEL_REGISTRATION } from "../../match/player-registration";
import {
  createRandomEventDecision,
  createRandomEventSubmissionGate,
  isRandomEventAction,
  isRandomEventSceneType,
  parseRandomEventAction,
} from "../../match/random-event";
import {
  authoritativeContinuationFieldState,
  authoritativeFacingTarget,
} from "../../match/receiver-control";
import {
  beginHydration,
  createReconnectHydrationGate,
  isRetryableHydrationFailure,
  requestReconnectHydration,
  settleHydration,
} from "../../match/reconnect-hydration";
import { shouldAdoptResidentFieldScene } from "../../match/resident-field-scene";
import {
  isDebugResultContinuationEnabled,
  RESULT_HOLD_MS,
  shouldContinueResultDirectlyToField,
} from "../../match/result-continuation";
import {
  actionCommandMatchesDecision,
  matchCommandsExactly,
} from "../../match/session-recovery";
import { useMatchSessionStore } from "../../match/session-store";
import {
  authoritativeTrajectoryPlayback,
  completeAuthoritativeFlightPath,
  sampleAuthoritativeFlightPath,
  trajectoryPlaybackDurationMs,
} from "../../match/trajectory-playback";
import {
  outcomeFeedbackCue,
  playGameFeedback,
} from "../../platform/game-feedback";
import { BallAimSurface } from "./BallAimSurface";
import { DribbleControls } from "./DribbleControls";
import { KickContactDialog } from "./KickContactDialog";
import {
  RandomEventResultDetails,
  RandomEventScene,
  UnsupportedEventRecovery,
} from "./RandomEventScene";
import {
  canvasCoversViewport,
  createRenderReadinessState,
  fieldRenderSceneKey,
  invalidateRenderReadiness,
  observeRenderFrame,
} from "./render-readiness";

const FIELD_SURFACE_Y = 0;
const DEFAULT_BALL_RADIUS_M = BALL_MODEL_REGISTRATION.radiusM;
const DRIBBLE_PLAYER_MODEL_SCALE = PLAYER_MODEL_REGISTRATION.legacyVisualScale;
const OPPONENT_NEAR_BALL_DISTANCE_M = 7;
const PLAYER_TRAJECTORY_TRACK_DISTANCE_M = 7;
const PLAYER_TRACK_TURN_SPEED = 9;
const DEFAULT_STRIKE_CONTACT = { x: 0, y: 0 };
const DEFAULT_CAMERA_WINDOW = {
  maxFieldY: 30,
  minFieldX: 25,
  maxFieldX: 75,
};
const E2E_RENDER_PROBES =
  import.meta.env.VITE_E2E_MATCH_SESSION_BRIDGE === "true";
const KICK_DEVELOPMENT_DIAGNOSTICS =
  import.meta.env.DEV &&
  import.meta.env.VITE_OVERGOAL_KICK_DIAGNOSTICS === "true";
const WORLD_FIELD_TRANSFORM = createFieldTransform({
  viewport: { width: 1, height: 1 },
  view: fixedAttackingView(),
});

type FieldCanvasErrorBoundaryProps = {
  children: ReactNode;
  onError: (error: unknown) => void;
  resetKey: string;
};

class FieldCanvasErrorBoundary extends Component<
  FieldCanvasErrorBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  componentDidUpdate(previousProps: Readonly<FieldCanvasErrorBoundaryProps>) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function fieldToWorld(x: number, y: number, z = 0): [number, number, number] {
  const world = WORLD_FIELD_TRANSFORM.fieldToWorld({ x, y, z });
  return [world.x, world.y, world.z];
}

function fieldAimForDraft(draft: BallAimDraft) {
  const aim = worldVectorToFieldAim(draft.shotVector);
  if (!aim) {
    throw new Error("A released kick needs a horizontal field direction.");
  }
  return aim;
}

function distanceInFieldMeters(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = (a.x - b.x) * FIELD_WORLD_SCALE.x;
  const dy = (a.y - b.y) * FIELD_WORLD_SCALE.z;
  return Math.hypot(dx, dy);
}

function minDistanceToFlightPath(
  player: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
) {
  return minDistanceToFieldPath(player, path);
}

type StagedKickResult = {
  response: BackendMatchResponse;
  sceneType: string;
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

function FieldCameraController({
  pose,
  cameraLocked,
  framingKey,
}: {
  pose: FieldCameraPose;
  cameraLocked: boolean;
  framingKey: string;
}) {
  const camera = useThree((state) => state.camera) as THREE.OrthographicCamera;
  const framedKeyRef = useRef("");

  useLayoutEffect(() => {
    if (framedKeyRef.current === framingKey) {
      return;
    }
    if (cameraLocked && framedKeyRef.current) return;
    camera.position.set(...pose.position);
    camera.rotation.set(...pose.rotation);
    camera.left = pose.frustum.left;
    camera.right = pose.frustum.right;
    camera.top = pose.frustum.top;
    camera.bottom = pose.frustum.bottom;
    camera.zoom = pose.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    framedKeyRef.current = framingKey;
  }, [camera, cameraLocked, framingKey, pose]);

  return null;
}

function FieldRenderReadiness({
  sceneKey,
  onReadinessChange,
}: {
  sceneKey: string;
  onReadinessChange: (sceneKey: string, ready: boolean) => void;
}) {
  const gl = useThree((state) => state.gl);
  const requestRender = useThree((state) => state.invalidate);
  const readiness = useRef(createRenderReadinessState());
  const reportedReady = useRef(false);
  const drawingBufferSize = useRef(new THREE.Vector2());

  const invalidateReadiness = useCallback(() => {
    readiness.current = invalidateRenderReadiness();
    if (reportedReady.current) {
      reportedReady.current = false;
      onReadinessChange(sceneKey, false);
    }
    requestRender();
  }, [onReadinessChange, requestRender, sceneKey]);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      invalidateReadiness();
    };
    const handleContextRestored = () => invalidateReadiness();

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [gl, invalidateReadiness]);

  useFrame(() => {
    const canvas = gl.domElement;
    const bounds = canvas.getBoundingClientRect();
    gl.getDrawingBufferSize(drawingBufferSize.current);
    const coversViewport = canvasCoversViewport(bounds, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    const hasCompleteDrawingBuffer =
      drawingBufferSize.current.x >= Math.floor(bounds.width) &&
      drawingBufferSize.current.y >= Math.floor(bounds.height);

    const signature = [
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio,
      Math.round(bounds.width),
      Math.round(bounds.height),
      drawingBufferSize.current.x,
      drawingBufferSize.current.y,
    ].join(":");
    readiness.current = observeRenderFrame(readiness.current, {
      valid:
        !gl.getContext().isContextLost() &&
        coversViewport &&
        hasCompleteDrawingBuffer,
      signature,
    });

    // A hidden prewarmed canvas can switch to demand-driven rendering after a
    // route transition. Keep advancing valid frames until the readiness gate
    // has observed the complete painted sequence it requires.
    if (
      !readiness.current.ready &&
      coversViewport &&
      hasCompleteDrawingBuffer
    ) {
      requestRender();
    }

    if (reportedReady.current && !readiness.current.ready) {
      reportedReady.current = false;
      onReadinessChange(sceneKey, false);
      return;
    }
    // useFrame runs before R3F's render. Requiring three observations proves
    // that two correctly sized, asset-complete frames have already painted.
    if (!reportedReady.current && readiness.current.ready) {
      reportedReady.current = true;
      onReadinessChange(sceneKey, true);
    }
  });

  return null;
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
  legendPlayerId,
  isTeammate,
  visible,
  worldPosition,
}: {
  player: BackendFieldPlayer;
  legendPlayerId: string | null;
  isTeammate: boolean;
  visible: boolean;
  worldPosition: [number, number, number];
}) {
  if (player.id !== legendPlayerId) {
    return null;
  }

  return (
    <Html
      position={worldPosition}
      center
      zIndexRange={[20, 20]}
      style={{ display: visible ? "block" : "none" }}
      className={`translate-y-8 rounded-full px-2 py-1 text-[10px] font-bold tracking-[0.18em] uppercase ${
        isTeammate ? "bg-black/65 text-[#d8ff6f]" : "bg-black/65 text-[#9fd1ff]"
      }`}
    >
      <span data-testid="legend-player-label" data-player-id={player.id}>
        YOU
      </span>
    </Html>
  );
}

function PlayerPresenceAura({ tone }: { tone: "legend" | "pressure" }) {
  const auraRef = useRef<THREE.Mesh>(null);
  const color = tone === "legend" ? "#baff45" : "#ff2f84";
  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useFrame(({ clock }) => {
    const aura = auraRef.current;
    if (!aura || reduceMotion) return;
    const speed = tone === "legend" ? 2.6 : 4.1;
    const phase = (Math.sin(clock.elapsedTime * speed) + 1) / 2;
    const scale = 0.94 + phase * 0.16;
    aura.scale.set(scale, scale, scale);
    const material = aura.material as THREE.MeshBasicMaterial;
    material.opacity = (tone === "legend" ? 0.28 : 0.18) + phase * 0.2;
  });

  return (
    <mesh
      ref={auraRef}
      position={[0, 0.035, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <ringGeometry args={[0.82, tone === "legend" ? 1.08 : 1, 32]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.3}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function PlayerScreenAnchor({
  testId,
  playerId,
  worldPosition,
}: {
  testId: string | null;
  playerId: string;
  worldPosition: [number, number, number];
}) {
  if (!testId) {
    return null;
  }

  return (
    <Html
      position={worldPosition}
      center
      zIndexRange={[0, 0]}
      style={{
        height: 2,
        opacity: 0,
        pointerEvents: "none",
        width: 2,
      }}
    >
      <span data-testid={testId} data-player-id={playerId} />
    </Html>
  );
}

function PlayerRenderProbe({
  automaticPhase,
  automaticRole,
  player,
  groupRef,
  reactionGroupRef,
  reactionFamily,
  targetRotation,
  worldPosition,
}: {
  automaticPhase: AutomaticFinishPhase;
  automaticRole: "actor" | "responder" | null;
  player: BackendFieldPlayer;
  groupRef: RefObject<THREE.Group | null>;
  reactionGroupRef: RefObject<THREE.Group | null>;
  reactionFamily: KickFailurePresentation["family"] | null;
  targetRotation: number;
  worldPosition: [number, number, number];
}) {
  const probeRef = useRef<HTMLSpanElement>(null);

  useFrame(() => {
    const probe = probeRef.current;
    const group = groupRef.current;
    const reactionGroup = reactionGroupRef.current;
    if (!probe || !group) return;
    probe.dataset.rotationY = String(group.rotation.y);
    probe.dataset.reactionFamily = reactionFamily ?? "none";
    probe.dataset.reactionOffsetZ = String(reactionGroup?.position.z ?? 0);
    probe.dataset.reactionRotationX = String(reactionGroup?.rotation.x ?? 0);
    probe.dataset.automaticPhase = automaticPhase ?? "none";
    probe.dataset.automaticRole = automaticRole ?? "none";
  });

  return (
    <Html
      position={worldPosition}
      center
      zIndexRange={[0, 0]}
      style={{ height: 2, opacity: 0, pointerEvents: "none", width: 2 }}
    >
      <span
        ref={probeRef}
        style={{ display: "block", height: 2, width: 2 }}
        data-testid="player-render-probe"
        data-player-id={player.id}
        data-player-x={player.x}
        data-player-y={player.y}
        data-target-rotation-y={targetRotation}
      />
    </Html>
  );
}

function BallRenderProbe({
  fieldPosition,
  groupRef,
  worldPosition,
}: {
  fieldPosition: { x: number; y: number; z: number };
  groupRef: RefObject<THREE.Group | null>;
  worldPosition: [number, number, number];
}) {
  const probeRef = useRef<HTMLSpanElement>(null);
  const sampledWorldPosition = useRef(new THREE.Vector3());

  useFrame(() => {
    const probe = probeRef.current;
    const group = groupRef.current;
    if (!probe || !group) return;
    group.getWorldPosition(sampledWorldPosition.current);
    const renderedFieldPosition = WORLD_FIELD_TRANSFORM.worldToField(
      sampledWorldPosition.current,
    );
    probe.dataset.ballX = String(renderedFieldPosition.x);
    probe.dataset.ballY = String(renderedFieldPosition.y);
    probe.dataset.ballZ = String(renderedFieldPosition.z);
  });

  return (
    <Html
      position={worldPosition}
      center
      zIndexRange={[0, 0]}
      style={{ height: 2, opacity: 0, pointerEvents: "none", width: 2 }}
    >
      <span
        ref={probeRef}
        style={{ display: "block", height: 2, width: 2 }}
        data-testid="ball-render-probe"
        data-ball-x={fieldPosition.x}
        data-ball-y={fieldPosition.y}
        data-ball-z={fieldPosition.z}
      />
    </Html>
  );
}

type BallFlightPoint = { x: number; y: number; z: number };
type AutomaticFinishPhase =
  | "incoming"
  | "control"
  | "shot"
  | "response"
  | "confirmed"
  | null;

type BallFlightPlayback = {
  completed: boolean;
  durationMs: number;
  finalPoint: BallFlightPoint;
  id: number;
  path: Array<BallFlightPoint & { t: number }>;
  segment: "automatic-incoming" | "automatic-shot" | "single";
  startedAt: number;
};

function BallFlightController({
  ballGroupRef,
  livePointRef,
  playbackRef,
  onComplete,
}: {
  ballGroupRef: RefObject<THREE.Group | null>;
  livePointRef: { current: BallFlightPoint | null };
  playbackRef: { current: BallFlightPlayback | null };
  onComplete: (playbackId: number, point: BallFlightPoint) => void;
}) {
  useFrame(() => {
    const group = ballGroupRef.current;
    const playback = playbackRef.current;
    if (!group || !playback) return;

    const elapsedMs = Math.min(
      playback.durationMs,
      performance.now() - playback.startedAt,
    );
    const point = sampleAuthoritativeFlightPath(
      playback.path,
      elapsedMs,
      playback.durationMs,
    );
    if (!point) return;

    livePointRef.current = point;
    const [worldX, worldY, worldZ] = fieldToWorld(point.x, point.y, point.z);
    group.position.set(worldX, worldY, worldZ);

    if (elapsedMs >= playback.durationMs && !playback.completed) {
      playback.completed = true;
      livePointRef.current = playback.finalPoint;
      const [finalX, finalY, finalZ] = fieldToWorld(
        playback.finalPoint.x,
        playback.finalPoint.y,
        playback.finalPoint.z,
      );
      group.position.set(finalX, finalY, finalZ);
      queueMicrotask(() => onComplete(playback.id, playback.finalPoint));
    }
  });

  return null;
}

function FieldCameraAnchorProbe() {
  const worldPosition = fieldToWorld(50, 0, FIELD_SURFACE_Y);

  return (
    <Html
      position={worldPosition}
      center
      zIndexRange={[0, 0]}
      style={{ height: 2, opacity: 0, pointerEvents: "none", width: 2 }}
    >
      <span
        style={{ display: "block", height: 2, width: 2 }}
        data-testid="field-camera-anchor"
      />
    </Html>
  );
}

function FieldGroundProbe({
  fieldPosition,
  testId,
}: {
  fieldPosition: { x: number; y: number };
  testId: string;
}) {
  const worldPosition = fieldToWorld(
    fieldPosition.x,
    fieldPosition.y,
    FIELD_SURFACE_Y,
  );
  return (
    <Html
      position={worldPosition}
      center
      zIndexRange={[0, 0]}
      style={{ height: 2, opacity: 0, pointerEvents: "none", width: 2 }}
    >
      <span
        style={{ display: "block", height: 2, width: 2 }}
        data-testid={testId}
      />
    </Html>
  );
}

function PlayerReachProbe({
  player,
  worldPosition,
}: {
  player: BackendFieldPlayer;
  worldPosition: [number, number, number];
}) {
  return (
    <Html
      position={worldPosition}
      center
      zIndexRange={[0, 0]}
      style={{ height: 2, opacity: 0, pointerEvents: "none", width: 2 }}
    >
      <span
        style={{ display: "block", height: 2, width: 2 }}
        data-testid="player-reach-probe"
        data-player-id={player.id}
        data-player-x={player.x}
        data-player-y={player.y}
        data-player-radius-m={player.collision_shape?.radius_m ?? 0.42}
        data-reach-height-m={player.collision_shape?.height_m ?? 2}
      />
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
    <div
      data-testid="field-loading-overlay"
      className="absolute inset-0 z-30 overflow-hidden bg-linear-to-b from-[#0f5f7a] via-[#0f7a69] to-[#0a4739]"
    >
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

function FieldAtmosphere({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-testid="field-atmosphere"
      className={`field-atmosphere ${active ? "field-atmosphere--active" : ""}`}
    >
      <div className="field-atmosphere__edge" />
      <div className="field-atmosphere__scanlines" />
      <div className="field-atmosphere__sweep" />
      <div className="field-atmosphere__vignette" />
    </div>
  );
}

function BackendPlayerModel({
  automaticFinish,
  automaticFinishPhase,
  automaticResponderPlayerId,
  automaticShotTarget,
  player,
  isTeammate,
  ballFieldPosition,
  liveBallFlightPointRef,
  stagedDecisionResult,
  isResultAnimating,
  legendPlayerId,
  screenAnchorTestId = null,
  showPlayerLabel = true,
  visible = true,
  modelScale = PLAYER_MODEL_REGISTRATION.visualScale,
  resultReaction,
  resultReactionVisible,
}: {
  automaticFinish: AutomaticFinishPresentation | null;
  automaticFinishPhase: AutomaticFinishPhase;
  automaticResponderPlayerId: string | null;
  automaticShotTarget: BallFlightPoint | null;
  player: BackendFieldPlayer;
  isTeammate: boolean;
  ballFieldPosition: { x: number; y: number };
  liveBallFlightPointRef: { current: BallFlightPoint | null };
  stagedDecisionResult?: BackendMatchResponse["decision_result"];
  isResultAnimating: boolean;
  legendPlayerId: string | null;
  screenAnchorTestId?: string | null;
  showPlayerLabel?: boolean;
  visible?: boolean;
  modelScale?: number;
  resultReaction: KickFailurePresentation | null;
  resultReactionVisible: boolean;
}) {
  const viewportSize = useThree((state) => state.size);
  const portraitWidthCompensation =
    viewportSize.height > viewportSize.width
      ? PLAYER_MODEL_REGISTRATION.portraitWidthCompensation
      : 1;
  const worldPosition = fieldToWorld(player.x, player.y);
  const renderWorldPosition = worldPosition;
  const modelVariant = buildModelVariant(player, isTeammate);
  const stagedFlightPath =
    completeAuthoritativeFlightPath(stagedDecisionResult);
  const involvedPlayerId =
    stagedDecisionResult?.receiver?.id ||
    stagedDecisionResult?.interceptor?.id ||
    null;
  const tracksTrajectory =
    stagedFlightPath.length > 0 &&
    minDistanceToFlightPath(player, stagedFlightPath) <=
      PLAYER_TRAJECTORY_TRACK_DISTANCE_M;
  const tracksBallNow =
    distanceInFieldMeters(player, ballFieldPosition) <=
    OPPONENT_NEAR_BALL_DISTANCE_M;
  const shouldTrackBall =
    Boolean(stagedDecisionResult) &&
    (tracksTrajectory || tracksBallNow || player.id === involvedPlayerId);
  const opponentNearBall =
    !isTeammate &&
    distanceInFieldMeters(player, ballFieldPosition) <=
      OPPONENT_NEAR_BALL_DISTANCE_M;
  const backendFacingTarget = authoritativeFacingTarget(
    player,
    stagedDecisionResult?.receiver_control,
  );
  const rotationY =
    isResultAnimating && shouldTrackBall
      ? rotationTowardsFieldTarget(player, ballFieldPosition)
      : backendFacingTarget
        ? rotationTowardsFieldTarget(player, backendFacingTarget)
        : shouldTrackBall && player.id === involvedPlayerId
          ? rotationTowardsFieldTarget(player, ballFieldPosition)
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
  const reactionGroupRef = useRef<THREE.Group>(null);
  const reactionStartedAtRef = useRef(0);
  const automaticPhaseStartedAtRef = useRef(0);
  const currentRotationRef = useRef(rotationY);
  const reactsToResult =
    resultReactionVisible && resultReaction?.involvedPlayerId === player.id;
  const isAutomaticActor = automaticFinish?.actorPlayerId === player.id;
  const isAutomaticResponder = automaticResponderPlayerId === player.id;
  const automaticRole = isAutomaticActor
    ? "actor"
    : isAutomaticResponder
      ? "responder"
      : null;

  useEffect(() => {
    if (reactsToResult) reactionStartedAtRef.current = performance.now();
  }, [reactsToResult]);

  useEffect(() => {
    if (automaticRole && automaticFinishPhase) {
      automaticPhaseStartedAtRef.current = performance.now();
    }
  }, [automaticFinishPhase, automaticRole]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const liveBallPosition = liveBallFlightPointRef.current;
    const automaticRotationTarget =
      isAutomaticActor &&
      automaticShotTarget &&
      (automaticFinishPhase === "control" ||
        automaticFinishPhase === "shot" ||
        automaticFinishPhase === "response")
        ? rotationTowardsFieldTarget(player, automaticShotTarget)
        : isAutomaticResponder &&
            liveBallPosition &&
            (automaticFinishPhase === "shot" ||
              automaticFinishPhase === "response")
          ? rotationTowardsFieldTarget(player, liveBallPosition)
          : null;
    const liveRotationTarget =
      automaticRotationTarget ??
      (isResultAnimating && shouldTrackBall && liveBallPosition
        ? rotationTowardsFieldTarget(player, liveBallPosition)
        : rotationY);
    currentRotationRef.current = advancePlayerRotation(
      currentRotationRef.current,
      liveRotationTarget,
      delta,
      PLAYER_TRACK_TURN_SPEED,
    );
    group.rotation.y = currentRotationRef.current;

    const reactionGroup = reactionGroupRef.current;
    if (!reactionGroup) return;
    const automaticElapsed = Math.max(
      0,
      performance.now() - automaticPhaseStartedAtRef.current,
    );
    if (automaticFinish && automaticFinishPhase && automaticRole) {
      const pulse = Math.sin(Math.min(1, automaticElapsed / 700) * Math.PI);
      if (isAutomaticActor && automaticFinishPhase === "control") {
        reactionGroup.position.z = -pulse * 0.12;
        reactionGroup.scale.set(1 + pulse * 0.04, 1 - pulse * 0.05, 1.04);
        reactionGroup.rotation.x = pulse * 0.08;
        return;
      }
      if (isAutomaticActor && automaticFinishPhase === "response") {
        if (automaticFinish.outcome === "goal") {
          reactionGroup.position.y =
            Math.abs(Math.sin(automaticElapsed / 130)) * 0.16;
          reactionGroup.rotation.z = Math.sin(automaticElapsed / 180) * 0.08;
        }
        return;
      }
      if (isAutomaticResponder && automaticFinishPhase === "response") {
        const direction =
          Math.sign((automaticShotTarget?.x ?? player.x) - player.x) || 1;
        reactionGroup.position.x = direction * pulse * 0.34;
        reactionGroup.rotation.z = -direction * pulse * 0.28;
        reactionGroup.rotation.x =
          automaticFinish.outcome === "saved" ||
          automaticFinish.outcome === "blocked"
            ? pulse * 0.14
            : -pulse * 0.12;
        return;
      }
    }
    if (!reactsToResult || !resultReaction) {
      reactionGroup.position.set(0, 0, 0);
      reactionGroup.rotation.set(0, 0, 0);
      reactionGroup.scale.set(1, 1, 1);
      return;
    }

    const elapsed = Math.max(
      0,
      performance.now() - reactionStartedAtRef.current,
    );
    const progress = Math.min(1, elapsed / resultReaction.holdMs);
    const impact = Math.sin(progress * Math.PI);
    if (resultReaction.family === "overhit") {
      reactionGroup.position.z = impact * 0.28;
      reactionGroup.rotation.x = -impact * 0.24;
      reactionGroup.rotation.z = Math.sin(progress * Math.PI * 4) * 0.06;
    } else {
      const brace = 1 + impact * 0.08;
      reactionGroup.scale.set(brace, 1 - impact * 0.05, brace);
      reactionGroup.rotation.x = impact * 0.12;
    }
  });

  return (
    <>
      <group
        position={renderWorldPosition}
        visible={visible}
        scale={[portraitWidthCompensation, 1, 1]}
      >
        {player.id === legendPlayerId && <PlayerPresenceAura tone="legend" />}
        {!isTeammate && opponentNearBall && (
          <PlayerPresenceAura tone="pressure" />
        )}
        <group ref={groupRef}>
          <group ref={reactionGroupRef}>
            <GameModel
              {...modelVariant}
              isTeamMate={isTeammate}
              animationName={
                isAutomaticActor && automaticFinishPhase === "shot"
                  ? "StrikeForwardJog"
                  : "DefensiveIdle"
              }
              position={[0, 0, 0]}
              rotation={[0, 0, 0]}
              scale={modelScale}
              targetPosition={null}
              renderOnly={true}
            />
          </group>
        </group>
      </group>
      {visible && (
        <>
          <PlayerLabel
            player={player}
            legendPlayerId={legendPlayerId}
            isTeammate={isTeammate}
            visible={showPlayerLabel}
            worldPosition={renderWorldPosition}
          />
          <PlayerScreenAnchor
            testId={screenAnchorTestId}
            playerId={player.id}
            worldPosition={renderWorldPosition}
          />
        </>
      )}
      {E2E_RENDER_PROBES && visible && (
        <>
          <PlayerRenderProbe
            automaticPhase={automaticFinishPhase}
            automaticRole={automaticRole}
            player={player}
            groupRef={groupRef}
            reactionGroupRef={reactionGroupRef}
            reactionFamily={
              reactsToResult ? (resultReaction?.family ?? null) : null
            }
            targetRotation={rotationY}
            worldPosition={renderWorldPosition}
          />
          <PlayerReachProbe
            player={player}
            worldPosition={fieldToWorld(
              player.x,
              player.y,
              player.collision_shape?.height_m ?? 2,
            )}
          />
        </>
      )}
    </>
  );
}

function KickOutcomeImpact({
  presentation,
  point,
  visible,
}: {
  presentation: KickFailurePresentation | null;
  point: BallFlightPoint | null;
  visible: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || reduceMotion) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 13) * 0.12;
    group.scale.set(pulse, pulse, pulse);
    group.rotation.y += 0.025;
  });

  if (!visible || !presentation || !point) return null;
  const color =
    presentation.family === "overhit"
      ? "#ffb52e"
      : presentation.family === "interception"
        ? "#ff2f84"
        : "#4de7ff";
  const [x, y, z] = fieldToWorld(point.x, point.y, Math.max(0.12, point.z));

  return (
    <group ref={groupRef} position={[x, y + 0.08, z]} renderOrder={8}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.82, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.88}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {presentation.family === "overhit" && (
        <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <ringGeometry args={[0.92, 1.02, 4]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.7}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {presentation.family === "interception" && (
        <mesh position={[0, 0.48, 0]}>
          <octahedronGeometry args={[0.34, 0]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6}
            wireframe
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {presentation.family === "missed-target" && (
        <group position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.12, 0.9, 0.12]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.12, 0.9, 0.12]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function AutomaticFinishImpact({
  phase,
  point,
  presentation,
}: {
  phase: AutomaticFinishPhase;
  point: BallFlightPoint | null;
  presentation: AutomaticFinishPresentation | null;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 12) * 0.12;
    group.scale.set(pulse, pulse, pulse);
    group.rotation.y += 0.02;
  });

  if (phase !== "response" || !presentation || !point) return null;
  const color =
    presentation.outcome === "goal"
      ? "#baff45"
      : presentation.outcome === "saved"
        ? "#4de7ff"
        : presentation.outcome === "blocked"
          ? "#ff2f84"
          : "#f6c453";
  const [x, y, z] = fieldToWorld(point.x, point.y, Math.max(0.12, point.z));

  return (
    <group ref={groupRef} position={[x, y + 0.08, z]} renderOrder={9}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.65, 0.95, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.88}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {presentation.outcome === "goal" ? (
        <>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.08, 0.28, 1.8, 12]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.55}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <ringGeometry args={[1.08, 1.2, 4]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, 0.45, 0]}>
          <octahedronGeometry args={[0.34, 0]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.7}
            wireframe
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

export default function GameScene({
  active = true,
  matchId: routeMatchId = null,
}: {
  active?: boolean;
  matchId?: string | null;
}) {
  const navigate = useNavigate();
  const {
    active: assetsActive,
    progress: assetsProgress,
    loaded: assetsLoaded,
    total: assetsTotal,
    errors: assetErrors,
  } = useProgress();
  const match = useMatchSessionStore((state) => state.match);
  const authoritativeRouteReady = Boolean(
    active && routeMatchId && match?.id === routeMatchId,
  );
  const phase = useMatchSessionStore((state) => state.phase);
  const diagnostic = useMatchSessionStore((state) => state.diagnostic);
  const unsupportedScene = useMatchSessionStore(
    (state) => state.unsupportedScene,
  );
  const pendingAction = useMatchSessionStore((state) => state.pendingAction);
  const fieldState = useMatchSessionStore((state) => state.fieldState);
  const [residentScene, setResidentScene] = useState(() => ({
    pendingAction,
    fieldState,
  }));
  const resultPlayback = useMatchSessionStore((state) => state.resultPlayback);
  const legendAvailability = useMatchSessionStore(
    (state) => state.legendAvailability,
  );
  const halftimeSummary = useMatchSessionStore(
    (state) => state.halftimeSummary,
  );
  const fullTimeHandoff = useMatchSessionStore(
    (state) => state.fullTimeHandoff,
  );
  const myTeam = useMatchSessionStore((state) => state.myTeam);
  const opponentTeam = useMatchSessionStore((state) => state.opponentTeam);
  const setActionResponse = useMatchSessionStore(
    (state) => state.setActionResponse,
  );
  const acknowledgeDecisionResult = useMatchSessionStore(
    (state) => state.acknowledgeDecisionResult,
  );
  const setLoading = useMatchSessionStore((state) => state.setLoading);
  const setError = useMatchSessionStore((state) => state.setError);
  const updateTransitionLoader = useMatchSessionStore(
    (state) => state.updateTransitionLoader,
  );
  const hideTransitionLoader = useMatchSessionStore(
    (state) => state.hideTransitionLoader,
  );
  const hydrateMatchSession = useMatchSessionStore(
    (state) => state.hydrateMatchSession,
  );
  const markSceneReady = useMatchSessionStore((state) => state.markSceneReady);
  const setPlaybackMinute = useMatchSessionStore(
    (state) => state.setPlaybackMinute,
  );
  const retainedFieldDraft = useMatchSessionStore((state) => state.fieldDraft);
  const retainFieldDraft = useMatchSessionStore(
    (state) => state.retainFieldDraft,
  );
  const clearFieldDraft = useMatchSessionStore(
    (state) => state.clearFieldDraft,
  );
  const pendingCommand = useMatchSessionStore((state) => state.pendingCommand);
  const retrySafe = useMatchSessionStore((state) => state.retrySafe);
  const beginActionCommand = useMatchSessionStore(
    (state) => state.beginActionCommand,
  );
  const [releasedAimDraft, setReleasedAimDraft] = useState<BallAimDraft | null>(
    null,
  );
  const [activeAimDraft, setActiveAimDraft] = useState<BallAimDraft | null>(
    null,
  );
  const [strikeContact, setStrikeContact] = useState(DEFAULT_STRIKE_CONTACT);
  const [restoreAimFocus, setRestoreAimFocus] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stagedKickResult, setStagedKickResult] =
    useState<StagedKickResult | null>(null);
  const [debugResultContinuation] = useState(isDebugResultContinuationEnabled);
  const [resolvedSceneFieldState, setResolvedSceneFieldState] =
    useState<BackendFieldState | null>(null);
  const [animatedBallFlightPoint, setAnimatedBallFlightPoint] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);
  const [isResultAnimating, setIsResultAnimating] = useState(false);
  const [resultReactionVisible, setResultReactionVisible] = useState(false);
  const [automaticFinishPhase, setAutomaticFinishPhase] =
    useState<AutomaticFinishPhase>(null);
  const [completedBallPlayback, setCompletedBallPlayback] = useState<{
    id: number;
    point: BallFlightPoint;
    segment: BallFlightPlayback["segment"];
  } | null>(null);
  const [resultContinuing, setResultContinuing] = useState(false);
  const [dribblePresentationState, setDribblePresentationState] =
    useState<DribblePresentationState | null>(null);
  const [readySceneKey, setReadySceneKey] = useState("");
  const [interactionReadySceneKey, setInteractionReadySceneKey] = useState("");
  const hasRenderedSceneRef = useRef(false);
  const [rehydrationKey, setRehydrationKey] = useState(0);
  const ballRenderGroupRef = useRef<THREE.Group | null>(null);
  const ballFlightPlaybackRef = useRef<BallFlightPlayback | null>(null);
  const liveBallFlightPointRef = useRef<BallFlightPoint | null>(null);
  const ballFlightSequenceRef = useRef(0);
  const terminalFrameTimeoutRef = useRef<number | null>(null);
  const resultReactionScheduledRef = useRef(false);
  const resultContinuationGateRef = useRef(false);
  const kickSubmissionGateRef = useRef(createKickSubmissionGate());
  const dribbleSubmissionGateRef = useRef(createDribbleSubmissionGate());
  const randomEventSubmissionGateRef = useRef(
    createRandomEventSubmissionGate(),
  );
  const assetErrorBaselineRef = useRef<number | null>(null);
  const fieldRehydrationGateRef = useRef(createReconnectHydrationGate());
  const fieldRehydrationGenerationRef = useRef(0);
  const activeRouteRef = useRef({ active, matchId: routeMatchId });
  const activeActionCommandRef = useRef<MatchCommand | null>(null);
  const playedOperationIdRef = useRef<string | null>(null);
  const feedbackOperationIdRef = useRef<string | null>(null);
  const stagedDecisionResult = stagedKickResult?.response.decision_result;
  const stagedFailurePresentation =
    kickFailurePresentation(stagedDecisionResult);
  const stagedAutomaticFinish =
    automaticFinishPresentation(stagedDecisionResult);

  useLayoutEffect(() => {
    activeRouteRef.current = { active, matchId: routeMatchId };
    return () => {
      activeRouteRef.current = { active: false, matchId: null };
    };
  }, [active, routeMatchId]);

  useLayoutEffect(() => {
    if (!shouldAdoptResidentFieldScene(phase)) return;
    setResidentScene((current) =>
      current.pendingAction === pendingAction &&
      current.fieldState === fieldState
        ? current
        : { pendingAction, fieldState },
    );
  }, [fieldState, pendingAction, phase]);

  useLayoutEffect(() => {
    ballFlightPlaybackRef.current = null;
    liveBallFlightPointRef.current = null;
    if (terminalFrameTimeoutRef.current) {
      window.clearTimeout(terminalFrameTimeoutRef.current);
      terminalFrameTimeoutRef.current = null;
    }
    setReleasedAimDraft(null);
    setActiveAimDraft(null);
    setStrikeContact(DEFAULT_STRIKE_CONTACT);
    setRestoreAimFocus(false);
    setSubmitError(null);
    setIsSubmitting(false);
    setStagedKickResult(null);
    setResolvedSceneFieldState(null);
    setAnimatedBallFlightPoint(null);
    setIsResultAnimating(false);
    setResultReactionVisible(false);
    setAutomaticFinishPhase(null);
    setCompletedBallPlayback(null);
    resultReactionScheduledRef.current = false;
    setResultContinuing(false);
    setDribblePresentationState(null);
    // The hidden prewarmed field becomes active by gaining a route match id.
    // Preserve its readiness; renderSceneKey invalidates actual scene changes.
    kickSubmissionGateRef.current = createKickSubmissionGate();
    dribbleSubmissionGateRef.current = createDribbleSubmissionGate();
    randomEventSubmissionGateRef.current = createRandomEventSubmissionGate();
    fieldRehydrationGateRef.current = createReconnectHydrationGate();
    fieldRehydrationGenerationRef.current += 1;
    assetErrorBaselineRef.current = null;
    playedOperationIdRef.current = null;
    feedbackOperationIdRef.current = null;
    resultContinuationGateRef.current = false;
    return () => {
      const command = activeActionCommandRef.current;
      activeActionCommandRef.current = null;
      if (command) {
        useMatchSessionStore.getState().requireCommandReconciliation(command);
      }
    };
  }, [routeMatchId]);

  const actionRequestIsCurrent = (command: MatchCommand) => {
    const route = activeRouteRef.current;
    return Boolean(
      route.active &&
        route.matchId === command.matchId &&
        matchCommandsExactly(
          useMatchSessionStore.getState().pendingCommand,
          command,
        ),
    );
  };

  const reconcileAbandonedActionRequest = (command: MatchCommand) => {
    if (!matchCommandsExactly(activeActionCommandRef.current, command)) return;
    useMatchSessionStore.getState().requireCommandReconciliation(command);
    activeActionCommandRef.current = null;
  };

  const settleActionRequest = (command: MatchCommand) => {
    if (matchCommandsExactly(activeActionCommandRef.current, command)) {
      activeActionCommandRef.current = null;
    }
  };

  const commandForDecision = (
    actionId: string,
    decision: Record<string, unknown>,
  ): MatchCommand | null => {
    if (!match || !authoritativeRouteReady) return null;
    if (pendingCommand) {
      if (
        actionCommandMatchesDecision(pendingCommand, {
          matchId: match.id,
          revision: match.revision,
          actionId,
          decision,
        })
      ) {
        return pendingCommand;
      }
      setSubmitError(
        "A different action input is already awaiting confirmation. Retry the exact saved input.",
      );
      return null;
    }
    return createMatchCommand(
      "action",
      {
        match_id: match.id,
        action_id: actionId,
        match_decision: decision,
      },
      {
        matchId: match.id,
        revision: match.revision,
        actionId,
      },
    );
  };

  useEffect(() => {
    const playback = resultPlayback?.playback;
    const submittedAction = playback?.submitted_action;
    if (
      stagedKickResult ||
      phase !== "result_playback" ||
      !match ||
      !submittedAction ||
      !playback?.decision_result
    ) {
      return;
    }
    setResolvedSceneFieldState(playback.submitted_field_state);
    setStagedKickResult({
      sceneType: submittedAction.scene_type,
      response: {
        minute: match.current_time,
        status: match.match_status,
        prev_time: submittedAction.minute,
        pending_action: pendingAction,
        field_state: fieldState,
        action: submittedAction.scene_type,
        action_team: submittedAction.action_team,
        events: playback.events,
        match,
        decision_result: playback.decision_result,
        pending_settlement_events: [],
        unsupported_scene: null,
        legend_availability: legendAvailability ?? {
          version: 1,
          status: "AVAILABLE",
          availability: "AVAILABLE",
          participation: "PARTICIPATING",
          interactive_controls: true,
          unavailable_since_minute: null,
        },
        halftime_summary: halftimeSummary,
        full_time_handoff: fullTimeHandoff,
        latest_operation: resultPlayback,
      },
    });
  }, [
    fieldState,
    fullTimeHandoff,
    halftimeSummary,
    legendAvailability,
    match,
    pendingAction,
    phase,
    resultPlayback,
    stagedKickResult,
  ]);

  useEffect(() => {
    if (
      !active ||
      !routeMatchId ||
      (match?.id === routeMatchId && rehydrationKey === 0)
    ) {
      return;
    }
    let cancelled = false;
    const hydrationGeneration = ++fieldRehydrationGenerationRef.current;
    beginHydration(fieldRehydrationGateRef.current);
    let succeeded = false;
    let retryableFailure = true;
    void fetchBackendMatch(routeMatchId)
      .then((response) => {
        if (cancelled) return;
        const pendingAction =
          response.pending_action &&
          !response.pending_action.field_state &&
          response.field_state
            ? { ...response.pending_action, field_state: response.field_state }
            : response.pending_action;
        hydrateMatchSession({
          match: response.match,
          myTeam: response.my_team,
          opponentTeam: response.opponent_team,
          timelineEvents: response.timeline,
          pendingAction,
          unsupportedScene: response.unsupported_scene,
          legendAvailability: response.legend_availability,
          halftimeSummary: response.halftime_summary,
          fullTimeHandoff: response.full_time_handoff,
          latestOperation: response.latest_operation,
        });
        succeeded = true;
      })
      .catch((error: unknown) => {
        retryableFailure = isRetryableHydrationFailure(error);
        if (!cancelled) setError(error);
      })
      .finally(() => {
        if (hydrationGeneration === fieldRehydrationGenerationRef.current) {
          const retryQueuedReconnect = settleHydration(
            fieldRehydrationGateRef.current,
            succeeded,
            retryableFailure,
          );
          if (!cancelled && retryQueuedReconnect) {
            setRehydrationKey((value) => value + 1);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    active,
    hydrateMatchSession,
    match?.id,
    rehydrationKey,
    routeMatchId,
    setError,
  ]);

  useEffect(() => {
    if (
      !active ||
      !routeMatchId ||
      match?.id !== routeMatchId ||
      phase !== "timeline_playback" ||
      !pendingAction
    ) {
      return;
    }

    // A direct /game/:matchId route explicitly requests the authoritative
    // pending field scene. The timeline route owns normal timeline playback;
    // this only restores the presentation phase after direct hydration.
    setPlaybackMinute(pendingAction.minute);
    markSceneReady();
  }, [
    active,
    markSceneReady,
    match?.id,
    pendingAction,
    phase,
    routeMatchId,
    setPlaybackMinute,
  ]);

  useEffect(() => {
    if (!active || !routeMatchId) return;
    const rehydrateAfterReconnect = () => {
      if (requestReconnectHydration(fieldRehydrationGateRef.current)) {
        setRehydrationKey((value) => value + 1);
      }
    };
    window.addEventListener("online", rehydrateAfterReconnect);
    return () => window.removeEventListener("online", rehydrateAfterReconnect);
  }, [active, routeMatchId]);

  useEffect(() => {
    if (
      !active ||
      !routeMatchId ||
      match?.id !== routeMatchId ||
      phase !== "timeline_playback" ||
      pendingAction ||
      resultPlayback
    ) {
      return;
    }
    // The field route owns only an active scene or result playback. Once the
    // authoritative session has neither, timeline owns the continuation.
    navigate(`/match/${match.id}`, { replace: true });
  }, [
    active,
    match?.id,
    navigate,
    pendingAction,
    phase,
    resultPlayback,
    routeMatchId,
  ]);

  useEffect(() => {
    if (
      !retainedFieldDraft ||
      !authoritativeRouteReady ||
      !match ||
      !pendingAction ||
      retainedFieldDraft.matchId !== match.id ||
      retainedFieldDraft.revision !== match.revision ||
      retainedFieldDraft.actionId !== pendingAction.id ||
      releasedAimDraft
    ) {
      return;
    }
    setReleasedAimDraft(retainedFieldDraft.aim);
    setStrikeContact(retainedFieldDraft.contact);
  }, [
    authoritativeRouteReady,
    match,
    pendingAction,
    releasedAimDraft,
    retainedFieldDraft,
  ]);
  const handleRenderReadiness = useCallback(
    (sceneKey: string, ready: boolean) => {
      if (!ready) {
        setActiveAimDraft(null);
        setReleasedAimDraft(null);
        setInteractionReadySceneKey((current) =>
          current === sceneKey ? "" : current,
        );
      }
      setReadySceneKey((current) => {
        if (ready) return sceneKey;
        return current === sceneKey ? "" : current;
      });
    },
    [],
  );
  const continuationFieldState = stagedKickResult
    ? authoritativeContinuationFieldState(stagedKickResult.response)
    : null;
  const stagedFieldState =
    !isResultAnimating && continuationFieldState && !stagedFailurePresentation
      ? continuationFieldState
      : null;
  const renderPendingAction = residentScene.pendingAction;
  const residentFieldState = residentScene.fieldState;
  // Keep the submitted scene visible during authoritative trajectory playback.
  // The authoritative continuation replaces it only after the flight completes.
  const displayFieldState =
    stagedFieldState || resolvedSceneFieldState || residentFieldState;
  const sequenceFieldState = resolvedSceneFieldState || residentFieldState;
  const myPlayers = displayFieldState?.my_team_positions || [];
  const opponentPlayers = displayFieldState?.opponent_positions || [];
  const automaticShotTarget =
    stagedDecisionResult?.automatic_follow_up?.final_point ?? null;
  const automaticResponderPlayerId = stagedAutomaticFinish
    ? (stagedAutomaticFinish.contactPlayerId ??
      opponentPlayers.find((player) => player.role === "GK")?.id ??
      null)
    : null;
  const legendPlayer = displayFieldState?.legend_player_id
    ? myPlayers.find(
        (player) => player.id === displayFieldState.legend_player_id,
      ) || null
    : null;
  const carrierPlayer = displayFieldState?.carrier_player_id
    ? myPlayers.find(
        (player) => player.id === displayFieldState.carrier_player_id,
      ) || null
    : null;
  const sequenceAnchorPlayer = sequenceFieldState?.legend_player_id
    ? sequenceFieldState.my_team_positions.find(
        (player) => player.id === sequenceFieldState.legend_player_id,
      ) || null
    : null;
  const fallbackCameraView: FieldViewWindow = shouldUseDefaultCamera(
    sequenceAnchorPlayer,
  )
    ? fixedAttackingView()
    : followLegendView(sequenceAnchorPlayer ?? { x: 50, y: 25 });
  const fieldViewWindow =
    sequenceFieldState?.sequence?.camera.view_window ?? fallbackCameraView;
  const cornerFieldX =
    sequenceFieldState?.sequence?.camera.mode === "CORNER_ATTACKING_THIRD"
      ? sequenceFieldState.ball_x
      : undefined;
  const fieldCameraPose = createFieldCameraPose(
    fieldViewWindow,
    cornerFieldX,
    sequenceFieldState?.sequence?.camera.mode === "FOLLOW_LEGEND"
      ? "FOLLOW_LEGEND"
      : "FIXED_ATTACKING_THIRD",
  );
  const fieldCameraFramingKey =
    sequenceFieldState?.sequence?.sequence_id ??
    sequenceFieldState?.id ??
    renderPendingAction?.id ??
    "no-action";
  const penaltyNonparticipantCount =
    displayFieldState?.scene_family === "PENALTY"
      ? myPlayers.length +
        opponentPlayers.length -
        (legendPlayer ? 1 : 0) -
        opponentPlayers.filter((player) => player.role === "GK").length
      : null;
  const isDribbleScene = renderPendingAction?.scene_type === "DRIBBLE";
  const isRandomEventScene = isRandomEventAction(renderPendingAction);
  const isStagedRandomEvent = Boolean(
    stagedKickResult && isRandomEventSceneType(stagedKickResult.sceneType),
  );
  const parsedRandomEvent = parseRandomEventAction(renderPendingAction);
  // Drei Html labels share the DOM overlay with the active-scene HUD. Hide the
  // legend label whenever either dribble or a result takes over that region.
  const showLegendPlayerLabel =
    !isDribbleScene && !isRandomEventScene && !stagedKickResult;
  const parsedDribblePattern = isDribbleScene
    ? parseDribblePattern(displayFieldState?.dribble_pattern)
    : { pattern: null, error: null };
  const dribblePattern = parsedDribblePattern.pattern;
  const dribblePresentation = dribblePattern
    ? dribblePresentationAtSecond(
        dribblePattern,
        dribblePresentationState?.trace ?? [
          { at_second: 0, lane: dribblePattern.starting_lane },
        ],
        dribblePresentationState?.elapsed ?? 0,
      )
    : null;
  const dribbleLegend =
    isDribbleScene && legendPlayer && dribblePresentation
      ? {
          ...legendPlayer,
          x: dribblePresentation.player.x,
          y: dribblePresentation.player.y,
        }
      : null;
  const dribbleDefenders =
    isDribbleScene && dribblePresentation
      ? dribblePresentation.defenders.reduce<
          Array<{ active: boolean; player: BackendFieldPlayer }>
        >((players, wave, index) => {
          const template = selectDribbleDefenderTemplate(
            opponentPlayers,
            index,
          );
          if (template) {
            players.push({
              active: wave.active,
              player: {
                ...template,
                id: `dribble-wave-${wave.id}`,
                x: wave.x,
                y: wave.y,
              },
            });
          }
          return players;
        }, [])
      : [];
  const baseBallFieldPosition = displayFieldState
    ? { x: displayFieldState.ball_x, y: displayFieldState.ball_y }
    : { x: 50, y: 25 };
  const ballFieldPosition =
    dribblePresentation?.ball ||
    animatedBallFlightPoint ||
    baseBallFieldPosition;
  const ballCenterHeight =
    animatedBallFlightPoint?.z ??
    displayFieldState?.geometry?.ball_radius_m ??
    DEFAULT_BALL_RADIUS_M;
  const [ballX, ballY, ballZ] = displayFieldState
    ? fieldToWorld(ballFieldPosition.x, ballFieldPosition.y, ballCenterHeight)
    : [0, DEFAULT_BALL_RADIUS_M, 0];
  const kickControlEnvelope = parseKickControlEnvelope(
    renderPendingAction?.control_envelope,
  );
  const renderSceneKey = fieldRenderSceneKey({
    actionId: renderPendingAction?.id ?? null,
    sceneFamily: displayFieldState?.scene_family ?? null,
    ball: displayFieldState
      ? { x: displayFieldState.ball_x, y: displayFieldState.ball_y }
      : null,
    myPlayers,
    opponentPlayers,
    view: fieldViewWindow,
    cornerFieldX,
  });
  const isCanvasReady = readySceneKey === renderSceneKey;
  const isFieldInteractionCurrentlyReady =
    isCanvasReady &&
    !assetsActive &&
    (assetsTotal === 0 || assetsLoaded >= assetsTotal);
  const isFieldInteractionReady =
    isFieldInteractionCurrentlyReady ||
    interactionReadySceneKey === renderSceneKey;
  const hasBlockingSessionError =
    phase === "recoverable_error" || phase === "unsupported_contract";
  const fieldVisualPhase = deriveFieldVisualPhase({
    active: Boolean(active),
    hasBlockingError: hasBlockingSessionError,
    hasRenderedScene: hasRenderedSceneRef.current,
    hasResult: Boolean(stagedKickResult),
    interactionReady: isFieldInteractionReady,
    resultAnimating: isResultAnimating,
    resultContinuing,
    sessionPhase: phase,
  });

  useEffect(() => {
    if (isFieldInteractionCurrentlyReady) {
      hasRenderedSceneRef.current = true;
      setInteractionReadySceneKey(renderSceneKey);
    }
  }, [isFieldInteractionCurrentlyReady, renderSceneKey]);

  useEffect(() => {
    if (!match?.id) return;
    const snapshot = { matchId: match.id, sceneKey: renderSceneKey };
    reportFieldPresentationReadiness(snapshot, isFieldInteractionReady);
    return () => reportFieldPresentationReadiness(snapshot, false);
  }, [isFieldInteractionReady, match?.id, renderSceneKey]);

  useEffect(() => {
    if (active && isFieldInteractionReady && match?.id) {
      reportFieldPresented(match.id);
      updateTransitionLoader({
        progress: 100,
        stage: "Field ready",
        subtitle: "Your move is ready.",
      });
      const frame = window.requestAnimationFrame(hideTransitionLoader);
      return () => window.cancelAnimationFrame(frame);
    }
  }, [
    active,
    hideTransitionLoader,
    isFieldInteractionReady,
    match?.id,
    updateTransitionLoader,
  ]);

  const canAim =
    fieldVisualPhase === "playable" &&
    authoritativeRouteReady &&
    isFieldInteractionReady &&
    !stagedKickResult &&
    phase === "scene_ready" &&
    pendingAction?.action_team === "MY_TEAM" &&
    isCanonicalKickScene(pendingAction?.scene_type) &&
    pendingAction.available_choices.some((choice) => choice.id === "KICK") &&
    Boolean(kickControlEnvelope);
  const canDribble =
    fieldVisualPhase === "playable" &&
    authoritativeRouteReady &&
    isFieldInteractionReady &&
    !stagedKickResult &&
    phase === "scene_ready" &&
    pendingAction?.action_team === "MY_TEAM" &&
    isDribbleScene &&
    Boolean(dribblePattern) &&
    pendingAction.available_choices.length === 2 &&
    pendingAction.available_choices.some(
      (choice) => choice.id === "DRIBBLE_RUN",
    ) &&
    pendingAction.available_choices.some(
      (choice) => choice.id === "SIMULATE_FOUL",
    );
  const canResolveRandomEvent =
    fieldVisualPhase === "playable" &&
    authoritativeRouteReady &&
    isFieldInteractionReady &&
    !stagedKickResult &&
    phase === "scene_ready" &&
    Boolean(parsedRandomEvent.event);
  const canRecoverUnsupportedScene =
    authoritativeRouteReady &&
    phase === "unsupported_recovery" &&
    Boolean(unsupportedScene) &&
    Boolean(match?.id);
  const displayedKickDecision =
    releasedAimDraft && kickControlEnvelope
      ? buildCanonicalKickDecision(
          kickControlEnvelope,
          fieldAimForDraft(releasedAimDraft),
          releasedAimDraft.normalizedPower,
          strikeContact,
        )
      : null;
  const showFieldLoadingOverlay = fieldVisualPhase === "loading";

  useEffect(() => {
    return () => {
      ballFlightPlaybackRef.current = null;
      liveBallFlightPointRef.current = null;
      if (terminalFrameTimeoutRef.current) {
        window.clearTimeout(terminalFrameTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!E2E_RENDER_PROBES) return;
    const e2eState = globalThis as typeof globalThis & {
      __OVERGOAL_E2E_READ_LIVE_BALL__?: () => BallFlightPoint | null;
    };
    e2eState.__OVERGOAL_E2E_READ_LIVE_BALL__ = () =>
      liveBallFlightPointRef.current;
    return () => {
      delete e2eState.__OVERGOAL_E2E_READ_LIVE_BALL__;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      assetErrorBaselineRef.current = null;
      return;
    }

    if (assetErrorBaselineRef.current === null) {
      assetErrorBaselineRef.current = assetErrors.length;
      return;
    }

    if (assetErrors.length <= assetErrorBaselineRef.current) return;

    // Drei retains historical loader failures globally. Only errors that occur
    // after this field route becomes active can make this scene unrecoverable.
    const failedAsset =
      assetErrors[assetErrors.length - 1] ?? "an unknown match asset";
    assetErrorBaselineRef.current = assetErrors.length;
    setError(new Error(`Unable to load match asset ${failedAsset}.`));
  }, [active, assetErrors, setError]);

  const clearStagedKickResult = useCallback(() => {
    ballFlightPlaybackRef.current = null;
    liveBallFlightPointRef.current = null;
    if (terminalFrameTimeoutRef.current) {
      window.clearTimeout(terminalFrameTimeoutRef.current);
      terminalFrameTimeoutRef.current = null;
    }
    setStagedKickResult(null);
    setResolvedSceneFieldState(null);
    setAnimatedBallFlightPoint(null);
    setIsResultAnimating(false);
    setResultReactionVisible(false);
    setAutomaticFinishPhase(null);
    setCompletedBallPlayback(null);
    resultReactionScheduledRef.current = false;
  }, []);

  useEffect(() => {
    if (!stagedKickResult && phase !== "result_playback") {
      resultContinuationGateRef.current = false;
      setResultContinuing(false);
    }
  }, [phase, stagedKickResult]);

  const completeBallPlayback = useCallback(
    (playbackId: number, finalPoint: BallFlightPoint) => {
      const segment = ballFlightPlaybackRef.current?.segment ?? "single";
      setCompletedBallPlayback({ id: playbackId, point: finalPoint, segment });
    },
    [],
  );

  useLayoutEffect(() => {
    if (!completedBallPlayback || !stagedKickResult) return;
    const activePlayback = ballFlightPlaybackRef.current;
    if (
      activePlayback &&
      activePlayback.id !== completedBallPlayback.id &&
      !activePlayback.completed
    ) {
      setCompletedBallPlayback(null);
      return;
    }

    ballFlightPlaybackRef.current = null;
    liveBallFlightPointRef.current = completedBallPlayback.point;
    setAnimatedBallFlightPoint(completedBallPlayback.point);
    setCompletedBallPlayback(null);

    if (
      completedBallPlayback.segment === "automatic-incoming" &&
      stagedDecisionResult?.automatic_follow_up
    ) {
      const followUp = stagedDecisionResult.automatic_follow_up;
      setAutomaticFinishPhase("control");
      setIsResultAnimating(true);
      terminalFrameTimeoutRef.current = window.setTimeout(() => {
        terminalFrameTimeoutRef.current = null;
        const flightPath = followUp.flight_path;
        const durationMs = trajectoryPlaybackDurationMs(flightPath);
        const initialPoint = sampleAuthoritativeFlightPath(
          flightPath,
          0,
          durationMs,
        );
        const playbackId = (ballFlightSequenceRef.current += 1);
        ballFlightPlaybackRef.current = {
          completed: false,
          durationMs,
          finalPoint: followUp.final_point,
          id: playbackId,
          path: flightPath,
          segment: "automatic-shot",
          startedAt: performance.now(),
        };
        liveBallFlightPointRef.current = initialPoint;
        setAnimatedBallFlightPoint(initialPoint);
        flushSync(() => setAutomaticFinishPhase("shot"));
      }, 650);
      return;
    }

    if (stagedAutomaticFinish) {
      if (resultReactionScheduledRef.current) return;
      resultReactionScheduledRef.current = true;
      setAutomaticFinishPhase("response");
      setIsResultAnimating(true);
      terminalFrameTimeoutRef.current = window.setTimeout(() => {
        terminalFrameTimeoutRef.current = null;
        const confirm = () => {
          setAutomaticFinishPhase("confirmed");
          setIsResultAnimating(false);
        };
        const e2eState = globalThis as typeof globalThis & {
          __OVERGOAL_E2E_HOLD_AUTOMATIC_RESPONSE__?: boolean;
          __OVERGOAL_E2E_RELEASE_AUTOMATIC_RESPONSE__?: () => void;
        };
        if (
          E2E_RENDER_PROBES &&
          e2eState.__OVERGOAL_E2E_HOLD_AUTOMATIC_RESPONSE__
        ) {
          e2eState.__OVERGOAL_E2E_RELEASE_AUTOMATIC_RESPONSE__ = confirm;
          return;
        }
        confirm();
      }, stagedAutomaticFinish.responseHoldMs);
      return;
    }

    if (stagedFailurePresentation) {
      if (resultReactionScheduledRef.current) return;
      resultReactionScheduledRef.current = true;
      setResultReactionVisible(true);
      setIsResultAnimating(true);
      terminalFrameTimeoutRef.current = window.setTimeout(() => {
        terminalFrameTimeoutRef.current = null;
        setResultReactionVisible(false);
        setIsResultAnimating(false);
      }, stagedFailurePresentation.holdMs);
      return;
    }

    if (authoritativeContinuationFieldState(stagedKickResult.response)) {
      terminalFrameTimeoutRef.current = window.setTimeout(() => {
        terminalFrameTimeoutRef.current = null;
        liveBallFlightPointRef.current = null;
        setAnimatedBallFlightPoint(null);
        setIsResultAnimating(false);
      }, 100);
      return;
    }
    setIsResultAnimating(false);
  }, [
    completedBallPlayback,
    stagedAutomaticFinish,
    stagedDecisionResult,
    stagedFailurePresentation,
    stagedKickResult,
  ]);

  const startBallPlayback = useCallback(
    (response: BackendMatchResponse, operationId: string | null = null) => {
      // The command handler and result-playback hydration may observe the same
      // committed operation in either order. Its authoritative identity makes
      // trajectory playback idempotent and prevents an in-flight restart.
      if (operationId && playedOperationIdRef.current === operationId) return;

      const feedbackId =
        operationId ??
        `${response.match.id}:${response.match.revision}:${response.prev_time}`;
      if (feedbackOperationIdRef.current !== feedbackId) {
        feedbackOperationIdRef.current = feedbackId;
        playGameFeedback(
          outcomeFeedbackCue(response.decision_result?.outcome_type),
        );
      }
      if (operationId) playedOperationIdRef.current = operationId;
      ballFlightPlaybackRef.current = null;
      liveBallFlightPointRef.current = null;
      setResultReactionVisible(false);
      setAutomaticFinishPhase(null);
      setCompletedBallPlayback(null);
      resultReactionScheduledRef.current = false;
      if (terminalFrameTimeoutRef.current) {
        window.clearTimeout(terminalFrameTimeoutRef.current);
        terminalFrameTimeoutRef.current = null;
      }

      const decisionResult = response.decision_result;
      const automaticFollowUp = decisionResult?.automatic_follow_up;
      const trajectory = automaticFollowUp
        ? decisionResult?.flight_path && decisionResult.final_point
          ? {
              finalPoint: decisionResult.final_point,
              path: decisionResult.flight_path,
            }
          : null
        : authoritativeTrajectoryPlayback(decisionResult);
      if (trajectory) {
        const { finalPoint, path: flightPath } = trajectory;
        const durationMs = trajectoryPlaybackDurationMs(flightPath);
        const initialPoint = sampleAuthoritativeFlightPath(
          flightPath,
          0,
          durationMs,
        );
        const playbackId = (ballFlightSequenceRef.current += 1);
        ballFlightPlaybackRef.current = {
          completed: false,
          durationMs,
          finalPoint,
          id: playbackId,
          path: flightPath,
          segment: automaticFollowUp ? "automatic-incoming" : "single",
          startedAt: performance.now(),
        };
        liveBallFlightPointRef.current = initialPoint;
        setAnimatedBallFlightPoint(initialPoint);
        setAutomaticFinishPhase(automaticFollowUp ? "incoming" : null);
        setIsResultAnimating(true);
        return;
      }

      // Canonical kick scenes never fabricate a trajectory when the server omits one.
      if (authoritativeContinuationFieldState(response)) {
        liveBallFlightPointRef.current = null;
        setAnimatedBallFlightPoint(null);
      }
      setIsResultAnimating(false);
    },
    [],
  );

  useEffect(() => {
    const operationId = resultPlayback?.operation_id ?? null;
    if (
      phase !== "result_playback" ||
      !stagedKickResult ||
      !operationId ||
      playedOperationIdRef.current === operationId
    ) {
      return;
    }
    startBallPlayback(stagedKickResult.response, operationId);
  }, [phase, resultPlayback, stagedKickResult, startBallPlayback]);

  const handleAimRelease = (draft: BallAimDraft) => {
    playGameFeedback("aim-ready");
    setRestoreAimFocus(false);
    setSubmitError(null);
    setActiveAimDraft(null);
    setReleasedAimDraft(draft);
    setStrikeContact(DEFAULT_STRIKE_CONTACT);
    if (match && pendingAction) {
      retainFieldDraft({
        kind: "kick",
        matchId: match.id,
        revision: match.revision,
        actionId: pendingAction.id,
        aim: draft,
        contact: DEFAULT_STRIKE_CONTACT,
      });
    }
  };

  const closeContactDialog = () => {
    setActiveAimDraft(releasedAimDraft);
    setReleasedAimDraft(null);
    setSubmitError(null);
    setRestoreAimFocus(true);
    clearFieldDraft();
  };

  const handleAimFocusRestored = useCallback(() => {
    setRestoreAimFocus(false);
  }, []);

  const handleStrikeContactChange = (contact: { x: number; y: number }) => {
    setStrikeContact(contact);
    if (!match || !pendingAction || !releasedAimDraft) return;
    retainFieldDraft({
      kind: "kick",
      matchId: match.id,
      revision: match.revision,
      actionId: pendingAction.id,
      aim: releasedAimDraft,
      contact,
    });
  };

  const handleKick = async () => {
    if (!match?.id || !pendingAction || !releasedAimDraft) {
      return;
    }

    const envelope = kickControlEnvelope;
    if (!envelope) {
      setSubmitError("The current action is missing canonical kick controls.");
      return;
    }
    if (!kickSubmissionGateRef.current.begin(pendingAction.id)) {
      return;
    }
    const payload = buildCanonicalKickDecision(
      envelope,
      fieldAimForDraft(releasedAimDraft),
      releasedAimDraft.normalizedPower,
      strikeContact,
    );
    const command = commandForDecision(pendingAction.id, payload);
    if (!command) {
      kickSubmissionGateRef.current.reset(pendingAction.id);
      return;
    }

    try {
      playGameFeedback("action");
      setIsSubmitting(true);
      setSubmitError(null);
      setLoading(true);
      setError(null);

      if (!beginActionCommand(command)) {
        kickSubmissionGateRef.current.reset(pendingAction.id);
        setLoading(false);
        return;
      }
      activeActionCommandRef.current = command;
      const response = await processBackendMatchAction(
        match,
        pendingAction.id,
        payload,
        command,
      );
      if (!actionRequestIsCurrent(command)) {
        reconcileAbandonedActionRequest(command);
        return;
      }
      const submittedFieldState = fieldState;
      if (!setActionResponse(response, command)) {
        settleActionRequest(command);
        setLoading(false);
        return;
      }
      settleActionRequest(command);
      setReleasedAimDraft(null);
      clearFieldDraft();
      setResolvedSceneFieldState(submittedFieldState);
      setStagedKickResult({
        response,
        sceneType: pendingAction.scene_type,
      });
      setLoading(false);
      startBallPlayback(
        response,
        response.latest_operation?.operation_id ?? null,
      );
    } catch (error) {
      if (!actionRequestIsCurrent(command)) {
        reconcileAbandonedActionRequest(command);
        return;
      }
      kickSubmissionGateRef.current.reset(pendingAction.id);
      const message =
        error instanceof Error ? error.message : "Failed to submit kick.";
      setSubmitError(message);
      setError(error);
      settleActionRequest(command);
      setLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDribbleDecision = async (decision: DribbleDecision) => {
    if (!match?.id || !pendingAction || !dribblePattern) {
      return;
    }
    if (!dribbleSubmissionGateRef.current.begin(pendingAction.id)) {
      return;
    }
    const command = commandForDecision(
      pendingAction.id,
      decision as unknown as Record<string, unknown>,
    );
    if (!command) {
      dribbleSubmissionGateRef.current.reset(pendingAction.id);
      return;
    }

    try {
      playGameFeedback("action");
      setIsSubmitting(true);
      setSubmitError(null);
      setLoading(true);
      setError(null);
      if (!beginActionCommand(command)) {
        dribbleSubmissionGateRef.current.reset(pendingAction.id);
        setLoading(false);
        return;
      }
      activeActionCommandRef.current = command;
      const submittedFieldState = fieldState;
      const response = await processBackendMatchAction(
        match,
        pendingAction.id,
        decision,
        command,
      );
      if (!actionRequestIsCurrent(command)) {
        reconcileAbandonedActionRequest(command);
        return;
      }
      if (!setActionResponse(response, command)) {
        settleActionRequest(command);
        setLoading(false);
        return;
      }
      settleActionRequest(command);
      setResolvedSceneFieldState(submittedFieldState);
      setStagedKickResult({ response, sceneType: pendingAction.scene_type });
      setLoading(false);
      startBallPlayback(
        response,
        response.latest_operation?.operation_id ?? null,
      );
    } catch (error) {
      if (!actionRequestIsCurrent(command)) {
        reconcileAbandonedActionRequest(command);
        return;
      }
      dribbleSubmissionGateRef.current.reset(pendingAction.id);
      const message =
        error instanceof Error ? error.message : "Failed to submit dribble.";
      setSubmitError(message);
      setError(error);
      settleActionRequest(command);
      setLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRandomEventDecision = async (choiceId: string) => {
    if (!match?.id || !pendingAction || !parsedRandomEvent.event) {
      return;
    }
    if (!randomEventSubmissionGateRef.current.begin(pendingAction.id)) {
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = createRandomEventDecision(parsedRandomEvent.event, choiceId);
    } catch (error) {
      randomEventSubmissionGateRef.current.reset(pendingAction.id);
      setSubmitError(
        error instanceof Error ? error.message : "The event choice is invalid.",
      );
      return;
    }
    const command = commandForDecision(pendingAction.id, payload);
    if (!command) {
      randomEventSubmissionGateRef.current.reset(pendingAction.id);
      return;
    }

    try {
      playGameFeedback("action");
      setIsSubmitting(true);
      setSubmitError(null);
      setLoading(true);
      setError(null);
      if (!beginActionCommand(command)) {
        randomEventSubmissionGateRef.current.reset(pendingAction.id);
        setLoading(false);
        return;
      }
      activeActionCommandRef.current = command;
      const submittedFieldState = fieldState;
      const response = await processBackendMatchAction(
        match,
        pendingAction.id,
        payload,
        command,
      );
      if (!actionRequestIsCurrent(command)) {
        reconcileAbandonedActionRequest(command);
        return;
      }
      if (!setActionResponse(response, command)) {
        settleActionRequest(command);
        setLoading(false);
        return;
      }
      settleActionRequest(command);
      setResolvedSceneFieldState(submittedFieldState);
      setStagedKickResult({ response, sceneType: pendingAction.scene_type });
      setLoading(false);
      startBallPlayback(
        response,
        response.latest_operation?.operation_id ?? null,
      );
    } catch (error) {
      if (!actionRequestIsCurrent(command)) {
        reconcileAbandonedActionRequest(command);
        return;
      }
      randomEventSubmissionGateRef.current.reset(pendingAction.id);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to submit match event.";
      setSubmitError(message);
      setError(error);
      settleActionRequest(command);
      setLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnsupportedSceneRecovery = async () => {
    if (!match?.id || !unsupportedScene) return;
    const actionId = unsupportedScene.action_id;
    const choiceId = unsupportedScene.recovery.choice;
    if (!randomEventSubmissionGateRef.current.begin(actionId)) return;
    const payload = { choice: choiceId };
    const command = commandForDecision(actionId, payload);
    if (!command) {
      randomEventSubmissionGateRef.current.reset(actionId);
      return;
    }

    try {
      playGameFeedback("action");
      setIsSubmitting(true);
      setSubmitError(null);
      setLoading(true);
      setError(null);
      if (!beginActionCommand(command)) {
        randomEventSubmissionGateRef.current.reset(actionId);
        setLoading(false);
        return;
      }
      activeActionCommandRef.current = command;
      const response = await processBackendMatchAction(
        match,
        actionId,
        payload,
        command,
      );
      if (!actionRequestIsCurrent(command)) {
        reconcileAbandonedActionRequest(command);
        return;
      }
      if (!setActionResponse(response, command)) {
        settleActionRequest(command);
        setLoading(false);
        return;
      }
      settleActionRequest(command);
      setLoading(false);
      navigate(`/match/${match.id}`);
    } catch (error) {
      if (!actionRequestIsCurrent(command)) {
        reconcileAbandonedActionRequest(command);
        return;
      }
      randomEventSubmissionGateRef.current.reset(actionId);
      setError(error);
      settleActionRequest(command);
      setLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const retryPendingAction = async () => {
    if (
      !match ||
      !pendingCommand ||
      !retrySafe ||
      pendingCommand.operation !== "action" ||
      pendingCommand.matchId !== match.id ||
      pendingCommand.actionId !== pendingAction?.id
    ) {
      return;
    }
    const decision = pendingCommand.payload.match_decision;
    if (!decision || typeof decision !== "object") return;

    try {
      playGameFeedback("action");
      setError(null);
      if (!beginActionCommand(pendingCommand)) return;
      activeActionCommandRef.current = pendingCommand;
      setIsSubmitting(true);
      setLoading(true);
      const response = await processBackendMatchAction(
        match,
        pendingAction.id,
        decision as Record<string, unknown>,
        pendingCommand,
      );
      if (!actionRequestIsCurrent(pendingCommand)) {
        reconcileAbandonedActionRequest(pendingCommand);
        return;
      }
      if (!setActionResponse(response, pendingCommand)) {
        settleActionRequest(pendingCommand);
        setLoading(false);
        return;
      }
      settleActionRequest(pendingCommand);
      clearFieldDraft();
      setResolvedSceneFieldState(fieldState);
      setStagedKickResult({ response, sceneType: pendingAction.scene_type });
      setLoading(false);
      startBallPlayback(
        response,
        response.latest_operation?.operation_id ?? null,
      );
    } catch (error) {
      if (!actionRequestIsCurrent(pendingCommand)) {
        reconcileAbandonedActionRequest(pendingCommand);
        return;
      }
      setError(error);
      settleActionRequest(pendingCommand);
      setLoading(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextAction = useCallback(() => {
    if (
      !match?.id ||
      !stagedKickResult ||
      isResultAnimating ||
      resultContinuationGateRef.current
    ) {
      return;
    }

    resultContinuationGateRef.current = true;
    setResultContinuing(true);
    const continueDirectlyToField = shouldContinueResultDirectlyToField({
      pendingAction: stagedKickResult.response.pending_action,
      responseMinute: stagedKickResult.response.minute,
    });
    const nextSession = acknowledgeDecisionResult();
    if (
      nextSession.phase === "result_playback" ||
      nextSession.phase === "recoverable_error" ||
      nextSession.phase === "unsupported_contract"
    ) {
      resultContinuationGateRef.current = false;
      setResultContinuing(false);
      return;
    }
    clearStagedKickResult();
    navigate(
      continueDirectlyToField ? `/game/${match.id}` : `/match/${match.id}`,
    );
  }, [
    acknowledgeDecisionResult,
    clearStagedKickResult,
    isResultAnimating,
    match?.id,
    navigate,
    stagedKickResult,
  ]);

  useEffect(() => {
    if (
      debugResultContinuation ||
      !stagedKickResult ||
      fieldVisualPhase !== "resolved" ||
      isResultAnimating ||
      resultContinuing
    ) {
      return;
    }

    const timeout = window.setTimeout(handleNextAction, RESULT_HOLD_MS);
    return () => window.clearTimeout(timeout);
  }, [
    debugResultContinuation,
    fieldVisualPhase,
    handleNextAction,
    isResultAnimating,
    resultContinuing,
    stagedKickResult,
  ]);

  const resultDescription =
    stagedKickResult?.response.decision_result?.description ||
    stagedKickResult?.response.events?.[0]?.description ||
    "Action resolved.";
  const resultMinute = stagedKickResult?.response.prev_time;
  const handleFieldCanvasError = useCallback(() => {
    setError(
      new Error(
        "Unable to load match asset required for this field. Refresh to retry.",
      ),
    );
  }, [setError]);
  const blockingSessionError = hasBlockingSessionError ? (
    <div
      data-testid="scene-contract-error"
      role="alert"
      className="absolute top-[calc(var(--overgoal-safe-top)+1rem)] right-[calc(var(--overgoal-safe-right)+1rem)] bottom-[calc(var(--overgoal-safe-bottom)+1rem)] left-[calc(var(--overgoal-safe-left)+1rem)] z-40 m-auto h-fit max-w-md rounded-[2rem] border border-pink-300/35 bg-slate-950/95 p-6 text-white shadow-[0_0_48px_rgba(217,70,239,0.2)]"
    >
      <p className="font-orbitron text-[10px] font-black tracking-[0.28em] text-pink-200 uppercase">
        Recoverable Match Error
      </p>
      <p className="mt-3 text-base leading-6 text-cyan-50">
        {diagnostic?.message ||
          "The live match scene could not be rendered safely."}
      </p>
      <div className="mt-5 flex gap-3">
        {diagnostic?.recoveryAction !== "STOP" && (
          <button
            type="button"
            onClick={() => {
              if (diagnostic?.recoveryAction === "REAUTHENTICATE") {
                navigate("/login");
                return;
              }
              setRehydrationKey((value) => value + 1);
            }}
            className="rounded-xl border border-cyan-200/55 px-4 py-2 text-xs font-bold tracking-[0.12em] text-cyan-100 uppercase"
          >
            {diagnostic?.recoveryAction === "REAUTHENTICATE"
              ? "Sign in again"
              : diagnostic?.recoveryAction === "HYDRATE_MATCH"
                ? "Refresh match state"
                : diagnostic?.recoveryAction === "CHECK_TRANSPORT"
                  ? "Check connection"
                  : "Refresh"}
          </button>
        )}
        {retrySafe &&
          diagnostic?.recoveryAction === "RETRY_SAME_REQUEST" &&
          pendingCommand?.operation === "action" && (
            <button
              type="button"
              onClick={retryPendingAction}
              className="rounded-xl border border-cyan-200/55 px-4 py-2 text-xs font-bold tracking-[0.12em] text-cyan-100 uppercase"
            >
              Retry exact action
            </button>
          )}
        {match?.id && (
          <button
            type="button"
            onClick={() => navigate(`/match/${match.id}`)}
            className="rounded-xl border border-white/18 px-4 py-2 text-xs font-bold tracking-[0.12em] text-white/82 uppercase"
          >
            Timeline
          </button>
        )}
      </div>
    </div>
  ) : null;
  if (active && routeMatchId && !authoritativeRouteReady) {
    return (
      <div
        data-testid="game-field"
        data-session-phase={hasBlockingSessionError ? phase : "hydrating"}
        data-interaction-phase="blocked"
        data-field-visual-phase={
          hasBlockingSessionError ? "blocked" : "loading"
        }
        data-render-ready="false"
        className="fixed inset-0 z-40 overflow-hidden bg-[#0a4739]"
      >
        <FieldBackdrop />
        <FieldLoadingOverlay
          visible={!hasBlockingSessionError}
          progress={assetsProgress}
        />
        {blockingSessionError}
      </div>
    );
  }
  const interactionPhase = hasBlockingSessionError
    ? "blocked"
    : stagedKickResult
      ? "result_playback"
      : phase === "submitting" || isSubmitting
        ? "submitting"
        : releasedAimDraft
          ? "contact_selection"
          : activeAimDraft
            ? "aiming"
            : "idle";

  return (
    <div
      data-testid="game-field"
      data-aim-power={
        E2E_RENDER_PROBES
          ? (activeAimDraft ?? releasedAimDraft)?.normalizedPower
          : undefined
      }
      data-aim-direction-x={
        E2E_RENDER_PROBES
          ? (activeAimDraft ?? releasedAimDraft)?.normalizedDirection.x
          : undefined
      }
      data-aim-direction-z={
        E2E_RENDER_PROBES
          ? (activeAimDraft ?? releasedAimDraft)?.normalizedDirection.z
          : undefined
      }
      data-session-phase={phase}
      data-interaction-phase={interactionPhase}
      data-field-visual-phase={fieldVisualPhase}
      data-player-count={myPlayers.length + opponentPlayers.length}
      data-player-roles={[...myPlayers, ...opponentPlayers]
        .map((player) => player.role)
        .sort()
        .join(",")}
      data-opponent-roles={opponentPlayers
        .map((player) => player.role)
        .sort()
        .join(",")}
      data-scene-family={displayFieldState?.scene_family ?? ""}
      data-corner-camera={cornerFieldX === undefined ? "false" : "true"}
      data-ball-x={displayFieldState ? ballFieldPosition.x : ""}
      data-ball-y={displayFieldState ? ballFieldPosition.y : ""}
      data-ball-z={ballCenterHeight}
      data-carrier-player-id={displayFieldState?.carrier_player_id ?? ""}
      data-carrier-player-x={carrierPlayer?.x ?? ""}
      data-carrier-player-y={carrierPlayer?.y ?? ""}
      data-carrier-has-ball={
        carrierPlayer?.has_ball === true ? "true" : "false"
      }
      data-carrier-facing-target-x={carrierPlayer?.facing_target_x ?? ""}
      data-carrier-facing-target-y={carrierPlayer?.facing_target_y ?? ""}
      data-carrier-facing-target-player-id={
        carrierPlayer?.facing_target_player_id ?? ""
      }
      data-carrier-carry-offset-m={carrierPlayer?.carry_offset_m ?? ""}
      data-result-receiver-id={stagedDecisionResult?.receiver?.id ?? ""}
      data-result-receiver-x={stagedDecisionResult?.receiver?.x ?? ""}
      data-result-receiver-y={stagedDecisionResult?.receiver?.y ?? ""}
      data-result-control-carrier-id={
        stagedDecisionResult?.receiver_control?.carrier_player_id ?? ""
      }
      data-result-facing-target-x={
        stagedDecisionResult?.receiver_control?.facing_target_x ?? ""
      }
      data-result-facing-target-y={
        stagedDecisionResult?.receiver_control?.facing_target_y ?? ""
      }
      data-result-facing-target-player-id={
        stagedDecisionResult?.receiver_control?.facing_target_player_id ?? ""
      }
      data-result-carry-offset-m={
        stagedDecisionResult?.receiver_control?.carry_offset_m ?? ""
      }
      data-result-minute={stagedKickResult?.response.prev_time ?? ""}
      data-continuation-minute={stagedKickResult?.response.minute ?? ""}
      data-result-animating={isResultAnimating ? "true" : "false"}
      data-result-reaction={stagedFailurePresentation?.family ?? "none"}
      data-result-reaction-visible={resultReactionVisible ? "true" : "false"}
      data-automatic-finish-outcome={stagedAutomaticFinish?.outcome ?? "none"}
      data-automatic-finish-phase={automaticFinishPhase ?? "none"}
      data-automatic-score-confirmed={
        automaticFinishPhase === "confirmed" ? "true" : "false"
      }
      data-automatic-confirmed-my-team-score={
        automaticFinishPhase === "confirmed"
          ? (stagedKickResult?.response.match.my_team_score ?? "")
          : ""
      }
      data-penalty-nonparticipant-count={penaltyNonparticipantCount ?? ""}
      data-render-ready={isCanvasReady ? "true" : "false"}
      data-render-scene-key={E2E_RENDER_PROBES ? renderSceneKey : undefined}
      data-kick-contract-supported={kickControlEnvelope ? "true" : "false"}
      className={`fixed inset-0 overflow-hidden bg-[#0a4739] ${
        active ? "z-40 opacity-100" : "pointer-events-none z-0 opacity-[0.001]"
      }`}
      aria-hidden={!active}
    >
      <FieldBackdrop />
      {!stagedKickResult && !isDribbleScene && !isRandomEventScene && (
        <div
          data-testid="field-scene-hud"
          className="field-scene-hud absolute right-0 bottom-0 left-0 z-20 flex flex-col gap-2 p-4 pr-[calc(var(--overgoal-safe-right)+1rem)] pb-[calc(var(--overgoal-safe-bottom)+1rem)] pl-[calc(var(--overgoal-safe-left)+1rem)] text-white"
        >
          <div className="field-scene-hud__title rounded-full bg-black/60 px-3 py-1 text-xs font-bold tracking-[0.24em] text-cyan-300 uppercase">
            {renderPendingAction?.title || "Field"}
          </div>
          <div className="field-scene-hud__card rounded-xl bg-black/50 px-4 py-2 text-sm text-white/90 backdrop-blur-sm">
            <div className="font-bold">
              {myTeam?.name || "My Team"} vs {opponentTeam?.name || "Opponent"}
            </div>
            <div>
              {renderPendingAction?.description || "Waiting for field state."}
            </div>
          </div>
          {active && !displayFieldState && (
            <div
              role="alert"
              className="max-w-sm rounded-xl bg-red-950/65 px-4 py-3 text-sm text-red-100 backdrop-blur-sm"
            >
              {diagnostic?.message ||
                "No backend field state is available for this screen yet."}
              {diagnostic?.retryable && (
                <button
                  type="button"
                  className="mt-2 block font-bold text-cyan-200 underline underline-offset-4"
                  onClick={() => window.location.reload()}
                >
                  Refresh match
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <FieldCanvasErrorBoundary
        onError={handleFieldCanvasError}
        resetKey={`${routeMatchId ?? "no-match"}:${rehydrationKey}`}
      >
        <Canvas
          frameloop={active ? "always" : "demand"}
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
            manual
            position={fieldCameraPose.position}
            rotation={fieldCameraPose.rotation}
            left={fieldCameraPose.frustum.left}
            right={fieldCameraPose.frustum.right}
            top={fieldCameraPose.frustum.top}
            bottom={fieldCameraPose.frustum.bottom}
            zoom={fieldCameraPose.zoom}
            near={0.1}
            far={1000}
          />
          <FieldCameraController
            pose={fieldCameraPose}
            cameraLocked={Boolean(stagedKickResult)}
            framingKey={fieldCameraFramingKey}
          />

          <Suspense fallback={null}>
            <Physics gravity={[0, -30, 0]} colliders={"ball"}>
              <Sky sunPosition={[10, 10, 0]} />
              <hemisphereLight
                color="#b8f7ff"
                groundColor="#12392f"
                intensity={1.15}
              />
              <directionalLight
                color="#dffcff"
                intensity={1.35}
                position={[-28, 42, 24]}
              />
              <ContactShadows
                frames={1}
                scale={100}
                position={[0, FIELD_SURFACE_Y, 0]}
                blur={4}
                opacity={0.2}
              />
              <Stadium position={[0, 0, 0]} rotation={[0, 0, 0]} />

              <Ball
                renderGroupRef={ballRenderGroupRef}
                position={[ballX, ballY, ballZ]}
                interactive={false}
                renderOnly={true}
                flightActive={isResultAnimating}
                aimEnabled={Boolean(canAim && !releasedAimDraft)}
                aimDraft={activeAimDraft ?? releasedAimDraft}
                kickControlEnvelope={kickControlEnvelope}
                onAimChange={setActiveAimDraft}
                onAimRelease={handleAimRelease}
              />
              {E2E_RENDER_PROBES && (
                <>
                  <FieldCameraAnchorProbe />
                  <FieldGroundProbe
                    fieldPosition={{ x: 50, y: 15.71 }}
                    testId="opponent-penalty-area-bottom-probe"
                  />
                  {cornerFieldX !== undefined && displayFieldState && (
                    <FieldGroundProbe
                      fieldPosition={{
                        x: displayFieldState.ball_x < 50 ? 0 : 100,
                        y: 0,
                      }}
                      testId="corner-flag-render-probe"
                    />
                  )}
                  <BallRenderProbe
                    fieldPosition={{
                      x: ballFieldPosition.x,
                      y: ballFieldPosition.y,
                      z: ballCenterHeight,
                    }}
                    groupRef={ballRenderGroupRef}
                    worldPosition={[ballX, ballY, ballZ]}
                  />
                </>
              )}
              <BallFlightController
                ballGroupRef={ballRenderGroupRef}
                livePointRef={liveBallFlightPointRef}
                playbackRef={ballFlightPlaybackRef}
                onComplete={completeBallPlayback}
              />
              <KickOutcomeImpact
                presentation={stagedFailurePresentation}
                point={animatedBallFlightPoint}
                visible={resultReactionVisible}
              />
              <AutomaticFinishImpact
                phase={automaticFinishPhase}
                point={animatedBallFlightPoint}
                presentation={stagedAutomaticFinish}
              />
              {canAim && (
                <BallAimSurface
                  position={[ballX, ballY, ballZ]}
                  maximumPower={kickControlEnvelope?.maximum_power ?? 0}
                  enabled={!releasedAimDraft}
                  focusOnMount={restoreAimFocus}
                  onFocusRestored={handleAimFocusRestored}
                  onAimChange={setActiveAimDraft}
                  onAimRelease={handleAimRelease}
                />
              )}

              {(isDribbleScene
                ? dribbleLegend
                  ? [dribbleLegend]
                  : []
                : myPlayers
              ).map((player) => (
                <BackendPlayerModel
                  key={player.id}
                  automaticFinish={stagedAutomaticFinish}
                  automaticFinishPhase={automaticFinishPhase}
                  automaticResponderPlayerId={automaticResponderPlayerId}
                  automaticShotTarget={automaticShotTarget}
                  player={player}
                  isTeammate={true}
                  ballFieldPosition={ballFieldPosition}
                  liveBallFlightPointRef={liveBallFlightPointRef}
                  stagedDecisionResult={stagedDecisionResult}
                  isResultAnimating={isResultAnimating}
                  legendPlayerId={displayFieldState?.legend_player_id ?? null}
                  screenAnchorTestId={
                    player.id === displayFieldState?.legend_player_id
                      ? "legend-player-anchor"
                      : null
                  }
                  showPlayerLabel={showLegendPlayerLabel}
                  modelScale={
                    isDribbleScene
                      ? DRIBBLE_PLAYER_MODEL_SCALE
                      : PLAYER_MODEL_REGISTRATION.visualScale
                  }
                  resultReaction={stagedFailurePresentation}
                  resultReactionVisible={resultReactionVisible}
                />
              ))}
              {(isDribbleScene
                ? dribbleDefenders
                : opponentPlayers.map((player) => ({
                    active: true,
                    player,
                  }))
              ).map(({ active: playerVisible, player }, index) => (
                <BackendPlayerModel
                  key={player.id}
                  automaticFinish={stagedAutomaticFinish}
                  automaticFinishPhase={automaticFinishPhase}
                  automaticResponderPlayerId={automaticResponderPlayerId}
                  automaticShotTarget={automaticShotTarget}
                  player={player}
                  isTeammate={false}
                  ballFieldPosition={ballFieldPosition}
                  liveBallFlightPointRef={liveBallFlightPointRef}
                  stagedDecisionResult={stagedDecisionResult}
                  isResultAnimating={isResultAnimating}
                  legendPlayerId={displayFieldState?.legend_player_id ?? null}
                  screenAnchorTestId={
                    isDribbleScene && index === 0
                      ? "dribble-defender-anchor"
                      : null
                  }
                  showPlayerLabel={showLegendPlayerLabel}
                  visible={playerVisible}
                  modelScale={
                    isDribbleScene
                      ? DRIBBLE_PLAYER_MODEL_SCALE
                      : PLAYER_MODEL_REGISTRATION.visualScale
                  }
                  resultReaction={stagedFailurePresentation}
                  resultReactionVisible={resultReactionVisible}
                />
              ))}
              <Preload all />
              <FieldRenderReadiness
                key={renderSceneKey}
                sceneKey={renderSceneKey}
                onReadinessChange={handleRenderReadiness}
              />
            </Physics>
          </Suspense>
        </Canvas>
      </FieldCanvasErrorBoundary>
      <FieldAtmosphere active={isCanvasReady} />
      <FieldLoadingOverlay
        visible={showFieldLoadingOverlay}
        progress={assetsProgress}
      />
      {isCanvasReady &&
        pendingAction?.action_team === "MY_TEAM" &&
        isCanonicalKickScene(pendingAction.scene_type) &&
        pendingAction.available_choices.some(
          (choice) => choice.id === "KICK",
        ) &&
        !kickControlEnvelope && (
          <div
            role="alert"
            className="absolute top-[calc(var(--overgoal-safe-top)+1rem)] left-1/2 z-30 w-[min(90vw,28rem)] -translate-x-1/2 rounded-2xl border border-red-300/35 bg-red-950/90 px-4 py-3 text-center text-sm text-red-50"
          >
            This action uses unsupported kick controls. Refresh the match before
            interacting.
          </div>
        )}
      {isCanvasReady &&
        isDribbleScene &&
        !dribblePattern &&
        !stagedKickResult && (
          <div
            role="alert"
            className="absolute top-[calc(var(--overgoal-safe-top)+1rem)] left-1/2 z-30 w-[min(90vw,28rem)] -translate-x-1/2 rounded-2xl border border-red-300/35 bg-red-950/90 px-4 py-3 text-center text-sm text-red-50"
          >
            {parsedDribblePattern.error}
          </div>
        )}
      {canDribble && isCanvasReady && pendingAction && dribblePattern && (
        <DribbleControls
          key={pendingAction.id}
          actionId={pendingAction.id}
          pattern={dribblePattern}
          disabled={isSubmitting}
          onSubmit={handleDribbleDecision}
          onPresentationChange={setDribblePresentationState}
        />
      )}
      {canResolveRandomEvent && pendingAction && parsedRandomEvent.event && (
        <RandomEventScene
          action={pendingAction}
          event={parsedRandomEvent.event}
          disabled={isSubmitting}
          onChoose={handleRandomEventDecision}
        />
      )}
      {canRecoverUnsupportedScene && unsupportedScene && (
        <UnsupportedEventRecovery
          recovery={unsupportedScene}
          disabled={isSubmitting}
          onContinue={handleUnsupportedSceneRecovery}
        />
      )}
      {blockingSessionError}
      {releasedAimDraft &&
        kickControlEnvelope &&
        phase !== "recoverable_error" &&
        phase !== "unsupported_contract" && (
          <KickContactDialog
            envelope={kickControlEnvelope}
            contact={strikeContact}
            submittedPower={displayedKickDecision?.kick_input.power ?? 0}
            submitError={submitError}
            isSubmitting={isSubmitting}
            onContactChange={handleStrikeContactChange}
            onClose={closeContactDialog}
            onSubmit={handleKick}
            showDiagnostics={KICK_DEVELOPMENT_DIAGNOSTICS}
          />
        )}
      {stagedKickResult && fieldVisualPhase === "resolved" && (
        <div
          data-testid="kick-result"
          data-outcome-type={
            stagedKickResult.response.decision_result?.outcome_type ?? ""
          }
          className="absolute inset-x-0 bottom-0 z-30 p-4 pr-[max(var(--overgoal-safe-right),1rem)] pb-[calc(var(--overgoal-safe-bottom)+1rem)] pl-[max(var(--overgoal-safe-left),1rem)] text-white"
        >
          <div className="kick-result-panel mx-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[1.8rem] border border-cyan-300/30 bg-slate-950/88 p-4 shadow-[0_0_35px_rgba(34,211,238,0.18)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.28em] text-cyan-200/75 uppercase">
                  Scene Result
                </p>
                <p className="mt-1 text-sm font-semibold text-white/92">
                  {resultMinute}' · {stagedKickResult.sceneType}
                </p>
              </div>
              <div className="rounded-full bg-cyan-400/12 px-3 py-1 text-[10px] font-bold tracking-[0.24em] text-cyan-200 uppercase">
                Resolved
              </div>
            </div>

            <p className="mt-3 text-base leading-tight font-semibold text-white">
              {resultDescription}
            </p>

            {isStagedRandomEvent && (
              <RandomEventResultDetails result={stagedDecisionResult} />
            )}

            {debugResultContinuation ? (
              <button
                type="button"
                data-testid="next-action"
                onClick={handleNextAction}
                disabled={fieldVisualPhase !== "resolved"}
                className="mt-4 w-full rounded-2xl border border-cyan-300/35 bg-cyan-400/10 px-4 py-3 text-center text-sm font-black tracking-[0.2em] text-cyan-100 uppercase transition hover:bg-cyan-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next Action
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNextAction}
                disabled={fieldVisualPhase !== "resolved"}
                className="mt-4 w-full rounded-2xl border border-cyan-300/35 bg-cyan-400/10 px-4 py-3 text-center text-sm font-black tracking-[0.2em] text-cyan-100 uppercase transition hover:bg-cyan-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Tap to continue
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
