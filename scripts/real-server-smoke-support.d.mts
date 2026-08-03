export interface RealSmokeUnknownSceneCommand {
  readonly command_id: string;
  readonly expected_revision: number;
  readonly match_id: string;
  readonly operation: "INJECT_UNKNOWN_SCENE";
  readonly scene_type: "FUTURE_RANDOM_EVENT_V99";
  readonly version: 1;
}

export interface RealSmokeFixtureAcknowledgement {
  readonly actionId: string;
  readonly commandId: string;
  readonly matchId: string;
  readonly revision: number;
  readonly sceneType: "FUTURE_RANDOM_EVENT_V99";
}

export function createRealSmokeUnknownSceneCommand(options: {
  commandId?: string;
  expectedRevision: number;
  matchId: string;
}): RealSmokeUnknownSceneCommand;

export function publishRealSmokeFixtureCommand(
  stateDirectory: string,
  command: RealSmokeUnknownSceneCommand,
): Promise<void>;

export function waitForRealSmokeFixtureAcknowledgement(
  stateDirectory: string,
  commandId: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<RealSmokeFixtureAcknowledgement>;
