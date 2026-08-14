import { expect, type Page, test } from "@playwright/test";

import type {
  BackendLegendStatus,
  BackendMatchResponse,
  BackendMatchSnapshot,
} from "../src/match/api-v1/contract";
import { BackendMatchResponseSchema } from "../src/match/api-v1/contract";
import {
  EVENT_MINUTE_DWELL_MS,
  QUIET_MINUTE_DWELL_MS,
} from "../src/match/timeline-playback";
import createMatch from "../tests/fixtures/match-api-v1/fixtures/server/create-match-response.json" with { type: "json" };
import fulltimeResponse from "../tests/fixtures/match-api-v1/fixtures/server/fulltime-response.json" with { type: "json" };
import halftimeResponse from "../tests/fixtures/match-api-v1/fixtures/server/halftime-response.json" with { type: "json" };
import fulltimeSnapshot from "../tests/fixtures/match-api-v1/fixtures/server/match-snapshot-response.json" with { type: "json" };
import waitingOpenPlayResponse from "../tests/fixtures/match-api-v1/fixtures/server/waiting-open-play-response.json" with { type: "json" };
import { authenticateForContinuation } from "./support/auth";

const apiHeaders = {
  "Match-API-Version": "1",
  "X-Request-Id": "m2-i6-lifecycle-e2e",
};

const teams = {
  myTeam: createMatch.my_team,
  opponentTeam: createMatch.opponent_team,
};

async function applySyntheticMobileSafeArea(page: Page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--overgoal-safe-top", "24px");
    root.style.setProperty("--overgoal-safe-right", "8px");
    root.style.setProperty("--overgoal-safe-bottom", "20px");
    root.style.setProperty("--overgoal-safe-left", "8px");
  });
}

async function setResponse(
  page: Page,
  response: unknown,
  displayTeams = teams,
) {
  await page.waitForFunction(
    () => "__OVERGOAL_E2E_SET_MATCH_RESPONSE__" in globalThis,
  );
  await page.evaluate(
    ({ value, myTeam, opponentTeam }) => {
      const bridge = globalThis as typeof globalThis & {
        __OVERGOAL_E2E_SET_MATCH_RESPONSE__?: (
          response: unknown,
          team: unknown,
          opponent: unknown,
        ) => void;
      };
      if (!bridge.__OVERGOAL_E2E_SET_MATCH_RESPONSE__) {
        throw new Error("Match response bridge is unavailable");
      }
      bridge.__OVERGOAL_E2E_SET_MATCH_RESPONSE__(value, myTeam, opponentTeam);
    },
    { value: response, ...displayTeams },
  );
}

