// Compatibility boundary for existing route and scene components. Match API v1
// validation and transport live under src/match/api-v1 and are client-agnostic.
export {
  createBackendMatch,
  createMatchCommand,
  fetchBackendMatch,
  fetchBackendTeams,
  type MatchCommand,
  processBackendMatchAction,
  resumeBackendMatch,
  startBackendMatch,
} from "../match/api-v1/adapter";
export {
  type BackendActionTeam,
  type BackendDecisionResult,
  type BackendFieldPlayer,
  type BackendFieldState,
  type BackendFlightPoint,
  type BackendFullTimeHandoff,
  type BackendHalftimeSummary,
  type BackendLegendAvailabilityState,
  type BackendLegendProfile,
  type BackendMatch,
  type BackendMatchResponse,
  type BackendMatchSnapshot,
  type BackendPendingAction,
  type BackendReceiverControl,
  type BackendTeam,
  type BackendTimelineEvent,
} from "../match/api-v1/contract";
export {
  BackendRequestError,
  MatchApiContractError,
  type MatchApiResponseMetadata,
} from "../match/api-v1/errors";

export function defaultLegendProfile() {
  return {
    stamina: 78,
    energy: 78,
    shoot: 74,
    dribble: 76,
    speed: 77,
    passing: 73,
    heading: 69,
    defense: 58,
    intelligence: 72,
  };
}
