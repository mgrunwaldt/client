import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCanonicalFixtureRelations,
  buildCanonicalChoiceMatrix,
} from "../scripts/match-api-v1-fixture-invariants.mjs";
import { createMatchApiV1SchemaValidator } from "../scripts/match-api-v1-schema-validator.mjs";
import {
  BackendMatchResponseSchema,
  BackendMatchSnapshotSchema,
} from "../src/match/api-v1/contract";
import { fixtureUrl, readFixture } from "./match-api-v1-fixtures";

const execFile = promisify(execFileCallback);
const CONTRACT_SOURCE_REVISION = "6e3494f90157423a729666ffb2f17ec00041c067";
const REPRODUCTION_SOURCE_REVISION = "b9d96f8e3d2e584d52329c4a90abdd770e3b88c7";
const FIXTURE_MANIFEST_SHA256 =
  "8caf940d575ffe925c243a2ab80fa68c552f1956685f3e062b04259b1907b845";
const REPRODUCTION_MANIFEST_SHA256 =
  "4c0b6a613961ea5c3ef2b068d17f3458598c5144dc6426fd35d4116436c06b3b";
const verifierPath = fileURLToPath(
  new URL("../scripts/verify-match-api-v1-fixtures.mjs", import.meta.url),
);
const reproductionRoot = new URL("./fixtures/reproductions/", import.meta.url);
const temporaryRoots: string[] = [];

interface ReproductionManifest {
  source: {
    repository: string;
    revision: string;
    packet_path: string;
    description: string;
  };
  sha256: Record<string, string>;
}

interface SceneFixture {
  id: string;
  minute: number;
  action_type: string;
  scene_type: string;
  field_state_id: string;
  available_choices: Array<{ id: string }>;
  field_state: {
    id: string;
    match_id: string;
    minute: number;
    action_type: string;
    scene_family: string;
  };
}

interface EventFixture {
  match_id: string;
  event_id: number;
  minute: number;
  halftime: boolean;
  match_end: boolean;
}

interface ProgressFixture {
  minute: number;
  status: string;
  prev_time: number;
  pending_action: SceneFixture | null;
  field_state: SceneFixture["field_state"] | null;
  action: string | null;
  action_team: string | null;
  events: EventFixture[];
  match: {
    id: string;
    current_time: number;
    match_status: string;
    event_counter: number;
    pending_action: SceneFixture | null;
  };
}

interface TimelineFixture {
  timeline: EventFixture[];
}

