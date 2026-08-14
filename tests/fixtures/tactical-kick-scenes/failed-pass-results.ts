import type {
  BackendFieldPlayer,
  BackendFlightPoint,
  BackendMatchResponse,
} from "../../../src/match/api-v1/contract";
import lobBelowResponse from "./lob-below-response.json" with { type: "json" };
import lobBelowScene from "./lob-below-scene.json" with { type: "json" };

type FailureFixture = {
  expectedFamily: "interception" | "missed-target" | "overhit";
  expectedPlayerId: string | null;
  finalPoint: BackendFlightPoint;
  name: string;
  response: BackendMatchResponse;
  scene: BackendMatchResponse;
};

function baseFixture(matchId: string) {
  const replaceMatchId = (value: unknown) =>
    JSON.parse(
      JSON.stringify(value).replaceAll(lobBelowScene.match.id, matchId),
    ) as BackendMatchResponse;
  return {
    response: replaceMatchId(lobBelowResponse),
    scene: replaceMatchId(lobBelowScene),
  };
}

function teammate(scene: BackendMatchResponse): BackendFieldPlayer {
  const player = scene.field_state?.my_team_positions.find(
    (candidate) => candidate.role === "RB",
  );
  if (!player) throw new Error("Failed-pass fixture has no receiving teammate");
  return player;
}

function kickResolution(response: BackendMatchResponse) {
  const value = response.decision_result?.kick_resolution;
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function failedPassFixtures(): FailureFixture[] {
  const interception = baseFixture("match-failure-interception");
  const interceptor = interception.response.decision_result?.interceptor;
  if (!interceptor || !interception.response.decision_result?.final_point) {
    throw new Error("Engine interception fixture is incomplete");
  }

  const overhit = baseFixture("match-failure-overhit");
  const receiver = teammate(overhit.scene);
  const overhitPath = [
    { x: 50, y: 40, z: 0.11, t: 0 },
    { x: 50, y: 40.8, z: 0.18, t: 0.16 },
    { x: 50, y: 41.65, z: 0.42, t: 0.32 },
  ];
  overhit.response.decision_result = {
    ...overhit.response.decision_result,
    description:
      "The pass reaches your teammate too hard to control and possession is lost.",
    success: false,
    loose_possession: true,
    outcome_type: "OVERHIT_PASS",
    flight_outcome: "OVERHIT_TEAMMATE",
    flight_path: overhitPath,
    final_point: overhitPath.at(-1),
    receiver,
    kick_resolution: {
      ...kickResolution(overhit.response),
      classification: "PASS",
      contact: {
        type: "PLAYER",
        player_id: receiver.id,
        at: overhitPath.at(-1),
        speed_mps: 18.4,
      },
    },
  };
  delete overhit.response.decision_result.interceptor;
  delete overhit.response.decision_result.receiver_control;
  delete overhit.response.decision_result.possession_follow_up;

  const missed = baseFixture("match-failure-missed-target");
  const missedPath = [
    { x: 50, y: 40, z: 0.11, t: 0 },
    { x: 72, y: 34, z: 0.6, t: 0.35 },
    { x: 100.2, y: 25, z: 0.11, t: 0.8 },
  ];
  missed.response.decision_result = {
    ...missed.response.decision_result,
    description: "The ball goes out and possession is lost.",
    success: false,
    loose_possession: true,
    outcome_type: "KICK_OUT",
    flight_outcome: "OUT_OF_PLAY",
    flight_path: missedPath,
    final_point: missedPath.at(-1),
    kick_resolution: {
      ...kickResolution(missed.response),
      classification: "PASS",
      contact: null,
    },
  };
  delete missed.response.decision_result.interceptor;
  delete missed.response.decision_result.receiver;
  delete missed.response.decision_result.receiver_control;

  return [
    {
      name: "overhit",
      expectedFamily: "overhit",
      expectedPlayerId: receiver.id,
      finalPoint: overhitPath.at(-1)!,
      ...overhit,
    },
    {
      name: "interception",
      expectedFamily: "interception",
      expectedPlayerId: interceptor.id,
      finalPoint: interception.response.decision_result.final_point,
      ...interception,
    },
    {
      name: "missed-target",
      expectedFamily: "missed-target",
      expectedPlayerId: null,
      finalPoint: missedPath.at(-1)!,
      ...missed,
    },
  ];
}
