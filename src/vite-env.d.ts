/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Populr backend API (e.g. https://populrbackend.up.railway.app). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
