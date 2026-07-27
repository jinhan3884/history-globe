import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Base URL where Cesium's own static assets (Assets, Widgets, Workers, ThirdParty)
// are served at runtime. The plugin below copies these from
// `node_modules/cesium/Build/Cesium` into `dist/cesium` for production builds.
const CESIUM_BASE_URL = '/cesium/';

// Number of leading directory segments to strip from each matched glob path so
// that only the meaningful tail is preserved under `dest`.
//
//   node_modules / cesium / Build / Cesium / Assets /  app/...   =>  strip 4
//   data         / historical-basemaps / world_100.geojson       =>  strip 2
const CESIUM_STRIP_BASE = 4;
const DATA_STRIP_BASE = 2;

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(CESIUM_BASE_URL),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/cesium/Build/Cesium/{Assets,Widgets,Workers,ThirdParty}/**/*',
          dest: 'cesium',
          rename: { stripBase: CESIUM_STRIP_BASE },
        },
        {
          src: 'data/historical-basemaps/world_100.geojson',
          dest: 'data/historical-basemaps',
          rename: { stripBase: DATA_STRIP_BASE },
        },
      ],
    }),
  ],
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
