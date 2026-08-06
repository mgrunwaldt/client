export type GameFeedbackCue = "aim-ready" | "action" | "success" | "failure";

export interface GameFeedbackPreferences {
  haptics: boolean;
  muted: boolean;
  volume: number;
}

const STORAGE_KEY = "overgoal.game-feedback.v1";
const DEFAULT_PREFERENCES: GameFeedbackPreferences = {
  haptics: true,
  muted: false,
  volume: 0.7,
};

let preferences = readPreferences();
let audioContext: AudioContext | null = null;
const listeners = new Set<() => void>();

const cueShape: Record<
  GameFeedbackCue,
  {
    duration: number;
    frequency: number;
    haptic: number | number[];
    type: OscillatorType;
  }
> = {
  "aim-ready": {
    duration: 0.055,
    frequency: 520,
    haptic: 8,
    type: "sine",
  },
  action: {
    duration: 0.11,
    frequency: 150,
    haptic: 18,
    type: "triangle",
  },
  success: {
    duration: 0.18,
    frequency: 740,
    haptic: [18, 32, 28],
    type: "sine",
  },
  failure: {
    duration: 0.2,
    frequency: 110,
    haptic: [35, 30, 35],
    type: "sawtooth",
  },
};

function clampVolume(value: number) {
  return Math.min(1, Math.max(0, value));
}

function readPreferences(): GameFeedbackPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<GameFeedbackPreferences> | null;
    if (!stored) return DEFAULT_PREFERENCES;
    return {
      haptics:
        typeof stored.haptics === "boolean"
          ? stored.haptics
          : DEFAULT_PREFERENCES.haptics,
      muted:
        typeof stored.muted === "boolean"
          ? stored.muted
          : DEFAULT_PREFERENCES.muted,
      volume:
        typeof stored.volume === "number"
          ? clampVolume(stored.volume)
          : DEFAULT_PREFERENCES.volume,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function persistPreferences() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in private or embedded browser sessions.
  }
}

function emitPreferences() {
  for (const listener of listeners) listener();
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext;
  if (!Context) return null;
  audioContext ??= new Context();
  return audioContext;
}

export function getGameFeedbackPreferences() {
  return preferences;
}

export function subscribeGameFeedbackPreferences(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setGameFeedbackPreferences(
  next: Partial<GameFeedbackPreferences>,
) {
  preferences = {
    haptics: next.haptics ?? preferences.haptics,
    muted: next.muted ?? preferences.muted,
    volume:
      typeof next.volume === "number"
        ? clampVolume(next.volume)
        : preferences.volume,
  };
  persistPreferences();
  emitPreferences();
}

export function playGameFeedback(cue: GameFeedbackCue) {
  const shape = cueShape[cue];
  if (preferences.haptics && typeof navigator !== "undefined") {
    navigator.vibrate?.(shape.haptic);
  }
  if (preferences.muted || preferences.volume === 0) return;

  const context = getAudioContext();
  if (!context) return;
  void context.resume().catch(() => undefined);

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.type = shape.type;
  oscillator.frequency.setValueAtTime(shape.frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(60, shape.frequency * (cue === "success" ? 1.35 : 0.72)),
    now + shape.duration,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, preferences.volume * 0.12),
    now + 0.012,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, now + shape.duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + shape.duration + 0.01);
}

export function outcomeFeedbackCue(outcome?: string): GameFeedbackCue {
  if (!outcome) return "failure";
  const normalized = outcome.toUpperCase();
  return /GOAL|SUCCESS|COMPLET|KEPT|WON|ADVANCE|SURVIVAL|KICK_TO_/.test(
    normalized,
  )
    ? "success"
    : "failure";
}

export function installGameFeedbackLifecycle() {
  if (typeof document === "undefined") return () => undefined;
  const onVisibilityChange = () => {
    if (!audioContext) return;
    if (document.visibilityState === "hidden") {
      void audioContext.suspend().catch(() => undefined);
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () =>
    document.removeEventListener("visibilitychange", onVisibilityChange);
}
