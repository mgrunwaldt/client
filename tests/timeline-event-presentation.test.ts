import { describe, expect, it } from "vitest";

import {
  classifyTimelineEvent,
  presentTimelineEventDescription,
} from "../src/match/timeline-event-presentation";

describe("timeline event presentation", () => {
  it("shows automatic opponent attacks as opponent events", () => {
    expect(
      classifyTimelineEvent({
        action: "OPEN_PLAY",
        team: "OPPONENT_TEAM",
        my_team_scored: false,
        opponent_team_scored: false,
      }),
    ).toBe("opponent-opportunity");
  });

  it("gives every event family a stable semantic presentation", () => {
    expect(
      classifyTimelineEvent({
        action: "HALFTIME",
        team: "NEUTRAL",
        my_team_scored: false,
        opponent_team_scored: false,
      }),
    ).toBe("interval");
    expect(
      classifyTimelineEvent({
        action: "BRAWL",
        team: "NEUTRAL",
        my_team_scored: false,
        opponent_team_scored: false,
      }),
    ).toBe("disciplinary");
    expect(
      classifyTimelineEvent({
        action: "OPEN_PLAY",
        team: "MY_TEAM",
        my_team_scored: false,
        opponent_team_scored: false,
        meta: { source: "POSSESSION_CHAIN" },
      }),
    ).toBe("team-possession");
    expect(
      classifyTimelineEvent({
        action: "FREE_KICK",
        team: "MY_TEAM",
        my_team_scored: false,
        opponent_team_scored: false,
        meta: { outcome_type: "KICK_OUT", loose_possession: true },
      }),
    ).toBe("opponent-possession");
    expect(
      classifyTimelineEvent({
        action: "SUBSTITUTE",
        team: "NEUTRAL",
        my_team_scored: false,
        opponent_team_scored: false,
      }),
    ).toBe("neutral");
  });

  it("always gives scoring flags priority over the action family", () => {
    expect(
      classifyTimelineEvent({
        action: "OPEN_PLAY",
        team: "MY_TEAM",
        my_team_scored: true,
        opponent_team_scored: false,
      }),
    ).toBe("team-goal");
    expect(
      classifyTimelineEvent({
        action: "PENALTY",
        team: "OPPONENT_TEAM",
        my_team_scored: false,
        opponent_team_scored: true,
      }),
    ).toBe("opponent-goal");
  });

  it("removes technical AI wording from historical match events", () => {
    expect(
      presentTimelineEventDescription(
        "GOAL! Your team converts the AI attack.",
      ),
    ).toBe("GOAL! A flowing team move ends in the net.");
    expect(
      presentTimelineEventDescription("Your team cannot finish the AI move."),
    ).toBe("Your team works an opening, but the final touch is missing.");
  });

  it("preserves current backend-authored descriptions", () => {
    expect(presentTimelineEventDescription("Half-time.")).toBe("Half-time.");
  });

  it("never exposes unexpected implementation terminology", () => {
    expect(
      presentTimelineEventDescription("The engine accepted the payload."),
    ).toBe("The match swings into its next decisive moment.");
  });
});
