import * as Cesium from 'cesium';

/**
 * Initialises a full-screen `Cesium.Viewer` configured for the History Globe
 * MVP:
 *
 *  - UI widgets that need extra data or clutter (geocoder, animation, …) are
 *    disabled so the globe shows immediately.
 *  - Imagery: Natural Earth II (bundled with CesiumJS, no network or token
 *    required). No Cesium Ion dependency — the app is fully self-contained.
 *  - Terrain: default ellipsoid (no terrain provider needed for 100 CE
 *    historical borders).
 */

export function createViewer(container: HTMLElement): Cesium.Viewer {
  // Suppress Cesium's built-in "CESIUM ion" credit container — we don't use
  // Ion. Attribution is provided via the app's own attribution bar.
  const creditDiv = document.createElement('div');
  creditDiv.style.display = 'none';
  container.append(creditDiv);

  const viewer = new Cesium.Viewer(container, {
    creditContainer: creditDiv,
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

  // Dark ocean: solid deep navy imagery layer covering the entire globe
  const darkNavy = Cesium.Color.fromCssColorString('#0a1628');
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 1;
  canvas2d.height = 1;
  const ctx = canvas2d.getContext('2d')!;
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, 1, 1);
  viewer.imageryLayers.addImageryProvider(
    new Cesium.SingleTileImageryProvider({
      tileWidth: 1,
      tileHeight: 1,
      url: canvas2d.toDataURL(),
    }),
  );
  viewer.scene.globe.baseColor = darkNavy;



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
