import { Routes, Route, BrowserRouter, useLocation } from "react-router";

// Import layout components
import { AuthenticatedLayout } from "../components/layout/AuthenticatedLayout";

// Import existing page components
import HomePage from "./(main)/Home/HomePage";
import LoginScreen from "./(login)/Login/LoginScreen";
import MatchResultScreen from "./(main)/Match-Result/MatchResultScreen";
import MatchScreen from "./(main)/Match/MatchScreen";
import PreNonMatchScreen from "./(main)/Pre-Match/PreMatchScreenNonMatch";
import PreMatchScreen from "./(main)/Pre-Match/pre-match";

// import HomeScreen from "./routes/Home";
import MarketScreen from "./(main)/Market/MarketScreen";
import CareerScreen from "./(main)/Career/CareerScreen";
import SeasonsScreen from "./(main)/Seasons/SeasonsScreen";
import SeasonScreen from "./(main)/Season/SeasonScreen";
import SeasonClubScreen from "./(main)/Season-Club/SeasonClubScreen";
import TournamentsScreen from "./(main)/Tournaments/TournamentsScreen";
import TournamentScreen from "./(main)/Tournament/TournamentScreen";
import ProfileScreen from "./(main)/Profile/ProfileScreen";
import SettingsScreen from "./(main)/settings/settingScreent";
import ConnectionTestScreen from "./(main)/connection-test/ConnectionTestScreen";
import CalendarScreen from "./(main)/calendar/CalendarScreen";
import ClaimScreen from "./(main)/claim/ClaimScreen";
import SeasonCountdownScreen from "./(main)/countdown/SeasonCountdownScreen";
import PostLoginScreen from "./(main)/post-login";

// Import all routes
import {
  main,
  market,
  career,
  seasons,
  season,
  seasonClub,
  tournamentAll,
  tournamentCurrent,
  profile,
  preMatch,
  match,
  matchResult,
  preMatchNonMatch,
  login,
  claim,
  settings,
  connectionTest,
  calendar,
  seasonCountdown,
  postLoginScreen,
} from "../routes";
import GameScene from "./(game)/GameScene";
import MatchTransitionLoader from "../match/MatchTransitionLoader";

function PersistentGameSceneHost() {
  const location = useLocation();
  const pathname = location.pathname;
  const shouldMount =
    pathname === "/game" ||
    pathname.startsWith("/match/") ||
    pathname.startsWith("/pre-match/");

  if (!shouldMount) {
    return null;
  }

  return <GameScene active={pathname === "/game"} />;
}

function App() {
  return (
    <BrowserRouter>
      <MatchTransitionLoader />
      <PersistentGameSceneHost />
      <Routes>
        {/* Unauthenticated routes */}
        <Route path={login} element={<LoginScreen />} />
        <Route path={claim} element={<ClaimScreen />} />
        <Route path={postLoginScreen} element={<PostLoginScreen />} />
        <Route path={"/game"} element={<div className="h-dvh w-full bg-black" />} />


        {/* All authenticated routes under AuthenticatedLayout */}
        <Route element={<AuthenticatedLayout />}>
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
    </BrowserRouter>
  );
}

export default App;
