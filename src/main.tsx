import "./styles/globals.css";

// Dojo & Starknet
import { init } from "@dojoengine/sdk";
import { DojoSdkProvider } from "@dojoengine/sdk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// App Entry
import App from "./app/app";
import type { SchemaType } from "./dojo/bindings";
import { setupWorld } from "./dojo/contracts.gen";
import { dojoConfig } from "./dojo/dojoConfig";
import StarknetProvider from "./dojo/starknet-provider";

// Init Dojo with error handling
async function main() {
  try {
    console.log("🚀 Initializing Dojo SDK...");

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

    console.log("✅ Dojo SDK initialized successfully");

    const rootElement = document.getElementById("root");
    if (!rootElement) throw new Error("Root element not found");

    createRoot(rootElement).render(
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
    console.error("❌ Failed to initialize Dojo:", error);

    // Fallback: render without Dojo if it fails
    const rootElement = document.getElementById("root");
    if (rootElement) {
      createRoot(rootElement).render(
        <StrictMode>
          <div className="flex min-h-screen items-center justify-center bg-red-900">
            <div className="p-8 text-center text-white">
              <h1 className="mb-4 text-2xl font-bold">
                ⚠️ Dojo Initialization Error
              </h1>
              <p className="mb-4">Failed to connect to Dojo SDK</p>
              <details className="text-left">
                <summary className="mb-2 cursor-pointer">
                  Error Details:
                </summary>
                <pre className="overflow-auto rounded bg-black p-4 text-xs">
                  {error instanceof Error ? error.message : String(error)}
                </pre>
              </details>
              <p className="mt-4 text-sm opacity-70">
                Check your Dojo configuration and network connection
              </p>
            </div>
          </div>
        </StrictMode>,
      );
    }
  }
}

main();
