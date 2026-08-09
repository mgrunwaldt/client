import {
  type BackendLegendAvailabilityState,
  type BackendMatch,
  type BackendMatchOperationReceipt,
  type BackendMatchResponse,
  type BackendPendingAction,
  type BackendTimelineEvent,
  isKnownMatchStatus,
  isKnownPlayableScene,
} from "./api-v1/contract";
import { parseDribblePattern } from "./dribble-input";
import { isRandomEventAction, parseRandomEventAction } from "./random-event";
import {
  actionCommandMatchesDecision,
  commandCanRetryAfterHydration,
  fieldDraftMatchesSnapshot,
  matchCommandsExactly,
} from "./session-recovery";
import type {
  HydratedMatchSession,
  MatchPlaybackStatus,
  MatchSessionData,
  MatchSessionDiagnostic,
  MatchSessionEvent,
  MatchSessionPhase,
  MatchSessionRoute,
} from "./session-types";

export const SCENE_SUPPORT = {
  OPEN_PLAY: ["KICK"],
  DRIBBLE: ["DRIBBLE_RUN", "SIMULATE_FOUL"],
  FREE_KICK: ["KICK"],
  CORNER: ["KICK"],
  PENALTY: ["KICK"],
  JUMPER: ["ACCEPT_HUG", "DODGE", "SECURITY_TACKLE"],
  BRAWL: ["JOIN_IN", "PULL_AWAY", "STAY_OUT"],
  ARGUMENT_OPPONENT: ["TRASH_TALK", "WALK_AWAY", "HEADBUTT"],
  ARGUMENT_TEAMMATE: ["SHOUT_BACK", "CALM_DOWN", "IGNORE"],
  BATHROOM: ["ASK_FOR_SUB", "HOLD_IT", "BEHIND_BOARDS"],
} as const;

const initialData: MatchSessionData = {
  phase: "idle",
  recoveryPhase: null,
  route: "main",
  match: null,
  myTeam: null,
  opponentTeam: null,
  pendingAction: null,
  fieldState: null,
  timelineEvents: [],
  playbackMinute: 0,
  playbackStatus: "idle",
  effort: "medium",
  playstyle: "balanced",
  pendingCommand: null,
  retrySafe: false,
  fieldDraft: null,
  acknowledgedResult: null,
  decisionResult: null,
  resultPlayback: null,
  unsupportedScene: null,
  legendAvailability: null,
  halftimeSummary: null,
  fullTimeHandoff: null,
  latestOperation: null,
  diagnostic: null,
  error: null,
};

export function createInitialMatchSession(): MatchSessionData {
  return { ...initialData };
}

function controlsFromAuthoritativeTactics(
  match: BackendMatch,
): Pick<MatchSessionData, "effort" | "playstyle"> | null {
  const tactics = match.scheduled_tactics?.tactics ?? match.tactics;
  if (!tactics) return null;
  const effort = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
  } as const;
  const playstyle = {
    DEFENSIVE: "defense",
    BALANCED: "balanced",
    OFFENSIVE: "offensive",
  } as const;
  return {
    effort: effort[tactics.effort],
    playstyle: playstyle[tactics.playstyle],
  };
}

function receiptIdentityMatchesCommand(
  receipt: BackendMatchOperationReceipt | null | undefined,
  command: MatchSessionData["pendingCommand"],
) {
  if (!receipt || !command) return false;
  const operation = {
    create: "createMatch",
    start: "startMatch",
    resume: "resumeMatch",
    action: "processMatchAction",
    tactics: "updateMatchTactics",
  } as const;
  return (
    receipt.operation === operation[command.operation] &&
    receipt.request_revision === command.revision &&
    receipt.action_id === command.actionId
  );
}

function receiptMatchesCommand(
  receipt: BackendMatchOperationReceipt | null | undefined,
  command: MatchSessionData["pendingCommand"],
) {
  if (!receipt || !command) return false;
  const identityMatches = receiptIdentityMatchesCommand(receipt, command);
  if (!identityMatches || command.operation !== "action") {
    return identityMatches;
  }
  if (receiptIsNoEffectRecovery(receipt)) {
    const recovery =
      receipt.playback?.decision_result?.unsupported_scene_recovery;
    const lastDecision = receipt.playback?.last_decision;
    if (!recovery || !lastDecision || command.revision === null) return false;
    return (
      actionCommandMatchesDecision(command, {
        matchId: command.matchId,
        revision: command.revision,
        actionId: command.actionId!,
        decision: { choice: "CONTINUE_WITHOUT_EVENT" },
      }) &&
      contractValuesAgree(lastDecision.decision_data, {
        choice: "CONTINUE_WITHOUT_EVENT",
        unsupported_scene_type: recovery.scene_type,
      })
    );
  }
  return Boolean(
    receipt.playback?.last_decision &&
      command.revision !== null &&
      command.actionId &&
      actionCommandMatchesDecision(command, {
        matchId: command.matchId,
        revision: command.revision,
        actionId: command.actionId,
        decision: receipt.playback.last_decision.decision_data,
      }),
  );
}

type ActionReceiptInspection =
  | { kind: "none" }
  | { kind: "normal"; receipt: BackendMatchOperationReceipt }
  | { kind: "no_effect"; receipt: BackendMatchOperationReceipt }
  | { kind: "invalid"; message: string };

