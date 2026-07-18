import { useEffect, useMemo, useState } from "react";

import LoadingScreen from "../../../components/loader/LoadingScreen";
import Scene from "../../../components/webgl/Scene";
// import { useNavigate } from "react-router";
// import { useStarknetConnect } from "../../../dojo/hooks/useStarknetConnect";
// import useAppStore from "../../../zustand/store";
import HomeMenu from "./components/menu";

export default function HomePage() {
  // const navigate = useNavigate();
  // const { player } = usePlayer();
  // const { handleDisconnect } = useStarknetConnect();
  // const resetStore = useAppStore((state) => state.resetStore);

  const [isLoading, setIsLoading] = useState(true);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const loadingProgress = sceneLoaded ? 100 : 0;

  // Track when all assets are loaded
  useEffect(() => {
    if (!sceneLoaded) return;

    // Add a small delay before hiding the loader for smooth transition.
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [sceneLoaded]);

  const handleSceneLoadComplete = () => {
    setSceneLoaded(true);
  };

  // Memoize static styles to prevent re-creation
  const containerStyles = useMemo(
    () => ({
      touchAction: "none" as const,
    }),
    [],
  );

  return (
    <div className="relative h-dvh w-full" style={containerStyles}>
      {/* Loading Screen Overlay */}
      <LoadingScreen isLoading={isLoading} progress={loadingProgress} />

      {/* 3D Scene Layer - positioned behind UI */}
      <div className="pointer-events-auto absolute inset-0 z-20">
        <Scene onLoadComplete={handleSceneLoadComplete} />
      </div>

      {/* UI Overlay Layer - positioned on top */}
      <div className="relative z-30 h-dvh">
        <div className="flex h-full flex-col pb-6">
          <HomeMenu />
        </div>
      </div>
    </div>
  );
}
