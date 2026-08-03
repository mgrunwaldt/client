import type { Page } from "@playwright/test";

import { E2E_DEBUG_RESULT_CONTINUATION_KEY } from "../../src/match/result-continuation";

export async function enableDebugResultContinuation(page: Page) {
  await page.addInitScript((key) => {
    window.sessionStorage.setItem(key, "true");
  }, E2E_DEBUG_RESULT_CONTINUATION_KEY);
}
