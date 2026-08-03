import { describe, expect, it } from "vitest";

import type {
  BackendDecisionResult,
  BackendPendingAction,
  BackendPendingSettlementEvent,
} from "../src/match/api-v1/contract";
import {
  createRandomEventDecision,
  createRandomEventSubmissionGate,
  parseRandomEventAction,
  randomEventImmediateEffects,
  randomEventPendingSettlements,
} from "../src/match/random-event";
import { readFixture } from "./match-api-v1-fixtures";

const events = {
  "argument-opponent": ["TRASH_TALK", "WALK_AWAY", "HEADBUTT"],
  "argument-teammate": ["SHOUT_BACK", "CALM_DOWN", "IGNORE"],
  bathroom: ["ASK_FOR_SUB", "HOLD_IT", "BEHIND_BOARDS"],
  brawl: ["JOIN_IN", "PULL_AWAY", "STAY_OUT"],
  jumper: ["ACCEPT_HUG", "DODGE", "SECURITY_TACKLE"],
} as const;

describe("authoritative random-event scenes", () => {
  it("renders every server-advertised event and emits each of the fifteen exact choice payloads", async () => {
    const choices: string[] = [];

    for (const [fixture, expectedChoices] of Object.entries(events)) {
      const action = await readFixture<BackendPendingAction>(
        `scenes/${fixture}.json`,
      );
      const parsed = parseRandomEventAction(action);

      expect(parsed.error, fixture).toBeNull();
      expect(
        parsed.event?.choices.map((choice) => choice.id),
        fixture,
      ).toEqual(expectedChoices);

      for (const choice of expectedChoices) {
        choices.push(choice);
        expect(
          createRandomEventDecision(parsed.event!, choice),
          `${fixture}:${choice}`,
        ).toEqual({ choice });
      }
    }

    expect(choices).toHaveLength(15);
    expect(new Set(choices).size).toBe(15);
  });

  it("rejects malformed or future choice contracts before they can submit", async () => {
    const action =
      await readFixture<BackendPendingAction>("scenes/jumper.json");
    const unknownChoice = structuredClone(action);
    unknownChoice.available_choices[0].id = "TAKE_OVER_THE_STADIUM";
    expect(parseRandomEventAction(unknownChoice)).toMatchObject({
      event: null,
      error: expect.stringContaining("unsupported choice set"),
    });

    const malformedSchema = structuredClone(action);
    malformedSchema.available_choices[0].input_schema = {
      required: ["choice"],
      allowed: ["choice", "bonus"],
      additional_properties: false,
    };
    expect(parseRandomEventAction(malformedSchema)).toMatchObject({
      event: null,
      error: expect.stringContaining("invalid choice contract"),
    });

    const unsupportedVersion = structuredClone(action);
    unsupportedVersion.contract_version = 2;
    expect(parseRandomEventAction(unsupportedVersion)).toMatchObject({
      event: null,
      error: expect.stringContaining("does not match"),
    });
  });

  it("allows one submission per authoritative action and resets only after an error", () => {
    const gate = createRandomEventSubmissionGate();

    expect(gate.begin("random-1")).toBe(true);
    expect(gate.begin("random-1")).toBe(false);
    expect(gate.begin("random-2")).toBe(true);
    gate.reset("random-1");
    expect(gate.begin("random-1")).toBe(true);
  });

  it("presents only effects and durable settlements returned by the server", () => {
    const result: BackendDecisionResult = {
      description: "Authoritative event result.",
      success: false,
      outcome_type: "BRAWL_BOOKING",
      immediate_effects: {
        energy_delta: -11,
        yellow_cards: 1,
        red_card: false,
        injured: true,
        substituted: true,
        my_team_score_delta: 0,
        opponent_score_delta: 1,
      },
      yellow_card: true,
      injured: true,
      substituted: true,
      opponent_team_scored: true,
    };
    const settlement: BackendPendingSettlementEvent = {
      version: 1,
      id: "settlement-1",
      match_id: "match-1",
      category: "SOCIAL",
      type: "FAN_REPUTATION",
      source: {
        match_id: "match-1",
        action_id: "action-1",
        action_sequence: 4,
        settlement_sequence: 1,
        scene_type: "BRAWL",
        choice: "JOIN_IN",
      },
      payload: { crowd_reputation: -3 },
      created_revision: 8,
      created_time: { match_minute: 53, decision_sequence: 4 },
      status: "PENDING",
    };

    expect(
      randomEventImmediateEffects(result.immediate_effects, result),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Energy", value: "-11" }),
        expect.objectContaining({ label: "Card", value: "Yellow card" }),
        expect.objectContaining({ label: "Availability", value: "Injured" }),
        expect.objectContaining({
          label: "Availability",
          value: "Substituted",
        }),
        expect.objectContaining({ label: "Score", value: "Opponent +1" }),
      ]),
    );
    expect(randomEventPendingSettlements([settlement])).toEqual([
      {
        id: "settlement-1",
        label: "SOCIAL · FAN REPUTATION",
        description: "crowd reputation: -3",
      },
    ]);
  });
});
