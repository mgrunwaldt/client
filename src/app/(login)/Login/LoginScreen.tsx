import { GlitchText } from "../../../components/ui/glitch-text";
import { LoginPlayer } from "./components/login-player";

export default function LoginScreen() {
  return (
    <div
      data-testid="login-screen"
      className="overgoal-safe-screen flex h-dvh w-screen flex-col items-center justify-center gap-24 bg-[url('/login/background.webp')] bg-cover bg-center [--overgoal-safe-bottom-min:1.5rem] [--overgoal-safe-inline-min:3rem] [--overgoal-safe-top-min:1.5rem]"
    >
      <div className="flex flex-col items-center justify-center">
        <img src="/logo.png" alt="Overgoal" className="h-42 w-42" />
        <GlitchText className="text-5xl" text="Overgoal" />
      </div>

      <div className="w-full max-w-md">
        <LoginPlayer />
      </div>
    </div>
  );
}