async function routeToMatch(page: Page, matchId: string) {
  await page.evaluate((pathname) => {
    window.history.pushState({}, "", pathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/match/${matchId}`);
  await expect(page.getByTestId("timeline-screen")).toBeVisible();
}

function snapshotFromResponse(
  response: BackendMatchResponse,
): BackendMatchSnapshot {
  return {
    match: response.match,
    my_team: teams.myTeam,
    opponent_team: teams.opponentTeam,
    timeline: response.events,
    pending_action: response.pending_action,
    field_state: response.field_state,
    pending_settlement_events: response.pending_settlement_events,
    unsupported_scene: response.unsupported_scene,
    legend_availability: response.legend_availability,
    halftime_summary: response.halftime_summary,
    full_time_handoff: response.full_time_handoff,
    latest_operation: response.latest_operation ?? null,
  };
}

function minuteBeforeHalftime(): BackendMatchResponse {
  const response = structuredClone(halftimeResponse) as BackendMatchResponse;
  response.minute = 44;
  response.prev_time = 43;
  response.status = "IN_PROGRESS";
  response.action = null;
  response.action_team = null;
  response.events = [];
  response.halftime_summary = null;
  response.match = {
    ...response.match,
    revision: halftimeResponse.match.revision - 1,
    current_time: 44,
    prev_time: 43,
    match_status: "IN_PROGRESS",
    pending_action: null,
  };
  return response;
}

function fullFirstHalfPlayback(): BackendMatchResponse {
  const response = structuredClone(halftimeResponse) as BackendMatchResponse;
  const halftimeEvent = response.events[0];
  response.prev_time = 1;
  response.events = [
    {
      ...halftimeEvent,
      event_id: 5,
      action: "OPEN_PLAY",
      minute: 5,
      team: "MY_TEAM",
      description: "Dojo United starts to find space.",
      my_team_score: 0,
      player_participates: false,
      halftime: false,
    },
    {
      ...halftimeEvent,
      event_id: 20,
      action: "OPEN_PLAY",
      minute: 20,
      team: "MY_TEAM",
      description: "GOAL! Dojo United breaks through.",
      my_team_scored: true,
      player_participates: false,
      halftime: false,
    },
    {
      ...halftimeEvent,
      event_id: 33,
      action: "OPEN_PLAY",
      minute: 33,
      team: "OPPONENT_TEAM",
      description: "Cartridge City pushes forward.",
      player_participates: false,
      halftime: false,
    },
    halftimeEvent,
  ];
  response.match = {
    ...response.match,
    prev_time: 1,
    event_counter: 8,
  };
  return response;
}

function timelineHudFixture(): BackendMatchResponse {
  const response = timelineCheckpoint(20, 20, "MEDIUM");
  const baseEvent = structuredClone(
    halftimeResponse.events[0],
  ) as BackendMatchResponse["events"][number];
  response.prev_time = 20;
  response.events = [
    {
      ...baseEvent,
      event_id: 18,
      action: "RESUME_MATCH",
      minute: 18,
      team: "NEUTRAL",
      description: "The match surges back into life.",
      my_team_score: 0,
      opponent_team_score: 0,
      my_team_scored: false,
      opponent_team_scored: false,
      player_participates: false,
      halftime: false,
    },
    {
      ...baseEvent,
      event_id: 19,
      action: "OPEN_PLAY",
      minute: 19,
      team: "OPPONENT_TEAM",
      description: "GOAL! The opposition breaks through and finds the net.",
      my_team_score: 0,
      opponent_team_score: 1,
      my_team_scored: false,
      opponent_team_scored: true,
      player_participates: false,
      halftime: false,
    },
    {
      ...baseEvent,
      event_id: 20,
      action: "OPEN_PLAY",
      minute: 20,
      team: "MY_TEAM",
      description: "GOAL! A flowing team move ends in the net.",
      my_team_score: 1,
      opponent_team_score: 1,
      my_team_scored: true,
      opponent_team_scored: false,
      player_participates: false,
      halftime: false,
    },
  ];
  response.match = {
    ...response.match,
    current_time: 20,
    prev_time: 20,
    my_team_score: 1,
    opponent_team_score: 1,
    event_counter: 20,
    legend_profile: {
      ...createMatch.match.legend_profile,
      stamina: 78,
      energy: 63,
    },
  };
  return response;
}

function prematchViewportFixture(): BackendMatchResponse {
  const response = structuredClone(halftimeResponse) as BackendMatchResponse;
  response.minute = 1;
  response.prev_time = 0;
  response.status = "NOT_STARTED";
  response.action = null;
  response.action_team = null;
  response.events = [];
  response.pending_action = null;
  response.field_state = null;
  response.halftime_summary = null;
  response.full_time_handoff = null;
  response.match = {
    ...response.match,
    id: "prematch-mobile-layout",
    current_time: 1,
    prev_time: 0,
    match_status: "NOT_STARTED",
    pending_action: null,
    legend_player_id: "TEAM_1_RB_2",
    legend_profile: {
      ...createMatch.match.legend_profile,
      stamina: 78,
      energy: 63,
    },
  };
  return response;
}

function timelineCheckpoint(
  minute: number,
  revision: number,
  effort: "MEDIUM" | "HIGH",
  scheduledEffort: "MEDIUM" | "HIGH" | null = null,
): BackendMatchResponse {
  const response = structuredClone(halftimeResponse) as BackendMatchResponse;
  response.minute = minute;
  response.prev_time = Math.max(0, minute - 1);
  response.status = "IN_PROGRESS";
  response.action = null;
  response.action_team = null;
  response.events = [];
  response.pending_action = null;
  response.field_state = null;
  response.halftime_summary = null;
  response.full_time_handoff = null;
  response.latest_operation = null;
  response.match = {
    ...response.match,
    revision,
    current_time: minute,
    prev_time: response.prev_time,
    match_status: "IN_PROGRESS",
    pending_action: null,
    tactics: { version: 1, effort, playstyle: "BALANCED" },
    scheduled_tactics: scheduledEffort
      ? {
          version: 1,
          effective_minute: minute + 1,
          command_sequence: revision,
          tactics: {
            version: 1,
            effort: scheduledEffort,
            playstyle: "BALANCED",
          },
        }
      : null,
  };
  return response;
}

function interactionCheckpoint(
  minute: number,
  revision: number,
  effort: "MEDIUM" | "HIGH",
  scheduledEffort: "MEDIUM" | "HIGH" | null = null,
): BackendMatchResponse {
  const response = structuredClone(
    waitingOpenPlayResponse,
  ) as BackendMatchResponse;
  response.minute = minute;
  response.prev_time = minute - 1;
  response.events = response.events.map((event) => ({ ...event, minute }));
  response.field_state = { ...response.field_state!, minute };
  response.pending_action = {
    ...response.pending_action!,
    minute,
    field_state: response.field_state,
  };
  response.match = {
    ...response.match,
    revision,
    current_time: minute,
    prev_time: minute - 1,
    pending_action: response.pending_action,
    tactics: { version: 1, effort, playstyle: "BALANCED" },
    scheduled_tactics: scheduledEffort
      ? {
          version: 1,
          effective_minute: minute + 1,
          command_sequence: revision,
          tactics: {
            version: 1,
            effort: scheduledEffort,
            playstyle: "BALANCED",
          },
        }
      : null,
  };
  return response;
}

function unavailableFulltime(
  status: Exclude<BackendLegendStatus, "AVAILABLE">,
) {
  const response = structuredClone(fulltimeResponse) as BackendMatchResponse;
  response.prev_time = 88;
  response.match.prev_time = 88;
  response.match.player_participation = "OBSERVING";
  response.legend_availability = {
    version: 1,
    status,
    availability: "UNAVAILABLE",
    participation: "OBSERVING",
    interactive_controls: false,
    unavailable_since_minute: 88,
  };
  if (!response.full_time_handoff) throw new Error("missing full-time fixture");
  response.full_time_handoff.legend_contribution = {
    ...response.full_time_handoff.legend_contribution,
    status,
    availability: "UNAVAILABLE",
    minutes_played: 88,
    injured: status === "INJURED",
    substituted: status === "SUBSTITUTED",
    red_card: status === "EXPELLED",
  };
  return response;
}

function unavailableInProgress(
  status: Exclude<BackendLegendStatus, "AVAILABLE">,
) {
  const response = structuredClone(
    waitingOpenPlayResponse,
  ) as BackendMatchResponse;
  response.minute = 87;
  response.prev_time = 86;
  response.status = "IN_PROGRESS";
  response.action = null;
  response.action_team = null;
  response.events = [];
  response.pending_action = null;
  response.field_state = null;
  response.full_time_handoff = null;
  response.match = {
    ...response.match,
    current_time: 87,
    prev_time: 86,
    match_status: "IN_PROGRESS",
    pending_action: null,
    player_participation: "OBSERVING",
  };
  response.legend_availability = {
    version: 1,
    status,
    availability: "UNAVAILABLE",
    participation: "OBSERVING",
    interactive_controls: false,
    unavailable_since_minute: 87,
  };
  return response;
}

function resumedSecondHalf(): BackendMatchResponse {
  const response = structuredClone(
    waitingOpenPlayResponse,
  ) as BackendMatchResponse;
  response.minute = 46;
  response.prev_time = 45;
  response.status = "IN_PROGRESS";
  response.pending_action = null;
  response.field_state = null;
  response.action = "RESUME_MATCH";
  response.action_team = "NEUTRAL";
  response.events = [
    {
      ...response.events[0],
      event_id: 46,
      minute: 46,
      action: "RESUME_MATCH",
      team: "NEUTRAL",
      description: "Second half resumed.",
      player_participates: false,
    },
  ];
  response.match = {
    ...response.match,
    id: halftimeResponse.match.id,
    revision: halftimeResponse.match.revision + 1,
    current_time: 46,
    prev_time: 45,
    match_status: "IN_PROGRESS",
    pending_action: null,
    player_participation: "PARTICIPATING",
  };
  response.legend_availability = {
    ...response.legend_availability,
    participation: "PARTICIPATING",
  };
  response.halftime_summary = structuredClone(
    halftimeResponse.halftime_summary,
  ) as BackendMatchResponse["halftime_summary"];
  return response;
}

function secondHalfInteraction(): BackendMatchResponse {
  const response = structuredClone(
    waitingOpenPlayResponse,
  ) as BackendMatchResponse;
  response.minute = 47;
  response.prev_time = 46;
  response.status = "WAITING_FOR_DECISION";
  response.action = "OPEN_PLAY";
  response.field_state = {
    ...response.field_state!,
    minute: 47,
  };
  response.pending_action = {
    ...response.pending_action!,
    minute: 47,
    field_state: response.field_state,
  };
  response.events = [
    {
      ...response.events[0],
      event_id: 47,
      minute: 47,
      action: "OPEN_PLAY",
      description: "Your Legend receives the ball in open play.",
      player_participates: true,
    },
  ];
  response.match = {
    ...response.match,
    id: halftimeResponse.match.id,
    revision: halftimeResponse.match.revision + 2,
    current_time: 47,
    prev_time: 46,
    match_status: "WAITING_FOR_DECISION",
    pending_action: response.pending_action,
    player_participation: "PARTICIPATING",
  };
  response.legend_availability = {
    ...response.legend_availability,
    participation: "PARTICIPATING",
  };
  response.halftime_summary = structuredClone(
    halftimeResponse.halftime_summary,
  ) as BackendMatchResponse["halftime_summary"];
  return response;
}

test("continues at minute 46 and advances one checkpoint to the next interaction", async ({
  context,
  page,
}) => {
  const interactionValidation = BackendMatchResponseSchema.safeParse(
    secondHalfInteraction(),
  );
  expect(
    interactionValidation.success,
    interactionValidation.error?.message,
  ).toBe(true);
  let resumes = 0;
  let releaseResume!: () => void;
  const resumeGate = new Promise<void>((resolve) => {
    releaseResume = resolve;
  });
  await context.route("**/api/resumeMatch", async (route) => {
    resumes += 1;
    if (resumes === 1) await resumeGate;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(
        resumes === 1 ? resumedSecondHalf() : secondHalfInteraction(),
      ),
    });
  });
  await authenticateForContinuation(page);
  await setResponse(page, halftimeResponse);
  await routeToMatch(page, halftimeResponse.match.id);
  await expect(
    page.getByRole("progressbar", { name: "Half-time energy recovery" }),
  ).toHaveAttribute("aria-valuenow", "62");
  await expect(page.getByTestId("halftime-energy-recovery")).toBeVisible();
  await expect(page.getByTestId("halftime-panel")).not.toContainText(
    /Recovery|48|62|78/u,
  );
  const continueButton = page.getByTestId("continue-second-half");
  await continueButton.focus();
  await expect(continueButton).toBeFocused();
  const requestStarted = page.waitForRequest("**/api/resumeMatch");
  const click = continueButton.click();
  await requestStarted;
  await expect(continueButton).toBeDisabled();
  releaseResume();
  await click;

  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "46",
    { timeout: 5_000 },
  );
  await expect.poll(() => resumes).toBe(2);
  await expect(page).toHaveURL(
    new RegExp(`/game/${halftimeResponse.match.id}$`, "u"),
    { timeout: 5_000 },
  );
  await expect(page.getByTestId("game-field")).toBeVisible();
  await expect(page.getByTestId("halftime-panel")).toHaveCount(0);
  await expect(page.getByTestId("match-result-screen")).toHaveCount(0);
  await expect(page.getByText("Tactical")).toHaveCount(0);
});

test("advances from minute 44 to the visible halftime interval without moving the viewport", async ({
  context,
  page,
}) => {
  const checkpoint = minuteBeforeHalftime();
  const halftime = {
    ...structuredClone(halftimeResponse),
    prev_time: 44,
    match: { ...halftimeResponse.match, prev_time: 44 },
  } as BackendMatchResponse;
  expect(BackendMatchResponseSchema.safeParse(checkpoint).success).toBe(true);
  expect(BackendMatchResponseSchema.safeParse(halftime).success).toBe(true);

  let resumes = 0;
  await context.route("**/api/resumeMatch", (route) => {
    resumes += 1;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(halftime),
    });
  });
  await authenticateForContinuation(page);
  await setResponse(page, checkpoint);
  await routeToMatch(page, checkpoint.match.id);

  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "44",
  );
  const eventFeed = page.getByTestId("match-event-feed");
  await expect(eventFeed).toBeVisible();
  await page.evaluate(() => {
    document.body.style.minHeight = "200vh";
    scrollTo(0, 180);
  });
  const viewportScrollBefore = await page.evaluate(() => scrollY);
  expect(viewportScrollBefore).toBeGreaterThan(0);
  await expect.poll(() => resumes).toBe(1);
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "45",
    { timeout: 5_000 },
  );
  await expect(page.getByTestId("halftime-panel")).toBeVisible();
  await expect(page.getByTestId("halftime-panel")).toContainText("Half time");
  await expect(eventFeed).toHaveAttribute(
    "data-current-event-id",
    `${halftime.match.id}_8`,
  );
  expect(await page.evaluate(() => scrollY)).toBe(viewportScrollBefore);
});

test("plays every first-half minute once with longer readable event beats", async ({
  context,
  page,
}) => {
  test.slow();
  const kickoff = timelineCheckpoint(1, 0, "MEDIUM");
  const response = fullFirstHalfPlayback();
  const kickoffValidation = BackendMatchResponseSchema.safeParse(kickoff);
  const validation = BackendMatchResponseSchema.safeParse(response);
  expect(kickoffValidation.success, kickoffValidation.error?.message).toBe(
    true,
  );
  expect(validation.success, validation.error?.message).toBe(true);
  let releaseFirstHalf!: () => void;
  const firstHalfGate = new Promise<void>((resolve) => {
    releaseFirstHalf = resolve;
  });
  await context.route("**/api/resumeMatch", async (route) => {
    await firstHalfGate;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  await authenticateForContinuation(page);
  await setResponse(page, kickoff);
  await routeToMatch(page, kickoff.match.id);
  await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>(
      '[data-testid="timeline-screen"]',
    );
    if (!screen) throw new Error("Timeline screen is unavailable");
    type TraceEntry = {
      minute: number;
      eventId: string | null;
      dwellMs: number;
      at: number;
    };
    const global = globalThis as typeof globalThis & {
      __OVERGOAL_TIMELINE_TRACE__?: TraceEntry[];
    };
    const capture = () => {
      global.__OVERGOAL_TIMELINE_TRACE__?.push({
        minute: Number(screen.dataset.playbackMinute),
        eventId:
          document
            .querySelector<HTMLElement>('[data-testid="match-event-feed"]')
            ?.getAttribute("data-current-event-id") ?? null,
        dwellMs: Number(screen.dataset.minuteDwellMs),
        at: performance.now(),
      });
    };
    global.__OVERGOAL_TIMELINE_TRACE__ = [];
    capture();
    new MutationObserver(capture).observe(screen, {
      attributes: true,
      attributeFilter: ["data-playback-minute"],
    });
  });
  releaseFirstHalf();

  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "20",
    { timeout: 30_000 },
  );
  await expect(page).toHaveScreenshot("timeline-event-minute-20.png", {
    animations: "disabled",
  });
  await expect(page.getByTestId("halftime-panel")).toBeVisible({
    timeout: 55_000,
  });
  const trace = await page.evaluate(() => {
    const global = globalThis as typeof globalThis & {
      __OVERGOAL_TIMELINE_TRACE__?: Array<{
        minute: number;
        eventId: string | null;
        dwellMs: number;
        at: number;
      }>;
    };
    return global.__OVERGOAL_TIMELINE_TRACE__ ?? [];
  });

  expect(trace.map(({ minute }) => minute)).toEqual(
    Array.from({ length: 46 }, (_, minute) => minute),
  );
  expect(trace.filter(({ eventId }) => eventId !== null)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ minute: 5, eventId: `${response.match.id}_5` }),
      expect.objectContaining({
        minute: 20,
        eventId: `${response.match.id}_20`,
      }),
      expect.objectContaining({
        minute: 33,
        eventId: `${response.match.id}_33`,
      }),
      expect.objectContaining({
        minute: 45,
        eventId: `${response.match.id}_8`,
      }),
    ]),
  );

  const dwellAfter = (minute: number) => {
    const index = trace.findIndex((entry) => entry.minute === minute);
    return trace[index + 1].at - trace[index].at;
  };
  expect(dwellAfter(0)).toBeGreaterThanOrEqual(1_000);
  expect(dwellAfter(0)).toBeLessThan(3_000);
  for (const minute of [1, 6, 21, 34]) {
    expect(trace.find((entry) => entry.minute === minute)?.dwellMs).toBe(
      QUIET_MINUTE_DWELL_MS,
    );
    expect(dwellAfter(minute)).toBeGreaterThanOrEqual(650);
    expect(dwellAfter(minute)).toBeLessThan(3_000);
  }
  for (const minute of [5, 20, 33]) {
    expect(trace.find((entry) => entry.minute === minute)?.dwellMs).toBe(
      EVENT_MINUTE_DWELL_MS,
    );
    expect(dwellAfter(minute)).toBeGreaterThanOrEqual(1_350);
    expect(dwellAfter(minute)).toBeLessThan(3_000);
  }
});

test("fits the complete live HUD in every supported mobile viewport", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Mobile layout evidence runs once in the mobile project.",
  );

  const fixture = timelineHudFixture();
  expect(BackendMatchResponseSchema.safeParse(fixture).success).toBe(true);
  let releaseResume!: () => void;
  const resumeGate = new Promise<void>((resolve) => {
    releaseResume = resolve;
  });
  await context.route("**/api/resumeMatch", async (route) => {
    await resumeGate;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(interactionCheckpoint(21, 21, "MEDIUM")),
    });
  });

  await authenticateForContinuation(page);
  await setResponse(page, fixture, {
    myTeam: { ...teams.myTeam, name: "Dojo United Academy" },
    opponentTeam: {
      ...teams.opponentTeam,
      name: "Cartridge Metropolitan City",
    },
  });
  const resumeStarted = page.waitForRequest("**/api/resumeMatch");
  await routeToMatch(page, fixture.match.id);
  await resumeStarted;
  await applySyntheticMobileSafeArea(page);
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "20",
  );
  await expect(page.locator('[data-score-link$="_20"]')).toBeVisible();
  await expect(page.locator('[data-score-event-id$="_20"]')).toBeVisible();

  const viewportEvidence: Array<Record<string, unknown>> = [];
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => {
      const selectors = [
        '[data-testid="timeline-screen"]',
        "header",
        '[data-testid="match-event-feed"]',
        '[data-testid="legend-energy-meter"]',
        '[data-testid="match-tactics-controls"]',
      ];
      const viewportHeight = visualViewport?.height ?? innerHeight;
      return {
        viewportHeight,
        documentHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ),
        scrollY,
        elements: selectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) return { selector, missing: true };
          const bounds = element.getBoundingClientRect();
          return {
            selector,
            top: bounds.top,
            bottom: bounds.bottom,
            height: bounds.height,
          };
        }),
      };
    });
    expect(metrics.documentHeight).toBeLessThanOrEqual(
      metrics.viewportHeight + 1,
    );
    expect(metrics.scrollY).toBe(0);
    for (const element of metrics.elements) {
      expect("missing" in element).toBe(false);
      if (!("bottom" in element)) continue;
      expect(element.top).toBeGreaterThanOrEqual(-1);
      expect(element.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    }
    viewportEvidence.push({ ...viewport, ...metrics });
    await expect(page).toHaveScreenshot(
      `timeline-hud-${viewport.width}x${viewport.height}.png`,
      { animations: "disabled" },
    );
  }

  await page.setViewportSize({ width: 430, height: 932 });
  const largeTextStyle = await page.addStyleTag({
    content: "html { font-size: 200%; }",
  });
  const largeTextMetrics = await page.evaluate(() => ({
    viewportHeight: visualViewport?.height ?? innerHeight,
    documentHeight: Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    ),
    controls: Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="match-tactics-controls"] button',
      ),
    ).map(({ scrollWidth, clientWidth, scrollHeight, clientHeight }) => ({
      scrollWidth,
      clientWidth,
      scrollHeight,
      clientHeight,
    })),
  }));
  expect(largeTextMetrics.documentHeight).toBeLessThanOrEqual(
    largeTextMetrics.viewportHeight + 1,
  );
  for (const control of largeTextMetrics.controls) {
    expect(control.scrollWidth).toBeLessThanOrEqual(control.clientWidth + 1);
    expect(control.scrollHeight).toBeLessThanOrEqual(control.clientHeight + 1);
  }
  await expect(page.getByTestId("current-effort")).toBeVisible();
  await expect(page.getByTestId("current-playstyle")).toBeVisible();
  await expect(page).toHaveScreenshot("timeline-hud-large-text-430x932.png", {
    animations: "disabled",
  });
  await largeTextStyle.evaluate((element) =>
    element.parentNode?.removeChild(element),
  );

  await page.setViewportSize({ width: 320, height: 568 });
  const effortTrigger = page.locator('[aria-controls="effort-options"]');
  const playstyleTrigger = page.locator('[aria-controls="playstyle-options"]');
  for (const trigger of [effortTrigger, playstyleTrigger]) {
    const bounds = await trigger.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  }
  await effortTrigger.click();
  await expect(page.getByTestId("tactics-option-drawer")).toBeVisible();
  for (const option of await page
    .getByTestId("tactics-option-drawer")
    .getByRole("button")
    .all()) {
    const bounds = await option.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByTestId("current-effort")).toBeVisible();
  await expect(page.getByTestId("current-playstyle")).toBeVisible();
  await effortTrigger.click();

  const motion = await page.evaluate(() => ({
    event: getComputedStyle(
      document.querySelector<HTMLElement>(".event-feed-item")!,
    ).animationName,
    score: getComputedStyle(
      document.querySelector<HTMLElement>(".score-event-pulse-team")!,
    ).animationName,
  }));
  expect(motion).toEqual({ event: "none", score: "none" });
  await testInfo.attach("timeline-mobile-layout-metrics.json", {
    body: Buffer.from(JSON.stringify(viewportEvidence, null, 2)),
    contentType: "application/json",
  });

  releaseResume();
});

test("fits the complete prematch decision in every supported mobile viewport", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Mobile layout evidence runs once in the mobile project.",
  );

  const fixture = prematchViewportFixture();
  expect(BackendMatchResponseSchema.safeParse(fixture).success).toBe(true);
  await authenticateForContinuation(page);
  await setResponse(page, fixture, {
    myTeam: { ...teams.myTeam, name: "Dojo United Academy" },
    opponentTeam: {
      ...teams.opponentTeam,
      name: "Cartridge Metropolitan City",
    },
  });
  await page.evaluate((matchId) => {
    window.history.pushState({}, "", `/pre-match/${matchId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, fixture.match.id);
  await applySyntheticMobileSafeArea(page);
  await expect(page.getByTestId("prematch-screen")).toBeVisible();
  await expect(page.getByTestId("legend-player-name")).toHaveText(
    "Your Legend",
  );
  await expect(page.getByText("TEAM_1_RB_2", { exact: true })).toHaveCount(0);

  const viewportEvidence: Array<Record<string, unknown>> = [];
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => {
      const selectors = [
        '[data-testid="prematch-screen"]',
        '[aria-label="Matchup"]',
        '[aria-label="Legend readiness"]',
        '[data-testid="prematch-back"]',
        '[data-testid="prematch-play"]',
      ];
      const viewportHeight = visualViewport?.height ?? innerHeight;
      const viewportWidth = visualViewport?.width ?? innerWidth;
      return {
        viewportHeight,
        viewportWidth,
        documentHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ),
        documentWidth: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        scrollX,
        scrollY,
        elements: selectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) return { selector, missing: true };
          const bounds = element.getBoundingClientRect();
          return {
            selector,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            left: bounds.left,
            height: bounds.height,
            width: bounds.width,
          };
        }),
      };
    });
    expect(metrics.documentHeight).toBeLessThanOrEqual(
      metrics.viewportHeight + 1,
    );
    expect(metrics.documentWidth).toBeLessThanOrEqual(
      metrics.viewportWidth + 1,
    );
    expect(metrics.scrollX).toBe(0);
    expect(metrics.scrollY).toBe(0);
    for (const element of metrics.elements) {
      expect("missing" in element).toBe(false);
      if (!("bottom" in element)) continue;
      expect(element.top).toBeGreaterThanOrEqual(-1);
      expect(element.left).toBeGreaterThanOrEqual(-1);
      expect(element.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(element.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    }
    viewportEvidence.push({ ...viewport, ...metrics });
    await expect(page).toHaveScreenshot(
      `prematch-${viewport.width}x${viewport.height}.png`,
      { animations: "disabled" },
    );
  }

  for (const testId of ["prematch-back", "prematch-play"]) {
    const target = page.getByTestId(testId);
    const bounds = await target.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    await target.focus();
    await expect(target).toBeFocused();
  }
  await testInfo.attach("prematch-mobile-layout-metrics.json", {
    body: Buffer.from(JSON.stringify(viewportEvidence, null, 2)),
    contentType: "application/json",
  });
});