function inspectActionReceipt(
  receipt: BackendMatchOperationReceipt | null | undefined,
  payload: HydratedMatchSession,
): ActionReceiptInspection {
  if (!receipt || receipt.operation !== "processMatchAction") {
    return { kind: "none" };
  }
  if (
    receipt.committed_revision !== payload.match.revision ||
    receipt.request_revision === null ||
    !Number.isSafeInteger(receipt.request_revision) ||
    receipt.request_revision < 0 ||
    receipt.request_revision >= receipt.committed_revision
  ) {
    return {
      kind: "invalid",
      message:
        "The committed action receipt does not match the authoritative match revision.",
    };
  }
  const playback = receipt.playback;
  if (
    !receipt.action_id ||
    !playback?.decision_result ||
    !playback.last_decision
  ) {
    return {
      kind: "invalid",
      message: "The committed action receipt is missing playback identity.",
    };
  }
  const lastDecision = playback.last_decision;
  if (
    lastDecision.match_id !== payload.match.id ||
    lastDecision.action_id !== receipt.action_id
  ) {
    return {
      kind: "invalid",
      message:
        "The committed action receipt decision identity does not match the authoritative action.",
    };
  }
  if (playback.events.some((event) => event.match_id !== payload.match.id)) {
    return {
      kind: "invalid",
      message:
        "The committed action receipt contains events for another match.",
    };
  }

  if (receiptIsNoEffectRecovery(receipt)) {
    const recovery = playback.decision_result.unsupported_scene_recovery;
    if (
      playback.submitted_action !== null ||
      playback.submitted_field_state !== null ||
      !recovery ||
      recovery.action_id !== receipt.action_id ||
      recovery.recovered_revision !== receipt.committed_revision ||
      lastDecision.action !== "RANDOM_EVENT" ||
      lastDecision.action_team !== "NEUTRAL" ||
      lastDecision.action_version !== recovery.version ||
      lastDecision.decision_version !== 5 ||
      !contractValuesAgree(lastDecision.decision_data, {
        choice: "CONTINUE_WITHOUT_EVENT",
        unsupported_scene_type: recovery.scene_type,
      })
    ) {
      return {
        kind: "invalid",
        message:
          "The unsupported-scene receipt does not match its authoritative recovery identity.",
      };
    }
    return { kind: "no_effect", receipt };
  }

  const submittedAction = playback.submitted_action;
  const submittedFieldState = playback.submitted_field_state;
  if (
    !submittedAction ||
    !submittedFieldState ||
    submittedAction.id !== receipt.action_id ||
    submittedAction.field_state_id !== submittedFieldState.id ||
    submittedFieldState.match_id !== payload.match.id ||
    lastDecision.match_id !== payload.match.id ||
    lastDecision.action_id !== receipt.action_id ||
    lastDecision.field_state_id !== submittedFieldState.id ||
    lastDecision.minute !== submittedAction.minute ||
    lastDecision.action !== submittedAction.scene_type ||
    lastDecision.action_team !== submittedAction.action_team ||
    (submittedAction.field_state !== undefined &&
      (submittedAction.field_state.id !== submittedFieldState.id ||
        submittedAction.field_state.match_id !== payload.match.id))
  ) {
    return {
      kind: "invalid",
      message:
        "The committed action receipt does not match the submitted action and field state.",
    };
  }
  return { kind: "normal", receipt };
}

function receiptIsNoEffectRecovery(
  receipt: BackendMatchOperationReceipt | null | undefined,
) {
  return Boolean(
    receipt?.operation === "processMatchAction" &&
      receipt.playback?.decision_result?.outcome_type === "SKIPPED_NO_EFFECT",
  );
}

function resultReceiptIdentity(
  matchId: string,
  receipt: BackendMatchOperationReceipt | null,
) {
  if (!receipt?.action_id) return null;
  return {
    matchId,
    committedRevision: receipt.committed_revision,
    actionId: receipt.action_id,
  };
}

function resultReceiptWasAcknowledged(
  state: MatchSessionData,
  matchId: string,
  receipt: BackendMatchOperationReceipt,
) {
  const identity = state.acknowledgedResult;
  return Boolean(
    identity &&
      identity.matchId === matchId &&
      identity.committedRevision === receipt.committed_revision &&
      identity.actionId === receipt.action_id,
  );
}

function safeRetryAfterHydration(
  state: MatchSessionData,
  payload: HydratedMatchSession,
): MatchSessionPhase | null {
  const command = state.pendingCommand;
  const commandIsInFlight = ["starting", "resuming", "submitting"].includes(
    state.phase,
  );
  if (
    !command ||
    !commandCanRetryAfterHydration(command, { match: payload.match }) ||
    receiptMatchesCommand(payload.latestOperation, command)
  ) {
    return null;
  }
  if (commandIsInFlight && !sameRevisionHydrationAgrees(state, payload)) {
    return null;
  }
  if (command.operation === "action") {
    return commandMatchesCurrentScene(
      payload.pendingAction ?? payload.match.pending_action ?? null,
      command,
      payload.match.revision,
    )
      ? "scene_ready"
      : null;
  }
  if (
    command.operation === "start" &&
    payload.match.match_status === "NOT_STARTED"
  ) {
    return "created";
  }
  if (
    command.operation === "resume" &&
    payload.match.match_status === "HALFTIME"
  ) {
    return "halftime";
  }
  return null;
}

function mergeTimelineEvents(
  existing: BackendTimelineEvent[],
  incoming: BackendTimelineEvent[],
) {
  const merged = new Map<string, BackendTimelineEvent>();
  for (const event of [...existing, ...incoming]) {
    merged.set(`${event.match_id}_${event.event_id}`, event);
  }
  return Array.from(merged.values()).sort(
    (left, right) => left.event_id - right.event_id,
  );
}

