import { useNavigate } from "react-router";

import { BackButton } from "../../../components/ui/back-button";
import { Button } from "../../../components/ui/button";
import { useStarknetConnect } from "../../../dojo/hooks/useStarknetConnect";

export default function SettingsScreen() {
  const { handleDisconnect } = useStarknetConnect();
  const navigate = useNavigate();

  const onDisconnect = async () => {
    await handleDisconnect();
    navigate("/login");
  };
  return (
    <div className="flex h-dvh w-screen flex-col items-start justify-start gap-10 bg-[url('/backgrounds/glitch-bg.webp')] bg-cover bg-center px-4">
      <BackButton to="/" className="absolute left-0 top-5" />
      <div className="bg-overgoal-dark-blue/90 mt-24 flex w-full flex-row items-center justify-between gap-4">
        <div className="bg-overgoal-blue relative h-10 w-3"></div>
        <span className="font-orbitron mr-auto text-base font-bold uppercase text-white">
          profile
        </span>
        <div className="bg-overgoal-blue relative h-10 w-3"></div>
      </div>

      <div className="flex w-full items-center justify-center">
        <Button
          onClick={() => void onDisconnect()}
          variant="outline"
          className="bg-overgoal-dark-blue/90 text-white"
        >
          <span className="font-orbitron text-base font-bold uppercase text-white">
            Disconnect
          </span>
        </Button>
      </div>
    </div>
  );
}
