import type { CanonicalKickScene } from "../../src/match/kick-input";

export const tacticalKickFixtures: Array<{
  scene: CanonicalKickScene;
  outcome: string;
  seed: string;
}> = [
  { scene: "OPEN_PLAY", outcome: "TEAMMATE_CONTROL", seed: "m2-open-pass" },
  { scene: "OPEN_PLAY", outcome: "INTERCEPTION", seed: "m2-open-intercept" },
  { scene: "FREE_KICK", outcome: "GOAL", seed: "m2-free-goal" },
  { scene: "FREE_KICK", outcome: "SAVE", seed: "m2-free-save" },
  { scene: "CORNER", outcome: "SECOND_BALL", seed: "m2-corner-second-ball" },
  { scene: "CORNER", outcome: "CLEARANCE", seed: "m2-corner-clearance" },
  { scene: "PENALTY", outcome: "GOAL", seed: "m2-penalty-goal" },
  { scene: "PENALTY", outcome: "REBOUND", seed: "m2-penalty-rebound" },
];
