import { expect, type Page, test } from "@playwright/test";

import type {
  BackendLegendStatus,
  BackendMatchResponse,
  BackendMatchSnapshot,
} from "../src/match/api-v1/contract";
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

async function setResponse(page: Page, response: unknown) {
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
    { value: response, ...teams },
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

test("continues the authoritative second half once at minute 46", async ({
  context,
  page,
}) => {
  let resumes = 0;
  let releaseResume!: () => void;
  const resumeGate = new Promise<void>((resolve) => {
    releaseResume = resolve;
  });
  await context.route("**/api/resumeMatch", async (route) => {
    resumes += 1;
    await resumeGate;
    return route.fulfill({
      status: 200,
      headers: apiHeaders,
      contentType: "application/json",
      body: JSON.stringify(resumedSecondHalf()),
    });
  });
  await authenticateForContinuation(page);
  await setResponse(page, halftimeResponse);
  await routeToMatch(page, halftimeResponse.match.id);
  const continueButton = page.getByTestId("continue-second-half");
  await continueButton.focus();
  await expect(continueButton).toBeFocused();
  const requestStarted = page.waitForRequest("**/api/resumeMatch");
  const click = continueButton.click();
  await requestStarted;
  await expect(continueButton).toBeDisabled();
  releaseResume();
  await click;

  await expect.poll(() => resumes).toBe(1);
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-session-phase",
    "timeline_playback",
  );
  await expect(page.getByTestId("timeline-screen")).toHaveAttribute(
    "data-playback-minute",
    "46",
    { timeout: 3_000 },
  );
  await expect(page.getByTestId("halftime-panel")).toHaveCount(0);
  await expect(page.getByText("Tactical")).toHaveCount(0);
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
  await expect(page.getByTestId("halftime-panel")).toContainText(
    "Halftime 45'",
  );
  await expect(page.getByTestId("halftime-panel")).toContainText(
    "Recovery: 48 to 62 (+14)",
  );
  await expect(page.getByText("Tactical")).toHaveCount(0);

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
  await expect(page.getByTestId("match-result-screen")).toContainText("2 - 1");
  await expect(page.getByTestId("match-result-screen")).toContainText(
    "+3 season points",
  );
  await expect(page.getByTestId("match-result-screen")).toContainText(
    "PENDING_HANDOFF",
  );
  await expect(page.getByText(/abandon/i)).toHaveCount(0);
});

test.describe("Legend-unavailable simulation", () => {
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
        await page.getByRole("button", { name: "Back to home" }).click();
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
