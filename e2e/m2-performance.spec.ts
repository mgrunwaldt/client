import { expect, type Page, test } from "@playwright/test";

import type { BackendMatchSnapshot } from "../src/match/api-v1/contract";
import createMatch from "../tests/fixtures/match-api-v1/fixtures/server/create-match-response.json" with { type: "json" };
import waitingOpenPlay from "../tests/fixtures/match-api-v1/fixtures/server/waiting-open-play-response.json" with { type: "json" };
import { authenticateForContinuation } from "./support/auth";

const apiHeaders = {
  "Match-API-Version": "1",
  "X-Request-Id": "m2-performance-evidence",
};

function snapshot(): BackendMatchSnapshot {
  return {
    match: waitingOpenPlay.match,
    my_team: createMatch.my_team,
    opponent_team: createMatch.opponent_team,
    timeline: waitingOpenPlay.events,
    pending_action: waitingOpenPlay.pending_action,
    field_state: waitingOpenPlay.field_state,
    pending_settlement_events: [],
    unsupported_scene: null,
    legend_availability: waitingOpenPlay.legend_availability,
    halftime_summary: waitingOpenPlay.halftime_summary,
    full_time_handoff: waitingOpenPlay.full_time_handoff,
    latest_operation: null,
  } as BackendMatchSnapshot;
}

async function browserMetrics(page: Page) {
  return page.evaluate(async () => {
    const percentile = (values: number[], quantile: number) => {
      const ordered = [...values].sort((left, right) => left - right);
      return ordered[Math.ceil(ordered.length * quantile) - 1] ?? 0;
    };
    const resources = [
      ...performance.getEntriesByType("navigation"),
      ...performance.getEntriesByType("resource"),
    ] as PerformanceResourceTiming[];
    const frameIntervals = await new Promise<number[]>((resolve) => {
      const samples: number[] = [];
      const startedAt = performance.now();
      let previous = startedAt;
      const record = (now: number) => {
        samples.push(now - previous);
        previous = now;
        if (now - startedAt >= 5_000) resolve(samples.slice(1));
        else requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
    const memory = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };

    return {
      frame_ms: {
        p50: percentile(frameIntervals, 0.5),
        p95: percentile(frameIntervals, 0.95),
        p99: percentile(frameIntervals, 0.99),
        samples: frameIntervals.length,
        over_50_ms: frameIntervals.filter((value) => value > 50).length,
      },
      js_heap_used_bytes: memory.memory?.usedJSHeapSize ?? null,
      resource_count: resources.length,
      transfer_bytes: resources.reduce(
        (total, entry) => total + entry.transferSize,
        0,
      ),
      encoded_body_bytes: resources.reduce(
        (total, entry) => total + entry.encodedBodySize,
        0,
      ),
    };
  });
}

test("records M2 production-build mobile performance evidence", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "M2 candidate evidence uses the Pixel 5 production-build emulation profile.",
  );
  test.setTimeout(120_000);

  const payload = snapshot();
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await context.route(`**/api/match/${payload.match.id}`, (route) =>
    route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(payload),
    }),
  );

  await authenticateForContinuation(page);
  await page.goto(`/game/${payload.match.id}`);
  await expect(page.getByTestId("ball-aim-target")).toBeVisible({
    timeout: 90_000,
  });
  const coldStartupMs = await page.evaluate(() => performance.now());
  const cold = await browserMetrics(page);

  await page.reload();
  await expect(page.getByTestId("ball-aim-target")).toBeVisible({
    timeout: 90_000,
  });
  const warmStartupMs = await page.evaluate(() => performance.now());
  const warm = await browserMetrics(page);

  expect(browserErrors).toEqual([]);
  expect(cold.frame_ms.samples).toBeGreaterThan(30);
  expect(warm.frame_ms.samples).toBeGreaterThan(30);

  const evidence = {
    schema: "overgoal-m2-emulated-performance/1",
    profile: "Playwright Pixel 5 / mobile Chromium / local HTTPS",
    limitations: [
      "Desktop device emulation is not physical-device release evidence.",
      "JS heap is a browser-exposed proxy, not process-group physical memory.",
      "M3 owns the complete physical-device/network/battery sample matrix.",
    ],
    cold: { startup_ms: coldStartupMs, ...cold },
    warm: { startup_ms: warmStartupMs, ...warm },
  };
  console.log(`OVERGOAL_M2_PERFORMANCE=${JSON.stringify(evidence)}`);
  await testInfo.attach("m2-performance-evidence.json", {
    body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
    contentType: "application/json",
  });
});
