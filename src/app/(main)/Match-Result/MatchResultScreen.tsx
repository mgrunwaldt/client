import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import LoadingScreen from "../../../components/loader/LoadingScreen";
import { Button } from "../../../components/ui/button";
import { fetchBackendMatch } from "../../../lib/backend-match";
import { hasAuthoritativeMatchIdentity } from "../../../match/authoritative-route-state";
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
  const setLoading = useMatchSessionStore((state) => state.setLoading);
  const setError = useMatchSessionStore((state) => state.setError);
  const error = useMatchSessionStore((state) => state.error);
  const [reloadKey, setReloadKey] = useState(0);
  const authoritativeIdentity = hasAuthoritativeMatchIdentity({
    routeMatchId: matchId,
    match,
    myTeam,
    opponentTeam,
  });
  const ready = Boolean(
    authoritativeIdentity && match?.match_status === "FINISHED" && handoff,
  );

  useEffect(() => {
    if (!matchId || ready) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
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
        });
      } catch (reason) {
        if (!cancelled) {
          setError(reason);
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [hydrateMatchSession, matchId, ready, reloadKey, setError, setLoading]);

  useEffect(() => {
    if (authoritativeIdentity && match && match.match_status !== "FINISHED") {
      navigate(`/match/${match.id}`, { replace: true });
    }
  }, [authoritativeIdentity, match, navigate]);

  if (error) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-[#020816] px-6 text-white">
        <section
          role="alert"
          className="w-full max-w-sm rounded-3xl border border-pink-300/45 bg-slate-950 p-7 text-center"
        >
          <p className="font-orbitron text-xs tracking-[0.28em] text-pink-200 uppercase">
            Result unavailable
          </p>
          <p className="mt-4 text-sm text-slate-200">{error}</p>
          <Button
            className="font-orbitron mt-6 w-full border border-cyan-300 bg-cyan-300/10 text-cyan-100 uppercase"
            onClick={() => {
              setError(null);
              setReloadKey((value) => value + 1);
            }}
          >
            Retry result
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
  return (
    <main
      data-testid="match-result-screen"
      className="min-h-dvh bg-[url('/backgrounds/glitch-bg.webp')] bg-cover bg-center px-4 py-8 text-white"
    >
      <section className="mx-auto w-full max-w-lg rounded-[2rem] border border-cyan-300/45 bg-slate-950/90 p-6 shadow-[0_0_44px_rgba(34,211,238,0.15)]">
        <p className="font-orbitron text-center text-xs font-bold tracking-[0.34em] text-cyan-300 uppercase">
          Full time
        </p>
        <h1 className="font-orbitron mt-3 text-center text-3xl font-black text-white uppercase">
          {handoff.result}
        </h1>
        <p className="font-orbitron mt-4 text-center text-4xl text-cyan-100">
          {handoff.final_score.my_team} - {handoff.final_score.opponent_team}
        </p>
        <p className="mt-3 text-center text-sm text-slate-300">
          {myTeam.name} vs {opponentTeam.name}
        </p>
        <p className="font-orbitron mt-5 text-center text-xs tracking-[0.18em] text-lime-200 uppercase">
          {pointsLabel(handoff.season_points_delta)}
        </p>

        <div className="mt-7 border-t border-cyan-300/20 pt-5">
          <h2 className="font-orbitron text-sm tracking-[0.2em] text-cyan-200 uppercase">
            Legend contribution
          </h2>
          <p className="mt-3 text-sm text-slate-200">
            {contribution.minutes_played}&apos; played ·{" "}
            {contribution.interventions} interventions ·{" "}
            {contribution.successful_actions} successful actions
          </p>
          <p className="mt-2 text-sm text-slate-200">
            {contribution.goals} goals · {contribution.assists} assists
          </p>
        </div>

        <div className="mt-6 border-t border-cyan-300/20 pt-5">
          <h2 className="font-orbitron text-sm tracking-[0.2em] text-cyan-200 uppercase">
            Key events
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            {handoff.key_events.map((event) => (
              <li key={`${event.event_id}-${event.minute}`}>
                {event.minute}&apos; · {event.description}
              </li>
            ))}
          </ul>
        </div>

        {handoff.administrative_result && (
          <div
            data-testid="administrative-result"
            className="mt-6 rounded-xl border border-amber-300/35 bg-amber-300/10 p-4 text-sm text-amber-100"
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

        <div className="mt-6 border-t border-cyan-300/20 pt-5 text-sm text-slate-200">
          <p className="font-orbitron text-xs tracking-[0.18em] text-cyan-200 uppercase">
            Settlement handoff
          </p>
          <p className="mt-2">
            {handoff.pending_settlement_events.length} pending event
            {handoff.pending_settlement_events.length === 1 ? "" : "s"} ·{" "}
            {handoff.settlement_status}
          </p>
        </div>
        <Button
          className="font-orbitron mt-7 min-h-12 w-full border border-cyan-300 bg-cyan-300/10 tracking-[0.2em] text-cyan-100 uppercase"
          onClick={() => navigate("/")}
        >
          Back to home
        </Button>
      </section>
    </main>
  );
}
