/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Populr backend API (e.g. https://populrbackend.up.railway.app). */
  readonly VITE_API_URL?: string;
  /** Origin of the Populr Auth service. Required — authClient.ts throws without it. */
  readonly VITE_AUTH_URL?: string;
  /** Hosted checkout to send a creator to when their plan blocks an action. */
  readonly VITE_SUBSCRIPTION_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
