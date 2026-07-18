import { createDojoConfig } from "@dojoengine/core";

import { manifest } from "../config/manifest";

const { VITE_PUBLIC_NODE_URL, VITE_PUBLIC_TORII, VITE_PUBLIC_MASTER_ADDRESS } =
  import.meta.env;

export const dojoConfig = createDojoConfig({
  manifest,
  masterAddress: VITE_PUBLIC_MASTER_ADDRESS || "",
  rpcUrl: VITE_PUBLIC_NODE_URL || "",
  toriiUrl: VITE_PUBLIC_TORII || "",
});
