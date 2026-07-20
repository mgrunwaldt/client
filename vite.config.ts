import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

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

function vendorChunk(id: string) {
  const moduleId = id.replaceAll("\\", "/");
  if (!moduleId.includes("/node_modules/")) return undefined;

  if (/\/(?:react|react-dom|scheduler)@/.test(moduleId)) {
    return "vendor-react";
  }
  if (moduleId.includes("/react-router@")) return "vendor-router";
  if (moduleId.includes("/starknet@")) return "vendor-starknet";
  if (moduleId.includes("/@starknet-react+")) return "vendor-starknet-react";
  if (moduleId.includes("/@cartridge+")) return "vendor-cartridge";
  const dojoPackage = moduleId.match(/\/@dojoengine\+([^@/]+)@/);
  if (dojoPackage) return `vendor-dojo-${dojoPackage[1]}`;
  if (moduleId.includes("/effect@")) return "vendor-effect";
  if (moduleId.includes("/three@") && moduleId.includes("/three.core.js")) {
    return "vendor-three-core";
  }
  if (moduleId.includes("/three@") && moduleId.includes("/three.module.js")) {
    return "vendor-three-webgl";
  }
  if (moduleId.includes("/three-stdlib@")) return "vendor-three-stdlib";
  if (moduleId.includes("/@react-three+fiber@")) return "vendor-r3f";
  if (moduleId.includes("/react-reconciler@")) return "vendor-reconciler";
  if (moduleId.includes("/@react-three+drei@")) return "vendor-drei";
  if (moduleId.includes("/@react-three+rapier@")) return "vendor-r3f-rapier";
  if (moduleId.includes("/@dimforge+rapier3d@")) return "vendor-rapier";

  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  env.VITE_LOCAL_HTTPS = process.env.VITE_LOCAL_HTTPS ?? env.VITE_LOCAL_HTTPS;
  env.VITE_HTTPS_KEY_PATH =
    process.env.VITE_HTTPS_KEY_PATH ?? env.VITE_HTTPS_KEY_PATH;
  env.VITE_HTTPS_CERT_PATH =
    process.env.VITE_HTTPS_CERT_PATH ?? env.VITE_HTTPS_CERT_PATH;
  const https = localHttpsConfig(env);

  return {
    plugins: [react(), wasm(), topLevelAwait()],
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks: vendorChunk,
        },
      },
    },
    resolve: {
      dedupe: ["three"],
      alias: {
        "@dimforge/rapier3d-compat": path.resolve("src/compat/rapier3d.ts"),
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
          target: env.VITE_MATCH_API_PROXY_TARGET || "http://localhost:3100",
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
