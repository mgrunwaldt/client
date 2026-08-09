import { useNavigate } from "react-router";

import { BackButton } from "../../../components/ui/back-button";
import { Button } from "../../../components/ui/button";
import { useStarknetConnect } from "../../../dojo/hooks/useStarknetConnect";
import { setGameFeedbackPreferences } from "../../../platform/game-feedback";
import { useGameFeedbackPreferences } from "../../../platform/use-game-feedback";

export default function SettingsScreen() {
  const { handleDisconnect } = useStarknetConnect();
  const navigate = useNavigate();
  const feedback = useGameFeedbackPreferences();

  const onDisconnect = async () => {
    await handleDisconnect();
    navigate("/login");
  };
  return (
    <div className="flex min-h-dvh w-screen flex-col items-start justify-start gap-8 overflow-y-auto bg-[url('/backgrounds/glitch-bg.webp')] bg-cover bg-center px-4 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <BackButton
        to="/"
        className="absolute top-[calc(env(safe-area-inset-top)+1.25rem)] left-0"
      />
      <div className="bg-overgoal-dark-blue/90 mt-24 flex w-full flex-row items-center justify-between gap-4 border-y border-cyan-300/25">
        <div className="bg-overgoal-blue relative h-10 w-3"></div>
        <span className="font-orbitron mr-auto text-base font-bold text-white uppercase">
          settings
        </span>
        <div className="bg-overgoal-blue relative h-10 w-3"></div>
      </div>

      <section className="bg-overgoal-dark-blue/90 w-full border border-cyan-300/30 p-5 text-white shadow-[0_0_28px_rgba(0,228,232,0.08)]">
        <h1 className="font-orbitron text-sm font-bold tracking-[0.2em] text-cyan-200 uppercase">
          Match feedback
        </h1>
        <label className="mt-6 flex min-h-12 items-center justify-between gap-4">
          <span className="font-orbitron text-sm uppercase">Sound</span>
          <input
            type="checkbox"
            checked={!feedback.muted}
            onChange={(event) => {
              setGameFeedbackPreferences({ muted: !event.target.checked });
            }}
            className="h-6 w-6 accent-cyan-300"
          />
        </label>
        <label className="mt-4 block">
          <span className="font-orbitron flex justify-between text-xs tracking-[0.16em] uppercase">
            <span>Volume</span>
            <span>{Math.round(feedback.volume * 100)}%</span>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={feedback.volume}
            disabled={feedback.muted}
            onChange={(event) => {
              setGameFeedbackPreferences({
                volume: Number(event.target.value),
              });
            }}
            className="mt-3 h-12 w-full accent-cyan-300 disabled:opacity-40"
          />
        </label>
        <label className="mt-3 flex min-h-12 items-center justify-between gap-4">
          <span className="font-orbitron text-sm uppercase">Haptics</span>
          <input
            type="checkbox"
            checked={feedback.haptics}
            onChange={(event) => {
              setGameFeedbackPreferences({ haptics: event.target.checked });
            }}
            className="h-6 w-6 accent-cyan-300"
          />
        </label>
      </section>

      <div className="flex w-full items-center justify-center">
        <Button
          onClick={() => void onDisconnect()}
          variant="outline"
          className="bg-overgoal-dark-blue/90 text-white"
        >
          <span className="font-orbitron text-base font-bold text-white uppercase">
            Disconnect
          </span>
        </Button>
      </div>
    </div>
  );
}