test("moves from minute 20 into a cold field opportunity without a hidden WebGL stall", async ({
  context,
  page,
}, testInfo) => {
  const minuteTwenty = timelineCheckpoint(20, 20, "MEDIUM");
  const opportunity = interactionCheckpoint(21, 21, "MEDIUM");
  let releaseResume!: () => void;
  const resumeGate = new Promise<void>((resolve) => {
    releaseResume = resolve;
  });

  await context.route("**/api/resumeMatch", async (route) => {
    await resumeGate;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(opportunity),
    });
  });
  await authenticateForContinuation(page);
  await setResponse(page, minuteTwenty);
  await routeToMatch(page, minuteTwenty.match.id);
  await page.evaluate(() => {
    const screen = document.querySelector<HTMLElement>(
      '[data-testid="timeline-screen"]',
    );
    if (!screen) throw new Error("Timeline screen is unavailable");
    const global = globalThis as typeof globalThis & {
      __OVERGOAL_MINUTE_20_TRACE__?: number[];
    };
    global.__OVERGOAL_MINUTE_20_TRACE__ = [
      Number(screen.dataset.playbackMinute),
    ];
    new MutationObserver(() => {
      global.__OVERGOAL_MINUTE_20_TRACE__?.push(
        Number(screen.dataset.playbackMinute),
      );
    }).observe(screen, {
      attributes: true,
      attributeFilter: ["data-playback-minute"],
    });
  });

  await expect(page.getByTestId("timeline-transition-feedback")).toContainText(
    "Reading the play",
  );
  const residentField = page.getByTestId("game-field");
  const residentCanvas = residentField.locator("canvas");
  await expect(residentField).toBeAttached();
  await expect(residentCanvas).toBeAttached();
  await residentCanvas.evaluate((element) => {
    element.setAttribute("data-resident-renderer", "minute-20");
  });
  const frozenSceneKey = await residentField.getAttribute(
    "data-render-scene-key",
  );
  expect(frozenSceneKey).toBeTruthy();
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "20",
  );
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("timeline-transition-feedback")).toContainText(
    "Reading the play",
  );
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "20",
  );

  const responseReleasedAt = await page.evaluate(() => performance.now());
  releaseResume();
  await expect(page.getByTestId("timeline-transition-feedback")).toContainText(
    "Opportunity incoming",
    { timeout: 500 },
  );
  const feedbackAt = await page.evaluate(() => performance.now());
  expect(feedbackAt - responseReleasedAt).toBeLessThan(500);
  await expect(residentField).toHaveAttribute(
    "data-render-scene-key",
    frozenSceneKey!,
  );
  await expect(residentCanvas).toHaveAttribute(
    "data-resident-renderer",
    "minute-20",
  );

  await expect(page).toHaveURL(`/game/${minuteTwenty.match.id}`, {
    timeout: 1_500,
  });
  const fieldTransitionAt = await page.evaluate(() => performance.now());
  expect(fieldTransitionAt - responseReleasedAt).toBeLessThan(1_500);
  await expect(residentField).toHaveAttribute(
    "data-session-phase",
    "scene_ready",
  );
  await expect(residentField).not.toHaveAttribute(
    "data-render-scene-key",
    frozenSceneKey!,
  );
  await expect(residentCanvas).toHaveAttribute(
    "data-resident-renderer",
    "minute-20",
  );
  await expect(residentField).toHaveAttribute("data-render-ready", "true", {
    timeout: 15_000,
  });
  const minuteTrace = await page.evaluate(() => {
    const global = globalThis as typeof globalThis & {
      __OVERGOAL_MINUTE_20_TRACE__?: number[];
    };
    return global.__OVERGOAL_MINUTE_20_TRACE__;
  });
  expect(minuteTrace).toEqual([19, 20, 21]);
  const timingEvidence = {
    feedbackMs: feedbackAt - responseReleasedAt,
    fieldRouteMs: fieldTransitionAt - responseReleasedAt,
    minuteTrace,
    simulatedApiDelayMs: 2_000,
  };
  console.info(`[minute-20-transition] ${JSON.stringify(timingEvidence)}`);
  await testInfo.attach("minute-20-transition-timing.json", {
    body: Buffer.from(JSON.stringify(timingEvidence, null, 2)),
    contentType: "application/json",
  });
});

