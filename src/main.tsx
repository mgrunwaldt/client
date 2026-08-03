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

interface BootstrapSurfaceProps {
  error?: string;
  onRetry?: () => void;
}

export function BootstrapSurface({ error, onRetry }: BootstrapSurfaceProps) {
  return (
    <main className="fixed inset-0 flex min-h-dvh items-center justify-center overflow-hidden bg-[#020816] px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(0,228,232,0.17),transparent_34%),linear-gradient(180deg,#06152b_0%,#020816_100%)]" />
      <div className="bg-linear-to-b via-cyan-300/28 absolute inset-y-[8%] left-[7%] w-px from-cyan-300/0 to-cyan-300/0" />
      <div className="bg-linear-to-b via-cyan-300/28 absolute inset-y-[8%] right-[7%] w-px from-cyan-300/0 to-cyan-300/0" />
      <section
        role={error ? "alert" : "status"}
        aria-live="polite"
        className="bg-slate-950/76 relative w-full max-w-sm rounded-[2rem] border border-cyan-300/30 px-7 py-9 text-center shadow-[0_0_52px_rgba(0,228,232,0.14)]"
      >
        <p className="font-orbitron text-xs font-bold uppercase tracking-[0.42em] text-cyan-300">
          Overgoal
        </p>
        <h1 className="airstrike-normal mt-5 text-5xl uppercase leading-none text-white">
          {error ? "Connection paused" : "Entering the arena"}
        </h1>
        {error ? (
          <>
            <p className="text-cyan-50/72 mt-5 text-sm leading-relaxed">
              {error}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="font-orbitron mt-7 min-h-12 w-full border border-cyan-300 bg-cyan-300/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.2em] text-cyan-100 shadow-[0_0_20px_rgba(0,228,232,0.12)]"
            >
              Retry connection
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto mt-7 h-11 w-11 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
            <p className="text-cyan-50/66 mt-5 text-sm">
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
