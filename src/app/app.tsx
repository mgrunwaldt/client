import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";

// Import layout components
import { useAuthSessionStore } from "../auth/session-store";
import { AuthenticatedLayout } from "../components/layout/AuthenticatedLayout";
import MatchTransitionLoader from "../match/MatchTransitionLoader";
import { useMatchSessionStore } from "../match/session-store";
// Import all routes
import {
  calendar,
  career,
  claim,
  connectionTest,
  login,
  main,
  market,
  match,
  matchResult,
  postLoginScreen,
  preMatch,
  preMatchNonMatch,
  profile,
  season,
  seasonClub,
  seasonCountdown,
  seasons,
  settings,
  tournamentAll,
  tournamentCurrent,
} from "../routes";
const GameScene = lazy(() => import("./(game)/GameScene"));
const LoginScreen = lazy(() => import("./(login)/Login/LoginScreen"));
const CalendarScreen = lazy(() => import("./(main)/calendar/CalendarScreen"));
const CareerScreen = lazy(() => import("./(main)/Career/CareerScreen"));
const ClaimScreen = lazy(() => import("./(main)/claim/ClaimScreen"));
const ConnectionTestScreen = lazy(
  () => import("./(main)/connection-test/ConnectionTestScreen"),
);
const SeasonCountdownScreen = lazy(
  () => import("./(main)/countdown/SeasonCountdownScreen"),
);
const HomePage = lazy(() => import("./(main)/Home/HomePage"));
const MarketScreen = lazy(() => import("./(main)/Market/MarketScreen"));
const MatchScreen = lazy(() => import("./(main)/Match/MatchScreen"));
const MatchResultScreen = lazy(
  () => import("./(main)/Match-Result/MatchResultScreen"),
);
const PostLoginScreen = lazy(() => import("./(main)/post-login"));
const PreMatchScreen = lazy(() => import("./(main)/Pre-Match/pre-match"));
const PreNonMatchScreen = lazy(
  () => import("./(main)/Pre-Match/PreMatchScreenNonMatch"),
);
const ProfileScreen = lazy(() => import("./(main)/Profile/ProfileScreen"));
const SeasonScreen = lazy(() => import("./(main)/Season/SeasonScreen"));
const SeasonClubScreen = lazy(
  () => import("./(main)/Season-Club/SeasonClubScreen"),
);
const SeasonsScreen = lazy(() => import("./(main)/Seasons/SeasonsScreen"));
const SettingsScreen = lazy(() => import("./(main)/settings/settingScreent"));
const TournamentScreen = lazy(
  () => import("./(main)/Tournament/TournamentScreen"),
);
const TournamentsScreen = lazy(
  () => import("./(main)/Tournaments/TournamentsScreen"),
);

function RouteLoadingSurface() {
  return (
    <div
      role="status"
      aria-label="Loading Overgoal"
      aria-live="polite"
      className="fixed inset-0 z-[190] flex min-h-dvh items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_22%,rgba(34,211,238,0.14),transparent_30%),linear-gradient(180deg,#061124_0%,#020816_100%)] px-6 text-white"
    >
      <div className="w-full max-w-xs rounded-3xl border border-cyan-300/30 bg-slate-950/70 px-8 py-9 text-center shadow-[0_0_48px_rgba(34,211,238,0.12)]">
        <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
        <p className="text-xs font-bold tracking-[0.34em] text-cyan-200 uppercase">
          Loading Overgoal
        </p>
        <p className="mt-3 text-sm text-cyan-50/65">
          Preparing the next screen
        </p>
      </div>
    </div>
  );
}

function PersistentGameSceneHost() {
  const location = useLocation();
  const pathname = location.pathname;
  const hasRenderableField = useMatchSessionStore((state) =>
    Boolean(state.pendingAction?.field_state ?? state.fieldState),
  );
  const authStatus = useAuthSessionStore((state) => state.status);
  const shouldMount =
    (pathname === "/game" && authStatus === "authenticated") ||
    (hasRenderableField &&
      (pathname.startsWith("/match/") || pathname.startsWith("/pre-match/")));

  if (!shouldMount) {
    return null;
  }

  return (
    <Suspense fallback={<RouteLoadingSurface />}>
      <GameScene active={pathname === "/game"} />
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <MatchTransitionLoader />
      <PersistentGameSceneHost />
      <Suspense fallback={<RouteLoadingSurface />}>
        <Routes>
          {/* Unauthenticated routes */}
          <Route path={login} element={<LoginScreen />} />
          <Route path={claim} element={<ClaimScreen />} />
          <Route path={postLoginScreen} element={<PostLoginScreen />} />

          {/* All authenticated routes under AuthenticatedLayout */}
          <Route element={<AuthenticatedLayout />}>
            <Route
              path={"/game"}
              element={<div className="h-dvh w-full bg-black" />}
            />
            <Route path={main} element={<HomePage />} />
            <Route path={preMatchNonMatch} element={<PreNonMatchScreen />} />
            <Route path={preMatch} element={<PreMatchScreen />} />
            <Route path={match} element={<MatchScreen />} />
            <Route path={matchResult} element={<MatchResultScreen />} />
            <Route path={market} element={<MarketScreen />} />
            <Route path={career} element={<CareerScreen />} />
            <Route path={seasons} element={<SeasonsScreen />} />
            <Route path={seasonCountdown} element={<SeasonCountdownScreen />} />
            <Route path={season} element={<SeasonScreen />} />
            <Route path={seasonClub} element={<SeasonClubScreen />} />
            <Route path={tournamentAll} element={<TournamentsScreen />} />
            <Route path={tournamentCurrent} element={<TournamentScreen />} />
            <Route path={profile} element={<ProfileScreen />} />
            <Route path={connectionTest} element={<ConnectionTestScreen />} />
            <Route path={settings} element={<SettingsScreen />} />
            <Route path={calendar} element={<CalendarScreen />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