test("keeps the latest tactics choice made while the timeline is advancing", async ({
  context,
  page,
}) => {
  const minuteTwo = timelineCheckpoint(2, 2, "MEDIUM");
  const highScheduled = timelineCheckpoint(2, 3, "MEDIUM", "HIGH");
  const minuteThree = timelineCheckpoint(3, 4, "HIGH");
  const minuteFour = interactionCheckpoint(4, 5, "HIGH");
  const mediumScheduled = interactionCheckpoint(4, 6, "HIGH", "MEDIUM");
  let releaseSecondResume!: () => void;
  const secondResumeGate = new Promise<void>((resolve) => {
    releaseSecondResume = resolve;
  });
  let resumeRequests = 0;
  const tacticsRequests: Array<{
    body: unknown;
    revision: string | undefined;
  }> = [];

  await context.route(`**/api/match/${minuteTwo.match.id}/tactics`, (route) => {
    const request = route.request();
    tacticsRequests.push({
      body: request.postDataJSON(),
      revision: request.headers()["if-match-revision"],
    });
    const response =
      tacticsRequests.length === 1 ? highScheduled : mediumScheduled;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(snapshotFromResponse(response)),
    });
  });
  await context.route("**/api/resumeMatch", async (route) => {
    resumeRequests += 1;
    if (resumeRequests === 2) await secondResumeGate;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(resumeRequests === 1 ? minuteThree : minuteFour),
    });
  });

  await authenticateForContinuation(page);
  await setResponse(page, minuteTwo);
  await routeToMatch(page, minuteTwo.match.id);

  await page.getByRole("button", { name: /Effort Medium/i }).click();
  await page.getByRole("button", { name: "High", exact: true }).click();
  await expect.poll(() => tacticsRequests).toHaveLength(1);
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-effort",
    "high",
  );

  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "3",
  );
  await expect.poll(() => resumeRequests).toBe(2);
  await page.getByRole("button", { name: /Effort High/i }).click();
  const lowButton = page.getByRole("button", { name: "Low", exact: true });
  await lowButton.click();
  await page.getByRole("button", { name: /Effort Low/i }).click();
  const mediumButton = page.getByRole("button", {
    name: "Medium",
    exact: true,
  });
  await mediumButton.click();
  await expect(page.getByTestId("current-effort")).toHaveText("Medium");
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-tactics-sync",
    "pending",
  );

  releaseSecondResume();
  await expect.poll(() => tacticsRequests).toHaveLength(2);
  expect(tacticsRequests).toEqual([
    {
      body: { version: 1, effort: "HIGH", playstyle: "BALANCED" },
      revision: "2",
    },
    {
      body: { version: 1, effort: "MEDIUM", playstyle: "BALANCED" },
      revision: "5",
    },
  ]);
  await expect(page).toHaveURL(new RegExp(`/game/${minuteTwo.match.id}$`));
  await expect(page.getByTestId("game-field")).toBeVisible();
});

