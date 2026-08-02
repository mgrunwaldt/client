export const CANONICAL_KICK_SCENES = [
  "OPEN_PLAY",
  "FREE_KICK",
  "CORNER",
  "PENALTY",
] as const;

export type CanonicalKickScene = (typeof CANONICAL_KICK_SCENES)[number];

export interface KickControlEnvelope {
  version: number;
  input_mapping_version: string;
  minimum_power: number;
  maximum_power: number;
  maximum_curve: number;
  maximum_lift: number;
  contact_radius: number;
}

export interface CanonicalKickInput {
  version: number;
  aim: { x: number; y: number };
  power: number;
  contact: { x: number; y: number };
}

export interface CanonicalKickDecision extends Record<string, unknown> {
  choice: "KICK";
  kick_input: CanonicalKickInput;
}

export interface KickSubmissionGate {
  begin(actionId: string): boolean;
  reset(actionId: string): void;
}

export function createKickSubmissionGate(): KickSubmissionGate {
  let submittedActionId: string | null = null;
  return {
    begin(actionId) {
      if (submittedActionId === actionId) return false;
      submittedActionId = actionId;
      return true;
    },
    reset(actionId) {
      if (submittedActionId === actionId) submittedActionId = null;
    },
  };
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clampKickPower(
  envelope: KickControlEnvelope,
  normalizedPullPower: number,
) {
  return clamp(
    normalizedPullPower,
    envelope.minimum_power,
    envelope.maximum_power,
  );
}

// The renderer uses the same effective power that the request sends. This is
// a presentation of server bounds, not a client-side skill formula.
export function visibleKickPowerRatio(
  envelope: KickControlEnvelope,
  normalizedPullPower: number,
) {
  return clampKickPower(envelope, normalizedPullPower);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseKickControlEnvelope(
  value: unknown,
): KickControlEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  const numericKeys = [
    "version",
    "minimum_power",
    "maximum_power",
    "maximum_curve",
    "maximum_lift",
    "contact_radius",
  ] as const;
  if (
    numericKeys.some((key) => !isFiniteNumber(envelope[key])) ||
    typeof envelope.input_mapping_version !== "string" ||
    envelope.input_mapping_version.length === 0
  ) {
    return null;
  }

  const parsed = envelope as unknown as KickControlEnvelope;
  if (
    parsed.version < 1 ||
    parsed.minimum_power < 0 ||
    parsed.maximum_power > 1 ||
    parsed.minimum_power > parsed.maximum_power ||
    parsed.contact_radius <= 0 ||
    parsed.contact_radius > 1
  ) {
    return null;
  }
  return parsed;
}

export function isCanonicalKickScene(sceneType: string | undefined) {
  return CANONICAL_KICK_SCENES.some((scene) => scene === sceneType);
}

export function normalizeAimVector(vector: { x: number; y: number }) {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude === 0) return null;
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

export function clampContactToRadius(
  contact: { x: number; y: number },
  radius: number,
) {
  const boundedRadius = clamp(radius, 0.0001, 1);
  const x = clamp(contact.x, -1, 1);
  const y = clamp(contact.y, -1, 1);
  const distance = Math.hypot(x, y);
  if (distance <= boundedRadius) return { x, y };
  const scale = boundedRadius / distance;
  return { x: x * scale, y: y * scale };
}

export function ballFaceContactFromPercent(point: { x: number; y: number }) {
  return {
    x: clamp(point.x / 50 - 1, -1, 1),
    // DOM coordinates increase downward while canonical ball-face y increases up.
    y: clamp(1 - point.y / 50, -1, 1),
  };
}

export function ballFacePercentFromContact(contact: { x: number; y: number }) {
  return {
    x: (clamp(contact.x, -1, 1) + 1) * 50,
    y: (1 - clamp(contact.y, -1, 1)) * 50,
  };
}

export function buildCanonicalKickDecision(
  envelope: KickControlEnvelope,
  rawAim: { x: number; y: number },
  normalizedPullPower: number,
  rawContact: { x: number; y: number },
): CanonicalKickDecision {
  const aim = normalizeAimVector(rawAim);
  if (!aim) {
    throw new Error("A kick needs a non-zero aim vector.");
  }

  return {
    choice: "KICK",
    kick_input: {
      version: envelope.version,
      aim,
      power: clampKickPower(envelope, normalizedPullPower),
      contact: clampContactToRadius(rawContact, envelope.contact_radius),
    },
  };
}
