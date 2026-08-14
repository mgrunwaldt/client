export type TimelineEventPresentationType =
  | "team-goal"
  | "opponent-goal"
  | "team-opportunity"
  | "opponent-opportunity"
  | "team-possession"
  | "opponent-possession"
  | "disciplinary"
  | "interval"
  | "neutral";

interface TimelinePresentationEvent {
  action: string;
  team: string;
  my_team_scored: boolean;
  opponent_team_scored: boolean;
  player_participates?: boolean;
  meta?: {
    source?: string;
    outcome_type?: string;
    yellow_card?: boolean;
    red_card?: boolean;
    loose_possession?: boolean;
    success?: boolean;
  } | null;
}

const INTERVAL_ACTIONS = new Set(["HALFTIME", "RESUME_MATCH"]);
const DISCIPLINARY_ACTIONS = new Set([
  "JUMPER",
  "BRAWL",
  "ARGUMENT_OPPONENT",
  "ARGUMENT_TEAMMATE",
]);
const OPPORTUNITY_ACTIONS = new Set([
  "OPEN_PLAY",
  "DRIBBLE",
  "CORNER",
  "FREE_KICK",
  "PENALTY",
]);

function possessionPresentation(
  event: TimelinePresentationEvent,
): TimelineEventPresentationType | null {
  const meta = event.meta;
  if (!meta) return null;

  if (meta.source === "POSSESSION_CHAIN") return "team-possession";
  if (meta.loose_possession === true) {
    return event.team === "OPPONENT_TEAM"
      ? "team-possession"
      : "opponent-possession";
  }

  const outcome = meta.outcome_type ?? "";
  if (/PASS|POSSESSION|RECEIV/i.test(outcome)) {
    return event.team === "OPPONENT_TEAM"
      ? "opponent-possession"
      : "team-possession";
  }
  return null;
}

export function classifyTimelineEvent(
  event: TimelinePresentationEvent,
): TimelineEventPresentationType {
  if (event.my_team_scored) return "team-goal";
  if (event.opponent_team_scored) return "opponent-goal";
  if (INTERVAL_ACTIONS.has(event.action)) return "interval";
  if (
    DISCIPLINARY_ACTIONS.has(event.action) ||
    event.meta?.yellow_card === true ||
    event.meta?.red_card === true
  ) {
    return "disciplinary";
  }

  const possession = possessionPresentation(event);
  if (possession) return possession;

  if (OPPORTUNITY_ACTIONS.has(event.action)) {
    return event.team === "OPPONENT_TEAM"
      ? "opponent-opportunity"
      : "team-opportunity";
  }
  return "neutral";
}

const LEGACY_EVENT_COPY: Readonly<Record<string, string>> = {
  "GOAL! Your team converts the AI attack.":
    "GOAL! A flowing team move ends in the net.",
  "Your team cannot finish the AI move.":
    "Your team works an opening, but the final touch is missing.",
};

export function presentTimelineEventDescription(description: string): string {
  const presented = LEGACY_EVENT_COPY[description] ?? description;
  if (/\b(?:AI|engine|payload|implementation)\b/i.test(presented)) {
    return "The match swings into its next decisive moment.";
  }
  return presented;
}
