/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_E2E_LOCAL_CI_WALLETS?: string;
}

declare module "*.frag" {
  const content: string;
  export default content;
}

declare module "*.vert" {
  const content: string;
  export default content;
}

declare module "*.glsl" {
  const content: string;
  export default content;
}