test("renders persisted halftime, refreshes it, and sends one guarded resume command", async ({
  context,
  page,
}) => {
  let resumes = 0;
  await context.route("**/api/resumeMatch", async (route) => {
    resumes += 1;
    expect(route.request().headers()["if-match-revision"]).toBe(
      String(halftimeResponse.match.revision),
    );
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    const resumed = {
      ...fulltimeResponse,
      prev_time: 89,
      match: {
        ...fulltimeResponse.match,
        id: halftimeResponse.match.id,
        revision: halftimeResponse.match.revision + 1,
        prev_time: 89,
        match_status: "FINISHED",
        pending_action: null,
        player_participation: "OBSERVING",
      },
      legend_availability: {
        ...fulltimeResponse.legend_availability,
        status: "SUBSTITUTED",
        availability: "UNAVAILABLE",
        participation: "OBSERVING",
        interactive_controls: false,
        unavailable_since_minute: 89,
      },
      halftime_summary: halftimeResponse.halftime_summary,
    };
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(resumed),
    });
  });
  await context.route(`**/api/match/${halftimeResponse.match.id}`, (route) =>
    route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify({
        match: halftimeResponse.match,
        my_team: teams.myTeam,
        opponent_team: teams.opponentTeam,
        timeline: halftimeResponse.events,
        pending_action: halftimeResponse.pending_action,
        field_state: halftimeResponse.field_state,
        pending_settlement_events: halftimeResponse.pending_settlement_events,
        unsupported_scene: halftimeResponse.unsupported_scene,
        legend_availability: halftimeResponse.legend_availability,
        halftime_summary: halftimeResponse.halftime_summary,
        full_time_handoff: halftimeResponse.full_time_handoff,
        latest_operation: null,
      }),
    }),
  );

  await authenticateForContinuation(page);
  await setResponse(page, halftimeResponse);
  await routeToMatch(page, halftimeResponse.match.id);
  await expect(page.getByTestId("halftime-panel")).toContainText("Half time");
  await expect(page.getByTestId("halftime-energy-recovery")).toBeVisible();
  await expect(page.getByTestId("halftime-panel")).not.toContainText(
    "Recovery",
  );
  await expect(page.getByText("Tactical")).toHaveCount(0);
  await expect(page.getByTestId("halftime-panel")).toHaveScreenshot(
    "halftime-energy-recovery.png",
    { animations: "disabled" },
  );

  await page.reload();
  await expect(page.getByTestId("halftime-panel")).toBeVisible();
  await page.getByTestId("continue-second-half").dblclick();
  await expect.poll(() => resumes).toBe(1);
  await expect(page.getByTestId("legend-unavailable-simulation")).toBeVisible();
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "89",
  );
  await expect(page.getByTestId("match-result-screen")).toBeVisible({
    timeout: 4_000,
  });
});

