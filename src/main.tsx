import "./styles/globals.css";

import { init } from "@dojoengine/sdk";
import { DojoSdkProvider } from "@dojoengine/sdk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./app/app";
import type { SchemaType } from "./dojo/bindings";
import { setupWorld } from "./dojo/contracts.gen";
import { dojoConfig } from "./dojo/dojoConfig";
import StarknetProvider from "./dojo/starknet-provider";
import { installGameFeedbackLifecycle } from "./platform/game-feedback";
import { registerOvergoalPwa } from "./platform/pwa";

interface BootstrapSurfaceProps {
  error?: string;
  onRetry?: () => void;
}

export function BootstrapSurface({ error, onRetry }: BootstrapSurfaceProps) {
  return (
    <main className="overgoal-safe-screen fixed inset-0 flex min-h-dvh items-center justify-center overflow-hidden bg-[#020816] text-white [--overgoal-safe-bottom-min:1.5rem] [--overgoal-safe-inline-min:1.5rem] [--overgoal-safe-top-min:1.5rem]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(0,228,232,0.17),transparent_34%),linear-gradient(180deg,#06152b_0%,#020816_100%)]" />
      <div className="absolute inset-y-[8%] left-[7%] w-px bg-linear-to-b from-cyan-300/0 via-cyan-300/28 to-cyan-300/0" />
      <div className="absolute inset-y-[8%] right-[7%] w-px bg-linear-to-b from-cyan-300/0 via-cyan-300/28 to-cyan-300/0" />
      <section
        role={error ? "alert" : "status"}
        aria-live="polite"
        className="relative w-full max-w-sm rounded-[2rem] border border-cyan-300/30 bg-slate-950/76 px-7 py-9 text-center shadow-[0_0_52px_rgba(0,228,232,0.14)]"
      >
        <p className="font-orbitron text-xs font-bold tracking-[0.42em] text-cyan-300 uppercase">
          Overgoal
        </p>
        <h1 className="airstrike-normal mt-5 text-5xl leading-none text-white uppercase">
          {error ? "Connection paused" : "Entering the arena"}
        </h1>
        {error ? (
          <>
            <p className="mt-5 text-sm leading-relaxed text-cyan-50/72">
              {error}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="font-orbitron mt-7 min-h-12 w-full border border-cyan-300 bg-cyan-300/10 px-5 py-3 text-sm font-bold tracking-[0.2em] text-cyan-100 uppercase shadow-[0_0_20px_rgba(0,228,232,0.12)]"
            >
              Retry connection
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto mt-7 h-11 w-11 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
            <p className="mt-5 text-sm text-cyan-50/66">
              Connecting your player profile
            </p>
          </>
        )}
      </section>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const root = createRoot(rootElement);
let initializing = false;

installGameFeedbackLifecycle();
void registerOvergoalPwa();

async function initializeApp() {
  if (initializing) return;
  initializing = true;
  root.render(<BootstrapSurface />);

  try {
    const sdk = await init<SchemaType>({
      client: {
        toriiUrl: dojoConfig.toriiUrl,
        worldAddress: dojoConfig.manifest.world.address,
      },
      domain: {
        name: "DojoGameStarter",
        version: "1.0",
        chainId: "KATANA",
        revision: "1",
      },
    });

    root.render(
      <StrictMode>
        <DojoSdkProvider
          sdk={sdk}
          dojoConfig={dojoConfig}
          clientFn={setupWorld}
        >
          <StarknetProvider>
            <App />
          </StarknetProvider>
        </DojoSdkProvider>
      </StrictMode>,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Overgoal could not initialize its player services.";
    root.render(
      <BootstrapSurface
        error={message}
        onRetry={() => {
          initializing = false;
          void initializeApp();
        }}
      />,
    );
    return;
  }

  initializing = false;
}

void initializeApp();
