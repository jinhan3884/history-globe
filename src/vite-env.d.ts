/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional Cesium Ion access token. Never hard-code a token in source.
   * Provide via a local `.env` (gitignored) for development and via the
   * hosting platform's env injection for production. The globe and the local
   * GeoJSON dataset render without a token; only Ion-hosted imagery/terrain
   * degrade gracefully when the token is absent.
   */
  readonly VITE_CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