async function collectFiles(root: URL, relativePath = ""): Promise<string[]> {
  const entries = await readdir(new URL(relativePath, root), {
    withFileTypes: true,
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${relativePath}${entry.name}`;
      if (entry.isFile()) return [path];
      if (entry.isDirectory()) return collectFiles(root, `${path}/`);
      return [];
    }),
  );

  return files.flat();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function runVerifier({
  fixtureRoot,
  reproductionRoot: reproductionFixtureRoot,
}: {
  fixtureRoot?: string;
  reproductionRoot?: string;
} = {}) {
  return execFile(process.execPath, [verifierPath], {
    env: {
      ...process.env,
      ...(fixtureRoot ? { MATCH_API_V1_FIXTURE_ROOT: fixtureRoot } : {}),
      ...(reproductionFixtureRoot
        ? { MATCH_API_V1_REPRODUCTION_ROOT: reproductionFixtureRoot }
        : {}),
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("Match API v1 test fixture mirror", () => {
  it("matches the pinned I9 contract manifest and complete source mirror", async () => {
    const manifestContents = await readFile(fixtureUrl("manifest.json"));
    const manifest = JSON.parse(manifestContents.toString()) as {
      contract: string;
      fixtures: unknown[];
    };
    expect(CONTRACT_SOURCE_REVISION).toBe(
      "6e3494f90157423a729666ffb2f17ec00041c067",
    );
    expect(manifest.contract).toBe("openapi.json");
    expect(manifest.fixtures.length).toBeGreaterThan(20);
    expect(sha256(manifestContents.toString())).toBe(FIXTURE_MANIFEST_SHA256);
    expect(await collectFiles(fixtureUrl(""))).toHaveLength(63);
  });

  it("seals and validates the complete Auth Boundary v1 fixture set", async () => {
    const contractManifest = await readFixture<{
      fixtures: Array<{
        file: string;
        schema: string;
        operation?: { method: string; path: string; body: string };
      }>;
    }>("manifest.json");
    const authFiles = [
      "player-client/auth-challenge-request.json",
      "player-client/auth-proof-request.json",
      "server/auth-challenge-response.json",
      "server/auth-session-response.json",
    ];
    const authFixtures = contractManifest.fixtures.filter((fixture) =>
      authFiles.includes(fixture.file),
    );

    expect(authFixtures).toEqual([
      expect.objectContaining({
        file: "server/auth-challenge-response.json",
        schema: "AuthChallengeResponse",
        operation: expect.objectContaining({
          method: "POST",
          path: "/auth/v1/challenges",
          body: "response",
        }),
      }),
      expect.objectContaining({
        file: "server/auth-session-response.json",
        schema: "AuthSessionResponse",
        operation: expect.objectContaining({
          method: "POST",
          path: "/auth/v1/sessions",
          body: "response",
        }),
      }),
      expect.objectContaining({
        file: "player-client/auth-challenge-request.json",
        schema: "AuthChallengeRequest",
        operation: expect.objectContaining({
          method: "POST",
          path: "/auth/v1/challenges",
          body: "request",
        }),
      }),
      expect.objectContaining({
        file: "player-client/auth-proof-request.json",
        schema: "AuthProofRequest",
        operation: expect.objectContaining({
          method: "POST",
          path: "/auth/v1/sessions",
          body: "request",
        }),
      }),
    ]);
    const proof = await readFixture<Record<string, unknown>>(
      "player-client/auth-proof-request.json",
    );
    expect(Object.keys(proof).sort()).toEqual(["challenge_id", "signature"]);
  });

  it("validates every mirrored payload against the mirrored OpenAPI schemas", async () => {
    await expect(runVerifier()).resolves.toMatchObject({
      stdout: expect.stringContaining("Match API v1 fixtures verified"),
    });
  });

  it("parses the current engine/7 spatial and tactics contract", async () => {
    const progress = await readFixture<unknown>(
      "server/waiting-open-play-response.json",
    );
    const snapshot = await readFixture<unknown>(
      "server/match-snapshot-engine-7-response.json",
    );

    const parsedProgress = BackendMatchResponseSchema.safeParse(progress);
    expect(parsedProgress.success).toBe(true);
    expect(BackendMatchSnapshotSchema.safeParse(snapshot).success).toBe(true);

    if (!parsedProgress.success || !parsedProgress.data.field_state) return;
    const fieldState = parsedProgress.data.field_state;
    expect(fieldState.coordinate_system?.version).toBe(
      "field-coordinate-system/1",
    );
    expect(fieldState.coordinate_system?.z.unit).toBe("METRE");
    expect(fieldState.sequence?.camera.locked).toBe(true);
    expect(fieldState.sequence?.camera.view_window).toEqual(
      expect.objectContaining({ width: 100, height: 50 }),
    );
    expect(fieldState.my_team_positions[0]).toEqual(
      expect.objectContaining({
        team_id: "team_1",
        team_side: "MY_TEAM",
        collision_shape: expect.objectContaining({ height_m: 2 }),
      }),
    );
  });

  it("rejects missing, unknown, and malformed engine/7 spatial data", async () => {
    const original = await readFixture<Record<string, unknown>>(
      "server/waiting-open-play-response.json",
    );
    const fieldState = (value: Record<string, unknown>) =>
      value.field_state as Record<string, unknown>;
    const pendingFieldState = (value: Record<string, unknown>) =>
      (value.pending_action as Record<string, unknown>).field_state as Record<
        string,
        unknown
      >;
    const mutations: Array<{
      name: string;
      mutate: (value: Record<string, unknown>) => void;
    }> = [
      {
        name: "missing coordinate system",
        mutate: (value) => {
          delete fieldState(value).coordinate_system;
        },
      },
      {
        name: "unknown coordinate system field",
        mutate: (value) => {
          (
            fieldState(value).coordinate_system as Record<string, unknown>
          ).extra = true;
        },
      },
      {
        name: "missing player team identity",
        mutate: (value) => {
          delete (
            pendingFieldState(value).my_team_positions as Array<
              Record<string, unknown>
            >
          )[0].team_id;
        },
      },
      {
        name: "unknown player side",
        mutate: (value) => {
          (
            fieldState(value).opponent_positions as Array<
              Record<string, unknown>
            >
          )[0].team_side = "UNKNOWN_TEAM";
        },
      },
      {
        name: "missing collision geometry",
        mutate: (value) => {
          delete (
            fieldState(value).my_team_positions as Array<
              Record<string, unknown>
            >
          )[0].collision_shape;
        },
      },
      {
        name: "unlocked sequence camera",
        mutate: (value) => {
          (
            (fieldState(value).sequence as Record<string, unknown>)
              .camera as Record<string, unknown>
          ).locked = false;
        },
      },
      {
        name: "unknown view window field",
        mutate: (value) => {
          (
            (
              (fieldState(value).sequence as Record<string, unknown>)
                .camera as Record<string, unknown>
            ).view_window as Record<string, unknown>
          ).zoom = 1.5;
        },
      },
      {
        name: "missing current action sequence",
        mutate: (value) => {
          delete (value.pending_action as Record<string, unknown>)
            .action_sequence;
        },
      },
      {
        name: "missing canonical kick control envelope",
        mutate: (value) => {
          delete (value.pending_action as Record<string, unknown>)
            .control_envelope;
        },
      },
      {
        name: "unknown current scene type",
        mutate: (value) => {
          (value.pending_action as Record<string, unknown>).scene_type =
            "FUTURE_SCENE";
        },
      },
      {
        name: "incomplete current choice contract",
        mutate: (value) => {
          delete (
            (value.pending_action as Record<string, unknown>)
              .available_choices as Array<Record<string, unknown>>
          )[0].input_schema;
        },
      },
    ];

    for (const { mutate, name } of mutations) {
      const mutated = structuredClone(original);
      mutate(mutated);
      expect(BackendMatchResponseSchema.safeParse(mutated).success, name).toBe(
        false,
      );
    }

    const invalidTrajectory = structuredClone(original);
    invalidTrajectory.decision_result = {
      description: "The kick stays in play.",
      success: true,
      outcome_type: "KICK_TO_OPEN_PLAY",
      flight_path: [{ x: 50, y: 40, z: 0.11, t: 0 }],
      flight_outcome: "TEAMMATE_CONTROL",
      final_point: { x: 50, y: 40, z: 0.11, t: 0 },
    };
    expect(
      BackendMatchResponseSchema.safeParse(invalidTrajectory).success,
    ).toBe(false);

    const unknownTrajectoryField = structuredClone(original);
    unknownTrajectoryField.decision_result = {
      description: "The kick stays in play.",
      success: true,
      outcome_type: "KICK_TO_OPEN_PLAY",
      flight_path: [
        { x: 50, y: 40, z: 0.11, t: 0, extra: true },
        { x: 52, y: 32, z: 0.11, t: 0.4 },
      ],
      flight_outcome: "TEAMMATE_CONTROL",
      final_point: { x: 52, y: 32, z: 0.11, t: 0.4 },
    };
    expect(
      BackendMatchResponseSchema.safeParse(unknownTrajectoryField).success,
    ).toBe(false);

    const nonMonotonicTrajectory = structuredClone(original);
    nonMonotonicTrajectory.decision_result = {
      description: "The kick stays in play.",
      success: true,
      outcome_type: "KICK_TO_OPEN_PLAY",
      flight_path: [
        { x: 50, y: 40, z: 0.11, t: 0.4 },
        { x: 52, y: 32, z: 0.11, t: 0.4 },
      ],
      flight_outcome: "TEAMMATE_CONTROL",
      final_point: { x: 52, y: 32, z: 0.11, t: 0.4 },
    };
    expect(
      BackendMatchResponseSchema.safeParse(nonMonotonicTrajectory).success,
    ).toBe(false);

    const missingFinalPoint = structuredClone(original);
    missingFinalPoint.decision_result = {
      description: "The kick stays in play.",
      success: true,
      outcome_type: "KICK_TO_OPEN_PLAY",
      flight_path: [
        { x: 50, y: 40, z: 0.11, t: 0 },
        { x: 52, y: 32, z: 0.11, t: 0.4 },
      ],
      flight_outcome: "TEAMMATE_CONTROL",
    };
    expect(
      BackendMatchResponseSchema.safeParse(missingFinalPoint).success,
    ).toBe(false);

    const mismatchedFinalPoint = structuredClone(original);
    mismatchedFinalPoint.decision_result = {
      description: "The kick stays in play.",
      success: true,
      outcome_type: "KICK_TO_OPEN_PLAY",
      flight_path: [
        { x: 50, y: 40, z: 0.11, t: 0 },
        { x: 52, y: 32, z: 0.11, t: 0.4 },
      ],
      flight_outcome: "TEAMMATE_CONTROL",
      final_point: { x: 53, y: 32, z: 0.11, t: 0.4 },
    };
    expect(
      BackendMatchResponseSchema.safeParse(mismatchedFinalPoint).success,
    ).toBe(false);

    const missingCanonicalTrajectory = structuredClone(original);
    missingCanonicalTrajectory.decision_result = {
      description: "A canonical kick cannot omit playback.",
      success: false,
      outcome_type: "OPEN_PLAY_OUT",
      kick_resolution: { version: 1 },
    };
    expect(
      BackendMatchResponseSchema.safeParse(missingCanonicalTrajectory).success,
    ).toBe(false);

    const discontinuousAutomaticShot = structuredClone(original);
    discontinuousAutomaticShot.decision_result = {
      description: "The receiver shoots automatically.",
      success: true,
      outcome_type: "AUTOMATIC_TEAMMATE_GOAL",
      flight_path: [
        { x: 50, y: 40, z: 0.11, t: 0 },
        { x: 52, y: 20, z: 0.11, t: 0.8 },
      ],
      flight_outcome: "PASS_CONTROL",
      final_point: { x: 52, y: 20, z: 0.11, t: 0.8 },
      automatic_follow_up: {
        type: "TEAMMATE_SHOT",
        actor_player_id: "team_1_ST_10",
        opportunity: {
          eligible: true,
          score: 84,
          distance_to_goal_m: 11,
          nearest_defender_m: 3,
          lane_blocked: false,
          scene_pressure: 62,
          receive_speed_mps: 8,
        },
        flight_path: [
          { x: 60, y: 20, z: 0.11, t: 0 },
          { x: 50, y: 0, z: 0.11, t: 0.7 },
        ],
        flight_outcome: "GOAL",
        final_point: { x: 50, y: 0, z: 0.11, t: 0.7 },
        contact: null,
        frame_contacts: [],
      },
    };
    expect(
      BackendMatchResponseSchema.safeParse(discontinuousAutomaticShot).success,
    ).toBe(false);

    const divergentEmbeddedField = structuredClone(original);
    (
      (divergentEmbeddedField.pending_action as Record<string, unknown>)
        .field_state as Record<string, unknown>
    ).ball_y = 99;
    expect(
      BackendMatchResponseSchema.safeParse(divergentEmbeddedField).success,
    ).toBe(false);
  });

  it("keeps engine/1 through engine/6 snapshot parsing compatible", async () => {
    for (const engineVersion of [1, 2, 3, 4, 5, 6]) {
      const snapshot = await readFixture<unknown>(
        `server/match-snapshot-engine-${engineVersion}-response.json`,
      );
      expect(
        BackendMatchSnapshotSchema.safeParse(snapshot).success,
        `match-engine/${engineVersion}`,
      ).toBe(true);
    }
  });

  it("rejects a format-invalid mutation with the canonical AJV 2020-12 validator", async () => {
    const openapi = await readFixture<Record<string, unknown>>("openapi.json");
    const validator = createMatchApiV1SchemaValidator(openapi);
    const validHealthResponse = {
      status: "ok",
      timestamp: "2026-07-16T12:00:00.000Z",
    };
    const formatInvalidMutation = {
      ...validHealthResponse,
      timestamp: "not-a-date-time",
    };

    expect(
      validator.validate("HealthResponse", validHealthResponse).valid,
    ).toBe(true);
    const result = validator.validate("HealthResponse", formatInvalidMutation);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ keyword: "format" })]),
    );
  });

  it("rejects a mutation of the pinned backend fixture mirror", async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), "overgoal-fixture-tamper-"),
    );
    temporaryRoots.push(temporaryRoot);
    const mirrorRoot = join(temporaryRoot, "match-api-v1");
    await cp(fixtureUrl(""), mirrorRoot, { recursive: true });

    const payloadPath = join(
      mirrorRoot,
      "fixtures/server/fulltime-response.json",
    );
    const payload = JSON.parse(await readFile(payloadPath, "utf8"));
    payload.status = "FINISHED_TAMPERED";
    const payloadContents = `${JSON.stringify(payload, null, 2)}\n`;
    await writeFile(payloadPath, payloadContents);

    const failure = await runVerifier({ fixtureRoot: mirrorRoot }).then(
      () => "",
      (error: { stderr?: string; stdout?: string }) =>
        `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
    );
    expect(failure).toContain("mirror tree digest mismatch");
  });

  it("rejects a reproduction packet and mutable manifest changed together", async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), "overgoal-reproduction-tamper-"),
    );
    temporaryRoots.push(temporaryRoot);
    const copiedReproductionRoot = join(temporaryRoot, "reproductions");
    await cp(reproductionRoot, copiedReproductionRoot, { recursive: true });

    const packetPath = join(
      copiedReproductionRoot,
      "self-pass-follow-up-response.json",
    );
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    packet.events[0].description = "Tampered but schema-valid description.";
    const packetContents = `${JSON.stringify(packet, null, 2)}\n`;
    await writeFile(packetPath, packetContents);

    const manifestPath = join(
      copiedReproductionRoot,
      "reproduction-manifest.json",
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.sha256["self-pass-follow-up-response.json"] =
      sha256(packetContents);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const failure = await runVerifier({
      reproductionRoot: copiedReproductionRoot,
    }).then(
      () => "",
      (error: { stderr?: string; stdout?: string }) =>
        `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
    );
    expect(failure).toContain("reproduction-manifest digest mismatch");
  });

  it("pins the self-pass packet in a separately sealed source manifest", async () => {
    const manifestContents = await readFile(
      new URL("reproduction-manifest.json", reproductionRoot),
    );
    const manifest = JSON.parse(
      manifestContents.toString(),
    ) as ReproductionManifest;

    expect(manifest.source).toEqual({
      repository: "https://github.com/overgoal/match_server",
      revision: REPRODUCTION_SOURCE_REVISION,
      packet_path: "self-pass-follow-up-response.json",
      description:
        "Frozen M0 self-pass follow-up response packet for client hydration only.",
    });
    expect(sha256(manifestContents.toString())).toBe(
      REPRODUCTION_MANIFEST_SHA256,
    );
    expect(Object.keys(manifest.sha256).sort()).toEqual([
      "README.md",
      "self-pass-follow-up-response.json",
    ]);
  });

  it("derives and enforces every canonical scene choice matrix and lifecycle relation", async () => {
    const openapi = await readFixture<Record<string, unknown>>("openapi.json");
    const choiceMatrix = buildCanonicalChoiceMatrix(openapi);
    const manifest = await readFixture<{
      fixtures: Array<{ file: string; schema: string; valid?: boolean }>;
    }>("manifest.json");
    const sceneFixtures = manifest.fixtures.filter((fixture) =>
      fixture.file.startsWith("../examples/scenes/"),
    );
    expect(choiceMatrix.size).toBe(10);
    expect(sceneFixtures).toHaveLength(10);

    for (const fixture of sceneFixtures) {
      const file = `scenes/${fixture.file.split("/").at(-1)}`;
      const scene = await readFixture<SceneFixture>(file);
      expect(
        scene.available_choices.map((choice) => choice.id),
        file,
      ).toEqual(choiceMatrix.get(scene.scene_type)?.choiceIds);
      expect(() =>
        assertCanonicalFixtureRelations({
          choiceMatrix,
          file,
          schemaName: fixture.schema,
          value: scene,
        }),
      ).not.toThrow();
    }

    for (const [file, schemaName] of [
      ["server/waiting-open-play-response.json", "MatchProgressResponse"],
      ["server/halftime-response.json", "MatchProgressResponse"],
      ["server/fulltime-response.json", "MatchProgressResponse"],
      ["server/dribble-success-response.json", "MatchProgressResponse"],
      ["server/dribble-failed-response.json", "MatchProgressResponse"],
      ["server/match-snapshot-response.json", "MatchSnapshotResponse"],
      ["server/timeline-response.json", "TimelineResponse"],
    ] as const) {
      const value = await readFixture<unknown>(file);
      expect(() =>
        assertCanonicalFixtureRelations({
          choiceMatrix,
          file,
          schemaName,
          value,
        }),
      ).not.toThrow();
    }
  });

  it("rejects choice, linkage, minute, duplicate, and ordering mutations", async () => {
    const openapi = await readFixture<Record<string, unknown>>("openapi.json");
    const choiceMatrix = buildCanonicalChoiceMatrix(openapi);
    const openPlay = await readFixture<SceneFixture>("scenes/open-play.json");
    const waiting = await readFixture<ProgressFixture>(
      "server/waiting-open-play-response.json",
    );
    const timeline = await readFixture<TimelineFixture>(
      "server/timeline-response.json",
    );
    const assertScene = (value: SceneFixture) =>
      assertCanonicalFixtureRelations({
        choiceMatrix,
        file: "scenes/open-play.json",
        schemaName: "OpenPlayPendingAction",
        value,
      });
    const assertProgress = (value: ProgressFixture) =>
      assertCanonicalFixtureRelations({
        choiceMatrix,
        file: "server/waiting-open-play-response.json",
        schemaName: "MatchProgressResponse",
        value,
      });

    const choiceMutation = structuredClone(openPlay);
    choiceMutation.available_choices.push({
      ...choiceMutation.available_choices[0],
      id: "DRIBBLE",
    });
    expect(() => assertScene(choiceMutation)).toThrow(
      /choices must equal x-overgoal-choice-ids/,
    );

    const fieldMinuteMutation = structuredClone(openPlay);
    fieldMinuteMutation.field_state.minute += 1;
    expect(() => assertScene(fieldMinuteMutation)).toThrow(
      /pending action and field state minutes differ/,
    );

    const fieldLinkMutation = structuredClone(openPlay);
    fieldLinkMutation.field_state.id = "wrong-field";
    expect(() => assertScene(fieldLinkMutation)).toThrow(
      /pending field_state_id does not match field state id/,
    );

    const responseMinuteMutation = structuredClone(waiting);
    if (!responseMinuteMutation.pending_action) {
      throw new Error("waiting fixture lost its pending action");
    }
    responseMinuteMutation.pending_action.minute += 1;
    expect(() => assertProgress(responseMinuteMutation)).toThrow(
      /pending action and field state minutes differ|response, pending action, and field state minutes differ/,
    );

    const eventMinuteMutation = structuredClone(waiting);
    eventMinuteMutation.events[0].minute += 1;
    expect(() => assertProgress(eventMinuteMutation)).toThrow(
      /event 1 minute must equal response minute/,
    );

    const duplicateEventMutation = structuredClone(waiting);
    duplicateEventMutation.events.push(
      structuredClone(duplicateEventMutation.events[0]),
    );
    expect(() => assertProgress(duplicateEventMutation)).toThrow(
      /duplicate event_id/,
    );

    const eventOrderMutation = structuredClone(timeline);
    eventOrderMutation.timeline.reverse();
    expect(() =>
      assertCanonicalFixtureRelations({
        choiceMatrix,
        file: "server/timeline-response.json",
        schemaName: "TimelineResponse",
        value: eventOrderMutation,
      }),
    ).toThrow(/events must be strictly ordered by event_id/);
  });

  it("keeps complete playable-scene coverage and raw JSON parsing independent of runtime code", async () => {
    const sceneFiles = (await collectFiles(fixtureUrl("scenes/"))).sort();
    const scenes = await Promise.all(
      sceneFiles.map((file) => readFixture<SceneFixture>(`scenes/${file}`)),
    );
    expect(scenes.map((scene) => scene.scene_type).sort()).toEqual([
      "ARGUMENT_OPPONENT",
      "ARGUMENT_TEAMMATE",
      "BATHROOM",
      "BRAWL",
      "CORNER",
      "DRIBBLE",
      "FREE_KICK",
      "JUMPER",
      "OPEN_PLAY",
      "PENALTY",
    ]);
    expect(
      scenes.every((scene) => scene.minute === scene.field_state.minute),
    ).toBe(true);

    const files = await collectFiles(fixtureUrl(""));
    for (const file of files.filter((candidate) =>
      candidate.endsWith(".json"),
    )) {
      const parsed = JSON.parse(await readFile(fixtureUrl(file), "utf8"));
      expect(JSON.parse(JSON.stringify(parsed)), file).toEqual(parsed);
    }
  });
});
