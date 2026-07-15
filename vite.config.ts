import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import fs from "fs";
import path from "path";

function localHttpsConfig(env: Record<string, string>) {
  if (env.VITE_LOCAL_HTTPS !== "true") return undefined;

  const keyPath = path.resolve(env.VITE_HTTPS_KEY_PATH || "dev-key.pem");
  const certPath = path.resolve(env.VITE_HTTPS_CERT_PATH || "dev.pem");

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error(
      [
        "VITE_LOCAL_HTTPS=true requires a local certificate and key.",
        `Expected key: ${keyPath}`,
        `Expected certificate: ${certPath}`,
        "Run `pnpm mkcert`, or set VITE_LOCAL_HTTPS=false.",
      ].join("\n"),
    );
  }

  try {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read local HTTPS certificates: ${message}`);
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const https = localHttpsConfig(env);

  return {
    plugins: [react(), wasm(), topLevelAwait()],
    resolve: {
      dedupe: ["three"],
      alias: {
        three: path.resolve("node_modules/three"),
      },
    },
    server: {
      port: 3002,
      host: true,
      cors: true,
      https,
      proxy: {
        "/api": {
          target:
            env.VITE_MATCH_BACKEND_PROXY_TARGET || "http://localhost:3000",
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    preview: {
      host: true,
      https,
    },
    define: {
      global: "globalThis",
    },
    optimizeDeps: {
      include: ["buffer", "three"],
    },
    assetsInclude: ["**/*.glsl", "**/*.vert", "**/*.frag"],
  };
});