function routeForPhase(phase: MatchSessionPhase): MatchSessionRoute {
  switch (phase) {
    case "created":
    case "starting":
      return "prematch";
    case "scene_ready":
    case "submitting":
    case "result_playback":
    case "unsupported_recovery":
      return "field";
    case "timeline_playback":
    case "resuming":
    case "halftime":
    case "finished":
    case "legend_unavailable_simulation":
      return "timeline";
    default:
      return "main";
  }
}

function playbackStatusForPhase(phase: MatchSessionPhase): MatchPlaybackStatus {
  switch (phase) {
    case "created":
      return "created";
    case "timeline_playback":
    case "legend_unavailable_simulation":
      return "timeline_playing";
    case "scene_ready":
    case "submitting":
    case "result_playback":
    case "unsupported_recovery":
      return "field_ready";
    default:
      return "idle";
  }
}

function withPhase(
  state: MatchSessionData,
  phase: MatchSessionPhase,
): MatchSessionData {
  return {
    ...state,
    phase,
    route: routeForPhase(phase),
    playbackStatus: playbackStatusForPhase(phase),
  };
}

function diagnosticState(
  state: MatchSessionData,
  diagnostic: MatchSessionDiagnostic,
  phase: MatchSessionPhase = "recoverable_error",
) {
  const recoveryPhase = (() => {
    switch (state.phase) {
      case "creating":
        return "idle" as const;
      case "starting":
        return "created" as const;
      case "resuming":
        return "halftime" as const;
      case "submitting":
        return state.unsupportedScene
          ? ("unsupported_recovery" as const)
          : ("scene_ready" as const);
      case "recoverable_error":
      case "unsupported_contract":
        return state.recoveryPhase;
      default:
        return state.phase;
    }
  })();
  return withPhase(
    {
      ...state,
      recoveryPhase,
      diagnostic,
      error: diagnostic.message,
    },
    phase,
  );
}

function unsupportedStatus(state: MatchSessionData, status: string) {
  return diagnosticState(
    state,
    {
      kind: "unsupported_status",
      message: `The match service returned unsupported status ${status}.`,
      retryable: true,
    },
    "unsupported_contract",
  );
}

function unsupportedScene(state: MatchSessionData, scene: string) {
  return diagnosticState(
    state,
    {
      kind: "unsupported_scene",
      message: `The match service returned unsupported scene ${scene}.`,
      retryable: true,
    },
    "unsupported_contract",
  );
}

function unsupportedSceneRecovery(
  state: MatchSessionData,
  recovery: NonNullable<HydratedMatchSession["unsupportedScene"]>,
) {
  return withPhase(
    {
      ...state,
      unsupportedScene: recovery,
      diagnostic: {
        kind: "unsupported_scene",
        message: `The match service returned unsupported scene ${recovery.scene_type}.`,
        retryable: true,
      },
      error: null,
    },
    "unsupported_recovery",
  );
}

function commandMatchesCurrentScene(
  pending: BackendPendingAction | null,
  command: MatchSessionData["pendingCommand"],
  matchRevision: number,
) {
  return Boolean(
    pending &&
      command &&
      command.operation === "action" &&
      command.matchId === pending.field_state?.match_id &&
      command.actionId === pending.id &&
      command.revision !== null &&
      command.revision >= matchRevision,
  );
}

function pendingActionContractError(
  match: BackendMatch,
  pendingAction: BackendPendingAction,
) {
  const advertised = match.pending_action;
  const fieldState = pendingAction.field_state;
  if (advertised && advertised.id !== pendingAction.id) {
    return "The match and response advertise different pending actions.";
  }
  if (!fieldState) {
    return "A playable pending action requires an authoritative field state.";
  }
  if (
    fieldState.id !== pendingAction.field_state_id ||
    fieldState.match_id !== match.id ||
    fieldState.minute !== pendingAction.minute ||
    fieldState.action_type !== pendingAction.action_type ||
    pendingAction.minute !== match.current_time
  ) {
    return "The pending action does not match its authoritative field state.";
  }

  const players = [
    ...fieldState.my_team_positions,
    ...fieldState.opponent_positions,
  ];
  const owners = players.filter((player) => player.has_ball === true);
  if (
    owners.length !== 1 ||
    owners[0].id !== fieldState.carrier_player_id ||
    !players.some((player) => player.id === fieldState.legend_player_id) ||
    fieldState.context?.carrier_player_id !== fieldState.carrier_player_id
  ) {
    return "The field state contains inconsistent player or ball ownership.";
  }

  const expectedChoices = SCENE_SUPPORT[
    pendingAction.scene_type as keyof typeof SCENE_SUPPORT
  ] as readonly string[];
  const actualChoices = pendingAction.available_choices.map(
    (choice) => choice.id,
  );
  // Sealed pre-M2 replays advertised DRIBBLE inside OPEN_PLAY. Keep those
  // persisted responses readable, but never expose this as a current scene
  // capability or generate it from current contracts.
  const isLegacyOpenPlay =
    pendingAction.scene_type === "OPEN_PLAY" &&
    actualChoices.length === 2 &&
    actualChoices[0] === "KICK" &&
    actualChoices[1] === "DRIBBLE";
  const acceptedChoices = isLegacyOpenPlay
    ? ["KICK", "DRIBBLE"]
    : expectedChoices;
  if (
    !isRandomEventAction(pendingAction) &&
    (actualChoices.length !== acceptedChoices.length ||
      new Set(actualChoices).size !== actualChoices.length ||
      acceptedChoices.some((choice) => !actualChoices.includes(choice)))
  ) {
    return `Scene ${pendingAction.scene_type} advertises an invalid choice set.`;
  }
  if (pendingAction.scene_type === "DRIBBLE") {
    const parsed = parseDribblePattern(fieldState.dribble_pattern);
    if (!parsed.pattern) {
      return parsed.error;
    }
  }
  if (isRandomEventAction(pendingAction)) {
    const parsed = parseRandomEventAction(pendingAction);
    if (!parsed.event) {
      return parsed.error ?? "The random event contract is unsupported.";
    }
  }
  return null;
}

