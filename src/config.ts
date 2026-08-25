/**
 * Runtime configuration for the History Atlas app.
 *
 * All externalised values (tokens, dataset paths) live here. Nothing in the
 * app imports a secret directly; consumers read through the typed exports of
 * this module.
 */

/**
 * Cesium Ion access token, read from the Vite environment at build time.
 * Always `string` — empty string means "no token provided". Downstream code
 * must treat the empty string as "absent" and avoid passing it to Cesium.
 */
export const cesiumIonToken: string =
  import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';

/**
 * Whether a usable Ion token is configured. Convenience flag so callers do
 * not have to repeat the empty-string check.
 */
export const hasCesiumIonToken: boolean = cesiumIonToken.length > 0;

/**
 * Public base URL where the local historical GeoJSON dataset is served,
 * relative to the site root. Works for `vite dev`, `vite preview`, and the
 * copied path inside the production `dist/` tree.
 */
export const DATASET_PATH: string =
  '/data/world_100.geojson' as const;

/**
 * Privacy-friendly analytics placeholder. Empty by default: no analytics
 * script is loaded unless a future milestone wires a provider behind this
 * flag. Set `VITE_ANALYTICS_ID` to enable once a provider is chosen.
 */
export const analyticsId: string = import.meta.env.VITE_ANALYTICS_ID ?? '';