test("loads the authoritative full-time result directly after refresh", async ({
  context,
  page,
}) => {
  await context.route(`**/api/match/${fulltimeResponse.match.id}`, (route) =>
    route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(fulltimeSnapshot),
    }),
  );
  await authenticateForContinuation(page);
  await page.goto(`/match-result/${fulltimeResponse.match.id}`);
  await expect(page.getByTestId("match-result-screen")).toBeVisible();
  await expect(page.getByTestId("match-result-screen")).toContainText("WIN");
  await expect(page.getByTestId("match-result-screen")).toContainText("2:1");
  await expect(page.getByTestId("match-result-screen")).toContainText(
    "+3 season points",
  );
  await expect(page.getByTestId("match-result-screen")).not.toContainText(
    "PENDING_HANDOFF",
  );
  await expect(page.getByText(/abandon/i)).toHaveCount(0);
  await expect(page.getByTestId("match-result-screen")).toHaveScreenshot(
    "match-result-game-summary.png",
    { animations: "disabled" },
  );
});

test.describe("Legend-unavailable simulation", () => {
  test("continues automatically from minute 87 after the Legend is substituted", async ({
    context,
    page,
  }) => {
    const response = unavailableInProgress("SUBSTITUTED");
    const finished = unavailableFulltime("SUBSTITUTED");
    finished.match.id = response.match.id;
    let resumes = 0;

    expect(BackendMatchResponseSchema.safeParse(response).success).toBe(true);
    await context.route("**/api/resumeMatch", (route) => {
      resumes += 1;
      return route.fulfill({
        status: 200,
        headers: apiHeaders,
        contentType: "application/json",
        body: JSON.stringify(finished),
      });
    });
    await authenticateForContinuation(page);
    await setResponse(page, response);
    await routeToMatch(page, response.match.id);

    await expect(
      page.getByTestId("legend-unavailable-simulation"),
    ).toBeVisible();
    await expect.poll(() => resumes).toBe(1);
    await expect(page.getByTestId("match-result-screen")).toBeVisible({
      timeout: 5_000,
    });
  });

  for (const status of ["SUBSTITUTED", "INJURED", "EXPELLED"] as const) {
    test(`${status} stays non-interactive through refresh and reaches full-time`, async ({
      context,
      page,
    }) => {
      const response = unavailableFulltime(status);
      if (status === "SUBSTITUTED") {
        delete response.match.player_participation;
      }
      const snapshot = snapshotFromResponse(response);
      await context.route(`**/api/match/${response.match.id}`, (route) =>
        route.fulfill({
          status: 200,
          headers: apiHeaders,
          contentType: "application/json",
          body: JSON.stringify(snapshot),
        }),
      );
      await authenticateForContinuation(page);
      await setResponse(page, response);
      await routeToMatch(page, response.match.id);
      await expect(
        page.getByTestId("legend-unavailable-simulation"),
      ).toContainText(status.toLowerCase());
      await expect(page.getByRole("button", { name: "Low" })).toHaveCount(0);

      await page.reload();
      await expect(
        page.getByTestId("legend-unavailable-simulation"),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Low" })).toHaveCount(0);
      await expect(page.getByTestId("match-result-screen")).toBeVisible({
        timeout: 5_000,
      });
    });
  }
});

test.describe("administrative results", () => {
  const cases = [
    {
      side: "MY_TEAM",
      disposition: "ADMINISTRATIVE_0_3",
      noContest: false,
      score: { my_team: 0, opponent_team: 3 },
      result: "LOSS",
      points: -1,
      copy: "Administrative 0-3 (your team)",
      pointsCopy: "-1 season points",
    },
    {
      side: "OPPONENT_TEAM",
      disposition: "RESULT_PRESERVED_WORSE",
      noContest: false,
      score: { my_team: 5, opponent_team: 1 },
      result: "WIN",
      points: 3,
      copy: "Existing worse result preserved (the opponent)",
      pointsCopy: "+3 season points",
    },
    {
      side: "BOTH",
      disposition: "ABANDONED_NO_CONTEST",
      noContest: true,
      score: { my_team: 2, opponent_team: 4 },
      result: "NO_CONTEST",
      points: null,
      copy: "Abandoned with no contest (both teams)",
      pointsCopy: "No season points awarded",
    },
  ] as const;

  for (const adminCase of cases) {
    test(`shows ${adminCase.side} without administrative controls`, async ({
      context,
      page,
    }) => {
      const snapshot = structuredClone(
        fulltimeSnapshot,
      ) as BackendMatchSnapshot;
      if (!snapshot.full_time_handoff)
        throw new Error("missing full-time fixture");
      const administrativeResult = {
        version: 1 as const,
        responsible_side: adminCase.side,
        minute: 72,
        score_before: { my_team: 1, opponent_team: 1 },
        score_after: { ...adminCase.score },
        disposition: adminCase.disposition,
        no_contest: adminCase.noContest,
      };
      snapshot.match.my_team_score = adminCase.score.my_team;
      snapshot.match.opponent_team_score = adminCase.score.opponent_team;
      snapshot.full_time_handoff.status = "ABANDONED";
      snapshot.full_time_handoff.terminal_reason = "ADMINISTRATIVE";
      snapshot.full_time_handoff.final_score = administrativeResult.score_after;
      snapshot.full_time_handoff.result = adminCase.result;
      snapshot.full_time_handoff.season_points_delta = adminCase.points;
      snapshot.full_time_handoff.administrative_result = administrativeResult;
      snapshot.full_time_handoff.legend_contribution.administrative_result =
        administrativeResult;

      await context.route(`**/api/match/${snapshot.match.id}`, (route) =>
        route.fulfill({
          status: 200,
          headers: apiHeaders,
          contentType: "application/json",
          body: JSON.stringify(snapshot),
        }),
      );
      await authenticateForContinuation(page);
      await page.goto(`/match-result/${snapshot.match.id}`);
      await expect(page.getByTestId("administrative-result")).toContainText(
        adminCase.copy,
      );
      await expect(page.getByTestId("match-result-screen")).toContainText(
        adminCase.pointsCopy,
      );
      await expect(
        page.getByRole("button", { name: /administrative|abandon/i }),
      ).toHaveCount(0);
      if (adminCase.side === "MY_TEAM") {
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page).toHaveURL("/");
        await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(
          0,
        );
        await expect
          .poll(() =>
            page.evaluate(() => {
              const bridge = globalThis as typeof globalThis & {
                __OVERGOAL_E2E_READ_MATCH_SESSION__?: () => {
                  matchId: string | null;
                  phase: string;
                };
              };
              return bridge.__OVERGOAL_E2E_READ_MATCH_SESSION__?.();
            }),
          )
          .toEqual({
            diagnostic: null,
            matchId: null,
            pendingCommand: null,
            phase: "idle",
            revision: null,
          });
      }
    });
  }
});
