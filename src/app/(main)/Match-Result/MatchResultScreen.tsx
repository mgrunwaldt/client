import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import LoadingScreen from "../../../components/loader/LoadingScreen";
import { Button } from "../../../components/ui/button";
import { fetchBackendMatch } from "../../../lib/backend-match";
import { hasAuthoritativeMatchIdentity } from "../../../match/authoritative-route-state";
import {
  beginHydration,
  createReconnectHydrationGate,
  isRetryableHydrationFailure,
  requestReconnectHydration,
  settleHydration,
} from "../../../match/reconnect-hydration";
import { useMatchSessionStore } from "../../../match/session-store";

function pointsLabel(points: number | null) {
  if (points === null) return "No season points awarded";
  return `${points >= 0 ? "+" : ""}${points} season points`;
}

const administrativeDisposition = {
  ADMINISTRATIVE_0_3: "Administrative 0-3",
  RESULT_PRESERVED_WORSE: "Existing worse result preserved",
  ABANDONED_NO_CONTEST: "Abandoned with no contest",
} as const;

const responsibleSide = {
  MY_TEAM: "your team",
  OPPONENT_TEAM: "the opponent",
  BOTH: "both teams",
} as const;

export default function MatchResultScreen() {
  const navigate = useNavigate();
  const { matchId } = useParams();
  const match = useMatchSessionStore((state) => state.match);
  const myTeam = useMatchSessionStore((state) => state.myTeam);
  const opponentTeam = useMatchSessionStore((state) => state.opponentTeam);
  const handoff = useMatchSessionStore((state) => state.fullTimeHandoff);
  const hydrateMatchSession = useMatchSessionStore(
    (state) => state.hydrateMatchSession,
  );
  const resetMatchSession = useMatchSessionStore(
    (state) => state.resetMatchSession,
  );
  const beginHydrationLoading = useMatchSessionStore(
    (state) => state.beginHydrationLoading,
  );
  const finishHydrationLoading = useMatchSessionStore(
    (state) => state.finishHydrationLoading,
  );
  const setError = useMatchSessionStore((state) => state.setError);
  const loading = useMatchSessionStore((state) => state.loading);
  const error = useMatchSessionStore((state) => state.error);
  const diagnostic = useMatchSessionStore((state) => state.diagnostic);
  const phase = useMatchSessionStore((state) => state.phase);
  const [reloadKey, setReloadKey] = useState(0);
  const hydrationGate = useRef(createReconnectHydrationGate());
  const hydrationRequestGeneration = useRef(0);
  const authoritativeIdentity = hasAuthoritativeMatchIdentity({
    routeMatchId: matchId,
    match,
    myTeam,
    opponentTeam,
  });
  const ready = Boolean(
    authoritativeIdentity && match?.match_status === "FINISHED" && handoff,
  );
  const returnToHome = () => {
    resetMatchSession();
    navigate("/", { replace: true });
  };

  useEffect(() => {
    if (!matchId || (ready && reloadKey === 0)) return;
    let cancelled = false;
    const requestGeneration = ++hydrationRequestGeneration.current;
    beginHydration(hydrationGate.current);
    setError(null);
    const loadingGeneration = beginHydrationLoading();
    const load = async () => {
      let succeeded = false;
      let retryableFailure = true;
      try {
        const response = await fetchBackendMatch(matchId);
        if (cancelled) return;
        hydrateMatchSession({
          match: response.match,
          myTeam: response.my_team,
          opponentTeam: response.opponent_team,
          timelineEvents: response.timeline,
          pendingAction: response.pending_action,
          unsupportedScene: response.unsupported_scene,
          legendAvailability: response.legend_availability,
          halftimeSummary: response.halftime_summary,
          fullTimeHandoff: response.full_time_handoff,
          latestOperation: response.latest_operation,
        });
        succeeded = true;
      } catch (reason) {
        retryableFailure = isRetryableHydrationFailure(reason);
        if (!cancelled) {
          setError(reason);
        }
      } finally {
        if (requestGeneration === hydrationRequestGeneration.current) {
          const retryQueuedReconnect = settleHydration(
            hydrationGate.current,
            succeeded,
            retryableFailure,
          );
          if (!cancelled && retryQueuedReconnect) {
            setReloadKey((value) => value + 1);
          }
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      finishHydrationLoading(loadingGeneration);
    };
  }, [
    beginHydrationLoading,
    finishHydrationLoading,
    hydrateMatchSession,
    matchId,
    ready,
    reloadKey,
    setError,
  ]);

  useEffect(() => {
    if (authoritativeIdentity && match && match.match_status !== "FINISHED") {
      navigate(`/match/${match.id}`, { replace: true });
    }
  }, [authoritativeIdentity, match, navigate]);

  useEffect(() => {
    const rehydrateAfterReconnect = () => {
      if (diagnostic?.recoveryAction === "STOP") return;
      if (requestReconnectHydration(hydrationGate.current)) {
        setReloadKey((value) => value + 1);
      }
    };
    window.addEventListener("online", rehydrateAfterReconnect);
    return () => window.removeEventListener("online", rehydrateAfterReconnect);
  }, [diagnostic?.recoveryAction]);

  if (error) {
    const recoveryAction = diagnostic?.recoveryAction;
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-[#020816] px-6 text-white">
        <section
          role="alert"
          className="w-full max-w-sm rounded-3xl border border-pink-300/45 bg-slate-950 p-7 text-center"
        >
          <p className="font-orbitron text-xs tracking-[0.28em] text-pink-200 uppercase">
            {recoveryAction === "REAUTHENTICATE"
              ? "Session expired"
              : "Result unavailable"}
          </p>
          <p className="mt-4 text-sm text-slate-200">{error}</p>
          {recoveryAction !== "STOP" && (
            <Button
              className="font-orbitron mt-6 w-full border border-cyan-300 bg-cyan-300/10 text-cyan-100 uppercase"
              onClick={() => {
                if (recoveryAction === "REAUTHENTICATE") {
                  navigate("/login");
                  return;
                }
                setError(null);
                setReloadKey((value) => value + 1);
              }}
            >
              {recoveryAction === "REAUTHENTICATE"
                ? "Sign in again"
                : recoveryAction === "CHECK_TRANSPORT"
                  ? "Check connection"
                  : "Retry result"}
            </Button>
          )}
          <Button
            variant="ghost"
            className="font-orbitron mt-3 min-h-11 w-full text-cyan-100 uppercase"
            onClick={returnToHome}
          >
            Back to home
          </Button>
        </section>
      </main>
    );
  }

  if (
    authoritativeIdentity &&
    match?.match_status === "FINISHED" &&
    handoff === null
  ) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-[#020816] px-6 text-white">
        <section
          data-testid="unsupported-final-result"
          role="alert"
          className="w-full max-w-sm rounded-3xl border border-amber-300/45 bg-slate-950 p-7 text-center"
        >
          <p className="font-orbitron text-xs tracking-[0.28em] text-amber-200 uppercase">
            Final handoff unsupported
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-200">
            This completed match does not include the authoritative final-result
            handoff required by this client.
          </p>
          <Button
            className="font-orbitron mt-6 w-full border border-cyan-300 bg-cyan-300/10 text-cyan-100 uppercase"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Retry result
          </Button>
        </section>
      </main>
    );
  }

  if (!ready || !match || !myTeam || !opponentTeam || !handoff) {
    return (
      <LoadingScreen
        isLoading={true}
        progress={56}
        title="Opening final whistle"
        detail="Restoring the authoritative final result"
        label="Loading match result"
      />
    );
  }

  const contribution = handoff.legend_contribution;
  const resultTone = {
    WIN: {
      accent: "#b8ff4d",
      glow: "rgba(184,255,77,0.34)",
      kicker: "Victory secured",
    },
    DRAW: {
      accent: "#56e7ff",
      glow: "rgba(86,231,255,0.3)",
      kicker: "Honours even",
    },
    LOSS: {
      accent: "#ff3d9a",
      glow: "rgba(255,61,154,0.3)",
      kicker: "Final whistle",
    },
    NO_CONTEST: {
      accent: "#ffd166",
      glow: "rgba(255,209,102,0.3)",
      kicker: "Match closed",
    },
  }[handoff.result];
  const highlights = handoff.key_events
    .filter(
      (event) => event.action !== "HALFTIME" && event.action !== "MATCH_END",
    )
    .slice(-3);
  const teamCrest = (teamName: string) =>
    teamName.toLowerCase().includes("dojo")
      ? "/teams/dojoUnited.webp"
      : "/teams/Cartridge City.webp";
  return (
    <main
      data-testid="match-result-screen"
      data-session-phase={phase}
      data-session-loading={loading}
      className="overgoal-safe-screen relative h-dvh overflow-hidden bg-[#020816] text-white [--overgoal-safe-bottom-min:1.5rem] [--overgoal-safe-inline-min:1rem] [--overgoal-safe-top-min:1.5rem]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[url('/backgrounds/glitch-bg.webp')] bg-cover bg-center opacity-75" />
      <div
        className="pointer-events-none absolute -top-36 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: resultTone.glow }}
      />
      <section className="relative mx-auto flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-[2.4rem] border border-cyan-300/40 bg-[linear-gradient(155deg,rgba(2,18,40,0.97),rgba(2,3,20,0.98)_60%,rgba(22,3,35,0.98))] shadow-[0_0_48px_rgba(34,211,238,0.16)]">
        <div className="relative px-5 pt-8 pb-6 text-center">
          <p className="font-orbitron text-[10px] font-black tracking-[0.34em] text-cyan-200 uppercase">
            {resultTone.kicker}
          </p>
          <h1
            className="font-orbitron mt-2 text-5xl font-black uppercase italic drop-shadow-[0_0_18px_currentColor]"
            style={{ color: resultTone.accent }}
          >
            {handoff.result === "NO_CONTEST" ? "No contest" : handoff.result}
          </h1>

          <div className="mt-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="min-w-0">
              <img
                src={teamCrest(myTeam.name)}
                alt=""
                className="mx-auto h-16 w-16 object-contain drop-shadow-[0_0_16px_rgba(114,247,0,0.24)]"
              />
              <p className="font-orbitron mt-2 truncate text-[10px] font-bold tracking-[0.12em] text-lime-300 uppercase">
                {myTeam.name}
              </p>
            </div>
            <div className="font-orbitron flex items-center gap-3 text-5xl font-black text-white">
              <span>{handoff.final_score.my_team}</span>
              <span className="text-2xl text-cyan-200/65">:</span>
              <span>{handoff.final_score.opponent_team}</span>
            </div>
            <div className="min-w-0">
              <img
                src={teamCrest(opponentTeam.name)}
                alt=""
                className="mx-auto h-16 w-16 object-contain drop-shadow-[0_0_16px_rgba(234,36,112,0.24)]"
              />
              <p className="font-orbitron mt-2 truncate text-[10px] font-bold tracking-[0.12em] text-pink-400 uppercase">
                {opponentTeam.name}
              </p>
            </div>
          </div>

          <div className="font-orbitron mx-auto mt-5 inline-flex rounded-full border border-lime-300/35 bg-lime-300/10 px-4 py-2 text-xs font-black tracking-[0.16em] text-lime-200 uppercase">
            {pointsLabel(handoff.season_points_delta)}
          </div>
        </div>

        <div className="mx-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-cyan-300/25 bg-black/30">
          {[
            ["Goals", contribution.goals],
            ["Assists", contribution.assists],
            ["Won", contribution.successful_actions],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={`px-2 py-4 text-center ${index > 0 ? "border-l border-cyan-300/15" : ""}`}
            >
              <strong className="font-orbitron block text-2xl text-white">
                {value}
              </strong>
              <span className="mt-1 block text-[9px] font-black tracking-[0.2em] text-cyan-200/70 uppercase">
                {label}
              </span>
            </div>
          ))}
        </div>

        {highlights.length > 0 && (
          <div className="mx-4 mt-5">
            <p className="font-orbitron mb-3 text-[10px] font-black tracking-[0.28em] text-cyan-200 uppercase">
              Match flashes
            </p>
            <ul className="space-y-2">
              {highlights.map((event) => (
                <li
                  key={`${event.event_id}-${event.minute}`}
                  className="flex items-center gap-3 rounded-xl border border-cyan-300/15 bg-cyan-300/5 px-3 py-2.5"
                >
                  <span className="font-orbitron min-w-10 text-sm font-black text-lime-200">
                    {event.minute}&apos;
                  </span>
                  <span className="line-clamp-2 text-xs leading-4 text-cyan-50/85">
                    {event.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {handoff.administrative_result && (
          <div
            data-testid="administrative-result"
            className="mx-4 mt-5 rounded-xl border border-amber-300/35 bg-amber-300/10 p-4 text-sm text-amber-100"
          >
            Administrative outcome:{" "}
            {
              administrativeDisposition[
                handoff.administrative_result.disposition
              ]
            }{" "}
            ({responsibleSide[handoff.administrative_result.responsible_side]})
          </div>
        )}

        <Button
          className="font-orbitron mx-4 mt-auto mb-5 min-h-14 w-auto border border-cyan-200 bg-[linear-gradient(90deg,rgba(0,228,232,0.22),rgba(148,0,255,0.22))] tracking-[0.22em] text-cyan-50 uppercase shadow-[0_0_24px_rgba(0,228,232,0.18)]"
          onClick={returnToHome}
        >
          Continue
        </Button>
      </section>
    </main>
  );
}
