import * as Cesium from 'cesium';
import { cesiumIonToken, hasCesiumIonToken } from '../config';

/**
 * Initialises a full-screen `Cesium.Viewer` configured for the History Globe
 * MVP:
 *
 *  - UI widgets that need extra data or clutter (geocoder, animation, …) are
 *    disabled so the globe shows immediately.
 *  - `Cesium.Ion.defaultAccessToken` is set only when a usable token exists.
 *    Cesium falls back to its built-in (no-Ion) state otherwise; the local
 *    GeoJSON dataset has no Ion dependency, so the globe + polygons still
 *    render.
 *
 * `Cesium.Ion.defaultAccessToken` is set as a side effect of module import in
 * Cesium's library, so this function intentionally re-assigns it each call;
 * safe because the viewer is created exactly once per page lifecycle.
 */
export function createViewer(container: HTMLElement): Cesium.Viewer {
  if (hasCesiumIonToken) {
    Cesium.Ion.defaultAccessToken = cesiumIonToken;
  } else if (import.meta.env.DEV) {
    // Surface the absence of a token in dev mode so the developer can see
    // why Ion-hosted imagery/terrain are unavailable. We must avoid a
    // console log in production per AGENTS.md quality rules; this branch is
    // only present in dev bundles.
    console.info(
      '[history-atlas] VITE_CESIUM_ION_TOKEN not set; rendering without Ion.',
    );
  }

  const viewer = new Cesium.Viewer(container, {
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    selectionIndicator: false,
    infoBox: false,
  });

  // Drop Cesium's default Bing imagery if no token is available — otherwise
  // the globe shows an error badge over a broken layer. With a token, the
  // default ImageryLayer (Bing) is meaningful so keep it.
  if (!hasCesiumIonToken) {
    viewer.imageryLayers.removeAll();
  }

  // Dev-only handle for browser-automation smoke tests (camera positioning).
  // The cast keeps `any` out; the property is never read by app code and the
  // assignment is dead-code-eliminated from production bundles.
  if (import.meta.env.DEV) {
    (
      window as unknown as { __historyAtlasViewer?: Cesium.Viewer }
    ).__historyAtlasViewer = viewer;
  }

  return viewer;
}
