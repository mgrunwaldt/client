import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Scene from "../../../components/webgl/Scene";
import { useMatchSessionStore } from "../../../match/session-store";
// import { useNavigate } from "react-router";
// import { useStarknetConnect } from "../../../dojo/hooks/useStarknetConnect";
// import useAppStore from "../../../zustand/store";
import HomeMenu from "./components/menu";

interface HomeSceneBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
}

class HomeSceneBoundary extends Component<
  HomeSceneBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Home scene failed to render", error, info);
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function HomePage() {
  // const navigate = useNavigate();
  // const { player } = usePlayer();
  // const { handleDisconnect } = useStarknetConnect();
  // const resetStore = useAppStore((state) => state.resetStore);

  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [sceneError, setSceneError] = useState<Error | null>(null);
  const [sceneGeneration, setSceneGeneration] = useState(0);
  const terminalMatchId = useMatchSessionStore((state) =>
    state.match?.match_status === "FINISHED" ? state.match.id : null,
  );
  const resetMatchSession = useMatchSessionStore(
    (state) => state.resetMatchSession,
  );

  useEffect(() => {
    if (terminalMatchId) resetMatchSession();
  }, [resetMatchSession, terminalMatchId]);

  useEffect(() => {
    performance.mark("overgoal:main-interactive");
  }, []);

  const handleSceneLoadComplete = useCallback(() => {
    setSceneLoaded(true);
    setSceneError(null);
  }, []);

  const retryHomeScene = () => {
    setSceneLoaded(false);
    setSceneError(null);
    setSceneGeneration((generation) => generation + 1);
  };

  // Memoize static styles to prevent re-creation
  const containerStyles = useMemo(
    () => ({
      touchAction: "none" as const,
    }),
    [],
  );

  return (
    <div
      data-testid="home-screen"
      data-scene-status={
        sceneError ? "fallback" : sceneLoaded ? "ready" : "warming"
      }
      className="relative h-dvh w-full overflow-hidden bg-[radial-gradient(circle_at_50%_34%,rgba(0,228,232,0.16),transparent_30%),linear-gradient(180deg,#07182b_0%,#02050d_100%)]"
      style={containerStyles}
    >
      {/* 3D Scene Layer - positioned behind UI */}
      <div className="pointer-events-auto absolute inset-0 z-20">
        <HomeSceneBoundary key={sceneGeneration} onError={setSceneError}>
          <Scene
            key={sceneGeneration}
            onLoadComplete={handleSceneLoadComplete}
            onLoadError={setSceneError}
          />
        </HomeSceneBoundary>
      </div>

      {!sceneLoaded && !sceneError ? (
        <div
          role="status"
          aria-label="Warming up the home arena"
          className="pointer-events-none absolute top-[17%] left-1/2 z-25 -translate-x-1/2 rounded-full border border-cyan-300/24 bg-slate-950/52 px-4 py-2 text-[10px] font-bold tracking-[0.28em] text-cyan-100/72 uppercase backdrop-blur-sm"
        >
          Arena warming up
        </div>
      ) : null}

      {sceneError ? (
        <div
          role="alert"
          aria-label="Home arena fallback"
          className="absolute top-[17%] left-1/2 z-40 w-[min(86%,20rem)] -translate-x-1/2 rounded-2xl border border-cyan-300/24 bg-slate-950/72 px-4 py-3 text-center text-xs text-cyan-50/78 backdrop-blur-sm"
        >
          <p>The arena is off camera. Match controls are ready.</p>
          <button
            type="button"
            onClick={retryHomeScene}
            className="mt-2 min-h-11 rounded-full border border-cyan-300/45 px-4 py-2 font-bold tracking-[0.16em] text-cyan-100 uppercase"
          >
            Retry arena
          </button>
        </div>
      ) : null}

      {/* UI Overlay Layer - positioned on top */}
      <div className="overgoal-safe-screen relative z-30 h-dvh [--overgoal-safe-bottom-min:1.5rem]">
        <div className="flex h-full flex-col">
          <HomeMenu />
        </div>
      </div>
    </div>
  );
}
