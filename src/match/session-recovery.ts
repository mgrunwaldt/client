import type { MatchCommand } from "./api-v1/adapter";

export interface MatchFieldDraft {
  kind: "kick";
  matchId: string;
  revision: number;
  actionId: string;
  aim: {
    dragStart: { x: number; y: number; z: number };
    dragCurrent: { x: number; y: number; z: number };
    shotVector: { x: number; y: number; z: number };
    normalizedDirection: { x: number; y: number; z: number };
    pullDistance: number;
    normalizedPower: number;
  };
  contact: { x: number; y: number };
}

export interface MatchRecoveryJournal {
  version: 1;
  pendingCommand: MatchCommand | null;
  fieldDraft: MatchFieldDraft | null;
}

const STORAGE_KEY = "overgoal.match-recovery.v1";
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_ENTRIES = 256;
const MAX_FIELD_COORDINATE = 10_000;
const MAX_SHOT_VECTOR_COMPONENT = 500;
const MAX_PULL_DISTANCE = 200;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isIdentifier(
  value: unknown,
  maxLength = MAX_IDENTIFIER_LENGTH,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isFiniteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isNonNegativeRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return (
      value.length <= MAX_JSON_ENTRIES &&
      value.every((entry) => isJsonValue(entry, depth + 1))
    );
  }
  if (!isRecord(value) || Object.keys(value).length > MAX_JSON_ENTRIES) {
    return false;
  }
  return Object.values(value).every((entry) => isJsonValue(entry, depth + 1));
}

function isPayloadForMatch(value: unknown, matchId: string) {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    value.match_id === matchId
  );
}

function isCreatePayload(value: unknown) {
  return (
    isRecord(value) &&
    isIdentifier(value.my_team_id) &&
    isIdentifier(value.opponent_team_id) &&
    isRecord(value.player_profile) &&
    Object.keys(value.player_profile).length > 0 &&
    Object.keys(value.player_profile).length <= MAX_JSON_ENTRIES &&
    Object.values(value.player_profile).every((rating) =>
      isFiniteInRange(rating, 0, 100),
    ) &&
    (value.ruleset === undefined || isJsonValue(value.ruleset))
  );
}

function isActionPayload(value: unknown, matchId: string, actionId: string) {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    value.match_id === matchId &&
    value.action_id === actionId &&
    isRecord(value.match_decision) &&
    Object.keys(value.match_decision).length > 0 &&
    isJsonValue(value.match_decision)
  );
}

function validCommand(value: unknown): value is MatchCommand {
  if (
    !isRecord(value) ||
    !isIdentifier(value.idempotencyKey, MAX_IDEMPOTENCY_KEY_LENGTH) ||
    typeof value.operation !== "string" ||
    !["create", "start", "resume", "action"].includes(value.operation)
  ) {
    return false;
  }

  switch (value.operation) {
    case "create":
      return (
        value.matchId === "" &&
        value.revision === null &&
        value.actionId === null &&
        isCreatePayload(value.payload)
      );
    case "start":
    case "resume":
      return (
        isIdentifier(value.matchId) &&
        isNonNegativeRevision(value.revision) &&
        value.actionId === null &&
        isPayloadForMatch(value.payload, value.matchId)
      );
    case "action":
      return (
        isIdentifier(value.matchId) &&
        isNonNegativeRevision(value.revision) &&
        isIdentifier(value.actionId) &&
        isActionPayload(value.payload, value.matchId, value.actionId)
      );
  }
  return false;
}

function isVector(value: unknown, minimum: number, maximum: number) {
  return (
    isRecord(value) &&
    isFiniteInRange(value.x, minimum, maximum) &&
    isFiniteInRange(value.y, minimum, maximum) &&
    isFiniteInRange(value.z, minimum, maximum)
  );
}

function validDraft(value: unknown): value is MatchFieldDraft {
  if (
    !isRecord(value) ||
    value.kind !== "kick" ||
    !isIdentifier(value.matchId) ||
    !isNonNegativeRevision(value.revision) ||
    !isIdentifier(value.actionId) ||
    !isRecord(value.aim) ||
    !isRecord(value.contact)
  ) {
    return false;
  }
  return (
    isVector(
      value.aim.dragStart,
      -MAX_FIELD_COORDINATE,
      MAX_FIELD_COORDINATE,
    ) &&
    isVector(
      value.aim.dragCurrent,
      -MAX_FIELD_COORDINATE,
      MAX_FIELD_COORDINATE,
    ) &&
    isVector(
      value.aim.shotVector,
      -MAX_SHOT_VECTOR_COMPONENT,
      MAX_SHOT_VECTOR_COMPONENT,
    ) &&
    isVector(value.aim.normalizedDirection, -1, 1) &&
    isFiniteInRange(value.aim.pullDistance, 0, MAX_PULL_DISTANCE) &&
    isFiniteInRange(value.aim.normalizedPower, 0, 1) &&
    isFiniteInRange(value.contact.x, -1, 1) &&
    isFiniteInRange(value.contact.y, -1, 1)
  );
}

export function parseMatchRecoveryJournal(
  raw: string | null,
): MatchRecoveryJournal {
  if (!raw) return { version: 1, pendingCommand: null, fieldDraft: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) {
      return { version: 1, pendingCommand: null, fieldDraft: null };
    }
    return {
      version: 1,
      pendingCommand: validCommand(parsed.pendingCommand)
        ? structuredClone(parsed.pendingCommand)
        : null,
      fieldDraft: validDraft(parsed.fieldDraft)
        ? structuredClone(parsed.fieldDraft)
        : null,
    };
  } catch {
    return { version: 1, pendingCommand: null, fieldDraft: null };
  }
}

export function readMatchRecoveryJournal(): MatchRecoveryJournal {
  return parseMatchRecoveryJournal(storage()?.getItem(STORAGE_KEY) ?? null);
}

export function writeMatchRecoveryJournal(journal: MatchRecoveryJournal) {
  const target = storage();
  if (!target) return;
  if (!journal.pendingCommand && !journal.fieldDraft) {
    target.removeItem(STORAGE_KEY);
    return;
  }
  target.setItem(STORAGE_KEY, JSON.stringify(journal));
}

export function commandCanRetryAfterHydration(
  command: MatchCommand | null,
  snapshot: { match: { id: string; revision: number } },
) {
  return Boolean(
    command &&
      command.matchId === snapshot.match.id &&
      command.revision === snapshot.match.revision,
  );
}

export function fieldDraftMatchesSnapshot(
  draft: MatchFieldDraft | null,
  snapshot: {
    match: { id: string; revision: number };
    pendingAction: { id: string } | null;
  },
) {
  return Boolean(
    draft &&
      snapshot.pendingAction &&
      draft.matchId === snapshot.match.id &&
      draft.revision === snapshot.match.revision &&
      draft.actionId === snapshot.pendingAction.id,
  );
}
