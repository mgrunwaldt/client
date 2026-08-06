import { useSyncExternalStore } from "react";

import {
  getGameFeedbackPreferences,
  subscribeGameFeedbackPreferences,
} from "./game-feedback";

export function useGameFeedbackPreferences() {
  return useSyncExternalStore(
    subscribeGameFeedbackPreferences,
    getGameFeedbackPreferences,
    getGameFeedbackPreferences,
  );
}
