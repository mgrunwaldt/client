import type {
  BackendDecisionResult,
  BackendFieldState,
  BackendLastDecision,
  BackendMatchOperationReceipt,
  BackendPendingAction,
  BackendTimelineEvent,
} from "../../src/match/api-v1/contract";

interface ActionResponseShape {
  match: { id: string; revision: number };
  pending_action: unknown;
  field_state: unknown;
  decision_result?: unknown;
  events: unknown;
}

interface CommittedReceiptOptions {
  decisionData: Record<string, unknown>;
  operationId?: string;
}

export function withCommittedActionReceipt<
  TCommitted extends ActionResponseShape,
>(
  submitted: ActionResponseShape,
  committed: TCommitted,
  { decisionData, operationId }: CommittedReceiptOptions,
): TCommitted & { latest_operation: BackendMatchOperationReceipt } {
  const submittedAction =
    submitted.pending_action as BackendPendingAction | null;
  const submittedFieldState = submitted.field_state as BackendFieldState | null;
  const decisionResult = committed.decision_result as
    | BackendDecisionResult
    | null
    | undefined;
  const events = committed.events as BackendTimelineEvent[];
  if (!submittedAction || !submittedFieldState || !decisionResult) {
    throw new Error(
      "A committed action receipt requires the submitted action, field state, and authoritative decision result.",
    );
  }
  if (submittedAction.field_state_id !== submittedFieldState.id) {
    throw new Error(
      "The submitted action and field state identities do not match.",
    );
  }
  if (committed.match.revision <= submitted.match.revision) {
    throw new Error(
      "A committed action response must advance the authoritative revision.",
    );
  }

  const lastDecision: BackendLastDecision = {
    id: `decision-${submittedAction.id}`,
    match_id: submitted.match.id,
    sequence: 1,
    minute: submittedAction.minute,
    action: submittedAction.scene_type,
    action_team: submittedAction.action_team,
    action_id: submittedAction.id,
    action_version: submittedAction.contract_version ?? 1,
    decision_version: 1,
    decision_data: decisionData,
    field_state_id: submittedFieldState.id,
    timestamp: 1,
  };

  return {
    ...committed,
    latest_operation: {
      version: 1,
      operation_id: operationId ?? `operation-process-${submittedAction.id}`,
      operation: "processMatchAction",
      status: "COMMITTED",
      request_revision: submitted.match.revision,
      committed_revision: committed.match.revision,
      action_id: submittedAction.id,
      playback: {
        version: 1,
        submitted_action: submittedAction,
        submitted_field_state: submittedFieldState,
        last_decision: lastDecision,
        decision_result: decisionResult,
        events,
      },
    },
  };
}