function pendingActionsAgree(
  advertised: BackendPendingAction | null,
  supplied: BackendPendingAction | null,
) {
  if (!advertised || !supplied) return advertised === supplied;
  const fieldsAgree =
    !advertised.field_state ||
    !supplied.field_state ||
    contractValuesAgree(advertised.field_state, supplied.field_state);
  return (
    advertised.id === supplied.id &&
    advertised.minute === supplied.minute &&
    advertised.action_type === supplied.action_type &&
    advertised.scene_type === supplied.scene_type &&
    advertised.action_team === supplied.action_team &&
    advertised.field_state_id === supplied.field_state_id &&
    advertised.contract_version === supplied.contract_version &&
    advertised.available_choices.map((choice) => choice.id).join("\u0000") ===
      supplied.available_choices.map((choice) => choice.id).join("\u0000") &&
    fieldsAgree
  );
}

function contractValuesAgree(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => contractValuesAgree(value, right[index]))
    );
  }
  if (
    typeof left === "object" &&
    left !== null &&
    typeof right === "object" &&
    right !== null
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] &&
          contractValuesAgree(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

function sameRevisionHydrationAgrees(
  state: MatchSessionData,
  payload: HydratedMatchSession,
) {
  const incomingPendingAction =
    payload.pendingAction === undefined
      ? payload.match.pending_action
      : payload.pendingAction;
  return (
    state.match?.match_status === payload.match.match_status &&
    state.match.current_time === payload.match.current_time &&
    state.match.my_team_score === payload.match.my_team_score &&
    state.match.opponent_team_score === payload.match.opponent_team_score &&
    pendingActionsAgree(state.pendingAction, incomingPendingAction)
  );
}

function phaseForMatch(
  match: BackendMatch,
  pendingAction: BackendPendingAction | null,
  legendAvailability: BackendLegendAvailabilityState | null,
) {
  if (!isKnownMatchStatus(match.match_status)) return null;
  const legendIsUnavailable = legendAvailability
    ? legendAvailability.availability === "UNAVAILABLE"
    : match.player_participation === "OBSERVING";
  switch (match.match_status) {
    case "NOT_STARTED":
      return "created" as const;
    case "IN_PROGRESS":
      return legendIsUnavailable
        ? ("legend_unavailable_simulation" as const)
        : ("timeline_playback" as const);
    case "WAITING_FOR_DECISION":
      return legendIsUnavailable
        ? ("legend_unavailable_simulation" as const)
        : pendingAction
          ? ("timeline_playback" as const)
          : null;
    case "WAITING_FOR_RECOVERY":
      return null;
    case "HALFTIME":
      return "halftime" as const;
    case "FINISHED":
      return legendAvailability?.availability === "UNAVAILABLE" &&
        match.prev_time < match.current_time
        ? ("legend_unavailable_simulation" as const)
        : ("finished" as const);
  }
}

function applyAuthoritativeSnapshot(
  state: MatchSessionData,
  payload: HydratedMatchSession,
  options: {
    preservePlayback: boolean;
    resultPlayback: boolean;
    playbackMinute?: number;
  },
): MatchSessionData {
  if (
    payload.pendingAction !== undefined &&
    !pendingActionsAgree(payload.match.pending_action, payload.pendingAction)
  ) {
    return diagnosticState(state, {
      kind: "contract",
      message: "Hydrated match and pending action disagree.",
      retryable: true,
    });
  }
  const pendingAction =
    payload.pendingAction === undefined
      ? (payload.match.pending_action ?? null)
      : payload.pendingAction;
  const match = payload.match;
  const authoritativeControls = controlsFromAuthoritativeTactics(match);
  const unsupportedRecovery = payload.unsupportedScene ?? null;
  const hydratedState = {
    ...state,
    match,
    myTeam: payload.myTeam,
    opponentTeam: payload.opponentTeam,
    pendingAction,
    fieldState: pendingAction?.field_state ?? null,
    timelineEvents: mergeTimelineEvents(
      state.match?.id === match.id ? state.timelineEvents : [],
      payload.timelineEvents,
    ),
    unsupportedScene: unsupportedRecovery,
    legendAvailability: payload.legendAvailability ?? state.legendAvailability,
    halftimeSummary: payload.halftimeSummary ?? state.halftimeSummary,
    fullTimeHandoff: payload.fullTimeHandoff ?? state.fullTimeHandoff,
    latestOperation: payload.latestOperation ?? null,
    ...(authoritativeControls ?? {}),
  };
  if (unsupportedRecovery) {
    if (
      match.match_status !== "WAITING_FOR_RECOVERY" ||
      pendingAction !== null ||
      match.pending_action !== null
    ) {
      return diagnosticState(hydratedState, {
        kind: "contract",
        message:
          "Unsupported-scene recovery does not match the authoritative action.",
        retryable: true,
      });
    }
    return unsupportedSceneRecovery(hydratedState, unsupportedRecovery);
  }
  const phase = phaseForMatch(
    match,
    pendingAction,
    payload.legendAvailability ?? state.legendAvailability,
  );
  if (!phase) {
    if (match.match_status === "WAITING_FOR_RECOVERY") {
      return diagnosticState(hydratedState, {
        kind: "contract",
        message: "WAITING_FOR_RECOVERY requires unsupported_scene diagnostics.",
        retryable: true,
      });
    }
    return pendingAction
      ? unsupportedStatus(hydratedState, match.match_status)
      : diagnosticState(hydratedState, {
          kind: "contract",
          message: "WAITING_FOR_DECISION requires a pending action.",
          retryable: true,
        });
  }
  if (pendingAction && !isKnownPlayableScene(pendingAction.scene_type)) {
    return unsupportedScene(hydratedState, pendingAction.scene_type);
  }
  if (pendingAction) {
    const contractError = pendingActionContractError(
      payload.match,
      pendingAction,
    );
    if (contractError) {
      return diagnosticState(hydratedState, {
        kind: "contract",
        message: contractError,
        retryable: true,
      });
    }
  }
  const sameMatch = state.match?.id === match.id;
  const preservePlayback =
    options.preservePlayback &&
    sameMatch &&
    ["timeline_playback", "legend_unavailable_simulation"].includes(
      state.phase,
    ) &&
    ["timeline_playback", "legend_unavailable_simulation"].includes(phase);
  const nextPhase = options.resultPlayback ? "result_playback" : phase;
  const fieldState = pendingAction?.field_state ?? null;
  const pendingCommand =
    state.pendingCommand &&
    commandCanRetryAfterHydration(state.pendingCommand, { match }) &&
    (state.pendingCommand.operation !== "action" ||
      commandMatchesCurrentScene(
        pendingAction,
        state.pendingCommand,
        match.revision,
      ))
      ? state.pendingCommand
      : null;
  const fieldDraft = fieldDraftMatchesSnapshot(state.fieldDraft, {
    match,
    pendingAction,
  })
    ? state.fieldDraft
    : null;
  return withPhase(
    {
      ...state,
      match,
      myTeam: payload.myTeam,
      opponentTeam: payload.opponentTeam,
      pendingAction,
      fieldState,
      timelineEvents: mergeTimelineEvents(
        sameMatch ? state.timelineEvents : [],
        payload.timelineEvents,
      ),
      playbackMinute: preservePlayback
        ? state.playbackMinute
        : (options.playbackMinute ??
          (phase === "timeline_playback" ||
          phase === "legend_unavailable_simulation"
            ? (payload.match.prev_time ?? 0)
            : payload.match.current_time)),
      pendingCommand,
      retrySafe: false,
      fieldDraft,
      decisionResult: options.resultPlayback ? state.decisionResult : null,
      resultPlayback: options.resultPlayback ? state.resultPlayback : null,
      unsupportedScene: null,
      legendAvailability:
        payload.legendAvailability ?? state.legendAvailability,
      halftimeSummary: payload.halftimeSummary ?? state.halftimeSummary,
      fullTimeHandoff: payload.fullTimeHandoff ?? state.fullTimeHandoff,
      latestOperation: payload.latestOperation ?? null,
      ...(authoritativeControls ?? {}),
      diagnostic: null,
      error: null,
    },
    nextPhase,
  );
}

function responsePayload(
  state: MatchSessionData,
  response: BackendMatchResponse,
): HydratedMatchSession | null {
  if (!state.myTeam || !state.opponentTeam) return null;
  const pendingAction =
    response.pending_action &&
    !response.pending_action.field_state &&
    response.field_state
      ? { ...response.pending_action, field_state: response.field_state }
      : response.pending_action;
  return {
    match: response.match,
    myTeam: state.myTeam,
    opponentTeam: state.opponentTeam,
    timelineEvents: response.events,
    pendingAction,
    unsupportedScene: response.unsupported_scene,
    legendAvailability: response.legend_availability,
    halftimeSummary: response.halftime_summary,
    fullTimeHandoff: response.full_time_handoff,
    latestOperation: response.latest_operation ?? null,
  };
}

function commandMatchesMatch(
  state: MatchSessionData,
  command: NonNullable<MatchSessionData["pendingCommand"]>,
) {
  return Boolean(
    state.match &&
      command.matchId === state.match.id &&
      typeof state.match.revision === "number" &&
      command.revision === state.match.revision,
  );
}

function responseIsStale(
  state: MatchSessionData,
  response: BackendMatchResponse,
) {
  if (!state.match) return false;
  if (response.match.id !== state.match.id) return true;
  const currentRevision = state.match.revision;
  const incomingRevision = response.match.revision;
  return (
    typeof currentRevision === "number" &&
    typeof incomingRevision === "number" &&
    incomingRevision < currentRevision
  );
}

function responseMatchesPendingCommand(
  state: MatchSessionData,
  source: "start" | "resume" | "action",
  command: NonNullable<MatchSessionData["pendingCommand"]>,
) {
  const expectedPhase = {
    start: "starting",
    resume: "resuming",
    action: "submitting",
  } as const;
  return (
    state.phase === expectedPhase[source] &&
    state.pendingCommand?.operation === source &&
    command.operation === source &&
    matchCommandsExactly(state.pendingCommand, command)
  );
}

export function matchSessionReducer(
  state: MatchSessionData,
  event: MatchSessionEvent,
): MatchSessionData {
  switch (event.type) {
    case "RESET":
      return createInitialMatchSession();
    case "CREATE_REQUESTED":
      if (state.phase !== "idle" || event.command.operation !== "create") {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A match can only be created from the idle state.",
          retryable: true,
        });
      }
      return withPhase(
        {
          ...state,
          pendingCommand: event.command,
          retrySafe: false,
          recoveryPhase: null,
          diagnostic: null,
          error: null,
        },
        "creating",
      );
    case "MATCH_CREATED": {
      if (!isKnownMatchStatus(event.payload.match.match_status)) {
        return unsupportedStatus(state, event.payload.match.match_status);
      }
      if (event.payload.match.match_status !== "NOT_STARTED") {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A created match must be in NOT_STARTED state.",
          retryable: true,
        });
      }
      return withPhase(
        {
          ...state,
          ...event.payload,
          ...(controlsFromAuthoritativeTactics(event.payload.match) ?? {}),
          pendingAction: null,
          fieldState: null,
          timelineEvents: [],
          playbackMinute: 0,
          pendingCommand: null,
          retrySafe: false,
          recoveryPhase: null,
          decisionResult: null,
          unsupportedScene: null,
          diagnostic: null,
          error: null,
        },
        "created",
      );
    }
    case "COMMAND_RETAINED": {
      const current = state.pendingCommand;
      if (current?.idempotencyKey === event.command.idempotencyKey)
        return state;
      if (current) {
        return diagnosticState(state, {
          kind: "duplicate_command",
          message: "Another match command is already pending.",
          retryable: true,
        });
      }
      return { ...state, pendingCommand: event.command };
    }
    case "COMMAND_CLEARED":
      return { ...state, pendingCommand: null };
    case "COMMAND_RECONCILIATION_REQUIRED":
      if (
        !matchCommandsExactly(state.pendingCommand, event.command) ||
        !["starting", "resuming", "submitting"].includes(state.phase)
      ) {
        return state;
      }
      return diagnosticState(
        { ...state, retrySafe: false },
        {
          kind: "network",
          message:
            "The request left its active screen before confirmation. Refresh the authoritative match state before continuing.",
          retryable: true,
          recoveryAction: "HYDRATE_MATCH",
        },
      );
    case "FIELD_DRAFT_RETAINED":
      if (
        state.match?.id !== event.draft.matchId ||
        state.match.revision !== event.draft.revision ||
        state.pendingAction?.id !== event.draft.actionId ||
        state.phase !== "scene_ready"
      ) {
        return diagnosticState(state, {
          kind: "stale_command",
          message: "The saved field input no longer matches this action.",
          retryable: true,
        });
      }
      return { ...state, fieldDraft: event.draft };
    case "FIELD_DRAFT_CLEARED":
      return { ...state, fieldDraft: null };
    case "START_REQUESTED": {
      const isExactStartRetry =
        state.phase === "recoverable_error" &&
        state.recoveryPhase === "created" &&
        state.retrySafe &&
        matchCommandsExactly(state.pendingCommand, event.command);
      if (
        (state.phase !== "created" && !isExactStartRetry) ||
        event.command.operation !== "start" ||
        event.command.actionId !== null ||
        !commandMatchesMatch(state, event.command)
      ) {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A match can only start from the prematch state.",
          retryable: true,
        });
      }
      return withPhase(
        { ...state, pendingCommand: event.command, retrySafe: false },
        "starting",
      );
    }
    case "RESUME_REQUESTED": {
      const isExactResumeRetry =
        state.phase === "recoverable_error" &&
        state.recoveryPhase === "halftime" &&
        state.retrySafe &&
        matchCommandsExactly(state.pendingCommand, event.command);
      if (
        (state.phase !== "halftime" && !isExactResumeRetry) ||
        event.command.operation !== "resume" ||
        event.command.actionId !== null ||
        !commandMatchesMatch(state, event.command)
      ) {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A match can only resume from halftime.",
          retryable: true,
        });
      }
      return withPhase(
        { ...state, pendingCommand: event.command, retrySafe: false },
        "resuming",
      );
    }
    case "ACTION_REQUESTED": {
      const isExactRecoveryRetry =
        state.phase === "recoverable_error" &&
        state.recoveryPhase === "scene_ready" &&
        state.retrySafe &&
        matchCommandsExactly(state.pendingCommand, event.command);
      if (
        (state.phase !== "scene_ready" &&
          state.phase !== "unsupported_recovery" &&
          !isExactRecoveryRetry) ||
        event.command.operation !== "action" ||
        !commandMatchesMatch(state, event.command)
      ) {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A scene can only be submitted when it is ready.",
          retryable: true,
        });
      }
      if (
        event.command.actionId !==
        (state.pendingAction?.id ?? state.unsupportedScene?.action_id)
      ) {
        return diagnosticState(state, {
          kind: "stale_command",
          message: "The submitted action no longer matches the active scene.",
          retryable: true,
        });
      }
      return withPhase(
        { ...state, pendingCommand: event.command, retrySafe: false },
        "submitting",
      );
    }
    case "HYDRATED": {
      if (
        state.match?.id === event.payload.match.id &&
        event.payload.match.revision < state.match.revision
      ) {
        // A slower GET must never roll an already-applied authoritative
        // revision backwards, regardless of the receipt it happens to carry.
        return state;
      }
      const actionReceipt = inspectActionReceipt(
        event.payload.latestOperation,
        event.payload,
      );
      if (actionReceipt.kind === "invalid") {
        const hydrated = applyAuthoritativeSnapshot(state, event.payload, {
          preservePlayback: false,
          resultPlayback: false,
        });
        return diagnosticState(hydrated, {
          kind: "contract",
          message: actionReceipt.message,
          retryable: true,
        });
      }
      const actionReceiptMatchesPending =
        (actionReceipt.kind === "normal" ||
          actionReceipt.kind === "no_effect") &&
        receiptMatchesCommand(actionReceipt.receipt, state.pendingCommand);
      if (
        (actionReceipt.kind === "normal" ||
          actionReceipt.kind === "no_effect") &&
        state.pendingCommand &&
        receiptIdentityMatchesCommand(
          actionReceipt.receipt,
          state.pendingCommand,
        ) &&
        !actionReceiptMatchesPending
      ) {
        const hydrated = applyAuthoritativeSnapshot(state, event.payload, {
          preservePlayback: false,
          resultPlayback: false,
        });
        return diagnosticState(
          { ...hydrated, pendingCommand: state.pendingCommand },
          {
            kind: "contract",
            message:
              "The committed action receipt does not match the exact retained decision.",
            retryable: true,
          },
        );
      }
      if (
        (actionReceipt.kind === "normal" ||
          actionReceipt.kind === "no_effect") &&
        (!state.pendingCommand || actionReceiptMatchesPending)
      ) {
        const receipt = actionReceipt.receipt;
        // A committed receipt is backend-authoritative even after the local
        // command journal has been cleared. No-effect recovery is a timeline
        // continuation and must never be presented as field gameplay.
        const restoreResult =
          actionReceipt.kind === "normal" &&
          !resultReceiptWasAcknowledged(state, event.payload.match.id, receipt);
        const next = applyAuthoritativeSnapshot(
          {
            ...state,
            decisionResult: receipt.playback?.decision_result ?? null,
            resultPlayback: restoreResult ? receipt : null,
          },
          event.payload,
          {
            preservePlayback: false,
            resultPlayback: restoreResult,
            playbackMinute: event.payload.match.prev_time,
          },
        );
        return {
          ...next,
          pendingCommand: null,
          retrySafe: false,
          fieldDraft: null,
          decisionResult: restoreResult
            ? (receipt.playback?.decision_result ?? null)
            : null,
          resultPlayback: restoreResult ? receipt : null,
        };
      }
      if (
        receiptMatchesCommand(
          event.payload.latestOperation,
          state.pendingCommand,
        )
      ) {
        const next = applyAuthoritativeSnapshot(state, event.payload, {
          preservePlayback: false,
          resultPlayback: false,
        });
        return {
          ...next,
          pendingCommand: null,
          retrySafe: false,
          fieldDraft: null,
        };
      }
      const hydrated = applyAuthoritativeSnapshot(state, event.payload, {
        preservePlayback: true,
        resultPlayback: false,
      });
      const retryRecoveryPhase = safeRetryAfterHydration(state, event.payload);
      if (retryRecoveryPhase) {
        const commandLabel =
          state.pendingCommand?.operation === "action" ? "action" : "request";
        const message = `The server did not confirm this ${commandLabel}. You can safely retry the exact input.`;
        return withPhase(
          {
            ...hydrated,
            pendingCommand: state.pendingCommand,
            retrySafe: true,
            recoveryPhase: retryRecoveryPhase,
            diagnostic: {
              kind: "network",
              message,
              retryable: true,
              recoveryAction: "RETRY_SAME_REQUEST",
            },
            error: message,
          },
          "recoverable_error",
        );
      }
      if (
        state.match?.id === event.payload.match.id &&
        state.pendingCommand &&
        ["starting", "resuming", "submitting"].includes(state.phase) &&
        event.payload.match.revision === state.match.revision
      ) {
        const validated = applyAuthoritativeSnapshot(state, event.payload, {
          preservePlayback: true,
          resultPlayback: false,
        });
        if (
          validated.phase === "recoverable_error" ||
          validated.phase === "unsupported_contract"
        ) {
          return validated;
        }
        return diagnosticState(state, {
          kind: "contract",
          message:
            "A same-revision hydration snapshot changed authoritative match state.",
          retryable: true,
        });
      }
      if (
        state.match?.id === event.payload.match.id &&
        state.pendingCommand?.operation === "action" &&
        !commandCanRetryAfterHydration(state.pendingCommand, {
          match: event.payload.match,
        })
      ) {
        return diagnosticState(
          {
            ...hydrated,
            pendingCommand: state.pendingCommand,
            retrySafe: false,
          },
          {
            kind: "stale_command",
            message:
              "The match changed before this request could be confirmed. Its input was retained but was not resent.",
            retryable: true,
          },
        );
      }
      return hydrated;
    }
    case "COMMAND_RESOLVED": {
      if (!responseMatchesPendingCommand(state, event.source, event.command)) {
        // A response from an unmounted route or replaced request is stale by
        // identity. Ignoring it preserves the current authoritative session.
        return state;
      }
      if (responseIsStale(state, event.response)) {
        return diagnosticState(state, {
          kind: "stale_command",
          message: "An outdated match response was ignored.",
          retryable: true,
        });
      }
      if (event.response.status !== event.response.match.match_status) {
        return diagnosticState(state, {
          kind: "contract",
          message:
            "The response status does not match the authoritative match status.",
          retryable: true,
        });
      }
      const payload = responsePayload(state, event.response);
      if (!payload) {
        return diagnosticState(state, {
          kind: "illegal_transition",
          message: "A command response requires hydrated team context.",
          retryable: true,
        });
      }
      const actionReceipt =
        event.source === "action"
          ? inspectActionReceipt(event.response.latest_operation, payload)
          : ({ kind: "none" } as const);
      if (event.source === "action" && actionReceipt.kind === "none") {
        return diagnosticState(
          { ...state, retrySafe: true },
          {
            kind: "contract",
            message:
              "The action response is missing its committed operation receipt. Retry the exact saved request.",
            retryable: true,
            recoveryAction: "RETRY_SAME_REQUEST",
          },
        );
      }
      if (actionReceipt.kind === "invalid") {
        return diagnosticState(state, {
          kind: "contract",
          message: actionReceipt.message,
          retryable: true,
        });
      }
      if (
        (actionReceipt.kind === "normal" ||
          actionReceipt.kind === "no_effect") &&
        !receiptMatchesCommand(actionReceipt.receipt, event.command)
      ) {
        return diagnosticState(state, {
          kind: "contract",
          message:
            "The committed action receipt does not match the exact submitted decision.",
          retryable: true,
        });
      }
      const isNoEffectRecovery = Boolean(
        actionReceipt.kind === "no_effect" ||
          (event.source === "action" &&
            state.unsupportedScene &&
            state.pendingCommand?.actionId ===
              state.unsupportedScene.action_id),
      );
      const resultPlayback = event.source === "action" && !isNoEffectRecovery;
      const next = applyAuthoritativeSnapshot(state, payload, {
        preservePlayback: false,
        resultPlayback,
        playbackMinute: event.response.prev_time,
      });
      if (
        next.phase === "recoverable_error" ||
        next.phase === "unsupported_contract"
      ) {
        return next;
      }
      return {
        ...next,
        recoveryPhase: null,
        pendingCommand: null,
        retrySafe: false,
        fieldDraft: null,
        decisionResult: resultPlayback
          ? (event.response.decision_result ?? null)
          : null,
        resultPlayback:
          resultPlayback && actionReceipt.kind === "normal"
            ? actionReceipt.receipt
            : null,
      };
    }
    case "TIMELINE_TICK": {
      if (
        (state.phase !== "timeline_playback" &&
          state.phase !== "legend_unavailable_simulation") ||
        !state.match
      ) {
        return state;
      }
      const target = state.pendingAction?.minute ?? state.match.current_time;
      const minute = Math.min(
        target,
        Math.max(state.playbackMinute, event.minute),
      );
      if (
        state.phase === "legend_unavailable_simulation" &&
        minute >= state.match.current_time
      ) {
        return withPhase({ ...state, playbackMinute: minute }, "finished");
      }
      if (
        state.match.match_status === "HALFTIME" &&
        minute >= state.match.current_time
      ) {
        return withPhase({ ...state, playbackMinute: minute }, "halftime");
      }
      return { ...state, playbackMinute: minute };
    }
    case "SCENE_READY":
      if (
        state.phase !== "timeline_playback" ||
        !state.pendingAction ||
        state.playbackMinute < state.pendingAction.minute
      ) {
        return state;
      }
      return withPhase(state, "scene_ready");
    case "RESULT_ACKNOWLEDGED": {
      if (state.phase !== "result_playback" || !state.match) return state;
      const acknowledgedResult = resultReceiptIdentity(
        state.match.id,
        state.resultPlayback,
      );
      if (
        state.match.match_status === "FINISHED" &&
        state.legendAvailability?.availability === "UNAVAILABLE" &&
        state.playbackMinute < state.match.current_time
      ) {
        return withPhase(
          {
            ...state,
            acknowledgedResult,
            decisionResult: null,
            resultPlayback: null,
          },
          "legend_unavailable_simulation",
        );
      }
      const phase = phaseForMatch(
        state.match,
        state.pendingAction,
        state.legendAvailability,
      );
      if (!phase) return unsupportedStatus(state, state.match.match_status);
      const playbackPhase =
        phase === "halftime" && state.playbackMinute < state.match.current_time
          ? "timeline_playback"
          : phase;
      return withPhase(
        {
          ...state,
          acknowledgedResult,
          decisionResult: null,
          resultPlayback: null,
        },
        playbackPhase,
      );
    }
    case "ERROR_RECORDED":
      return diagnosticState(
        {
          ...state,
          // The API is the only authority that may declare an ambiguous
          // command safe to replay. Generic transport failures remain
          // hydration-first and therefore keep retrySafe false.
          retrySafe: Boolean(
            state.pendingCommand &&
              event.diagnostic.recoveryAction === "RETRY_SAME_REQUEST",
          ),
        },
        event.diagnostic,
      );
    case "ERROR_CLEARED":
      if (
        state.phase === "recoverable_error" &&
        state.pendingCommand &&
        !state.retrySafe
      ) {
        // An ambiguous command must remain locked until hydration reconciles it.
        // Clearing presentation text must never make the retained POST reusable.
        return state;
      }
      if (
        state.phase !== "recoverable_error" &&
        state.phase !== "unsupported_contract"
      )
        return { ...state, diagnostic: null, error: null };
      return withPhase(
        {
          ...state,
          recoveryPhase: null,
          diagnostic: null,
          error: null,
        },
        state.recoveryPhase ??
          (state.match
            ? phaseForMatch(
                state.match,
                state.pendingAction,
                state.legendAvailability,
              )
            : "idle") ??
          "timeline_playback",
      );
    case "EFFORT_CHANGED":
      return { ...state, effort: event.effort };
    case "PLAYSTYLE_CHANGED":
      return { ...state, playstyle: event.playstyle };
  }
}

export function stateForScene(scene: string) {
  return isKnownPlayableScene(scene) ? "scene_ready" : "unsupported_contract";
}
