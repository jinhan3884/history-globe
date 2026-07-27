# Architecture — MVP

## Chosen direction

A small static TypeScript application.

```text
GeoJSON file
   ↓
loader
   ↓
diagnostics
   ↓
conservative normalizer
   ↓
Cesium renderer
   ↓
tooltip / selection UI
```

## Proposed folders

```text
src/
  app.ts
  config.ts
  geojson/
    types.ts
    loadGeoJson.ts
    diagnostics.ts
    normalize.ts
    report.ts
  cesium/
    createViewer.ts
    renderGeoJson.ts
    interaction.ts
  ui/
    loading.ts
    tooltip.ts
    errorPanel.ts
  styles/
    main.css
tests/
data/
docs/
legacy/
```

## Separation of concerns

### Generic layer

The `geojson/` layer:

- knows GeoJSON,
- validates and normalizes coordinates,
- produces diagnostics,
- does not import Cesium.

### Rendering layer

The `cesium/` layer:

- creates the globe,
- converts normalized geometry to Cesium entities or data sources,
- handles camera and picking,
- does not mutate source data.

### UI layer

The `ui/` layer:

- loading state,
- error messages,
- tooltip and selection panel,
- branding.

## Rendering decision

Start by using `Cesium.GeoJsonDataSource` to preserve speed of delivery. Replace individual problematic features with direct entity construction only when diagnostics demonstrate a need.

This avoids prematurely building a complete custom polygon engine.

## Geometry policy

Use a tiered strategy:

1. Parse validation.
2. Conservative normalization.
3. Diagnostics.
4. Feature-specific fallback.
5. Optional offline preprocessing for difficult datasets.

Never apply aggressive repair globally without reporting it.

## Deployment

Static output suitable for Cloudflare Pages.

No backend is required for v0.1.

## Milestone 1 realized

The proposed folders are now fully populated.

```
src/
  main.ts                      vanilla TS entry; mounts app into #root
  app.ts                       composition: viewer → interaction → load → fly-to
  config.ts                    typed env access (VITE_CESIUM_ION_TOKEN, DATASET_PATH)
  vite-env.d.ts                import.meta.env type augmentation
  cesium/
    createViewer.ts            Viewer + optional Ion token + no-Ion degradation
    renderGeoJson.ts           GeoJsonDataSource.load, palette + NAME fallback
    interaction.ts             screen-space hover/click → tooltip/callbacks
  geojson/
    types.ts                   Position/Geometry/Feature + UNNAMED_LABEL
    loadGeoJson.ts             fetch + parse + structural validation only
  ui/
    loading.ts                 visible loading overlay (role=status)
    errorPanel.ts              modal error overlay (role=alert) + dismiss
    tooltip.ts                hover tooltip controller (show/moveTo/hide)
  styles/
    main.css                   full-screen reset + overlay/tooltip/attribution CSS
tests/
  smoke.test.ts                 toolchain smoke (M0)
  loadGeoJson.test.ts           6 loader unit tests (M1)
data/historical-basemaps/…     untouched source dataset, copied into dist/ on build
dist/                          gitignored build output: assets/ cesium/ data/ index.html
.env.local                     gitignored; local-only Ion token (not committed)
legacy/index.html              preserved reference; token scrubbed (no longer functional
                               for Ion imagery, but the local GeoJSON still renders)
```

Separation of concerns verified by import direction:

- `geojson/` imports nothing from Cesium (pure TS).
- `cesium/` imports from `geojson/types` and `ui/tooltip` only, never reverse.
- `ui/` imports nothing app-specific.
- `app.ts` is the only file that imports across all three layers.

The generic-vs-rendering split required by `AGENTS.md` holds; this is the
contract that protects M2/M3 coordinate-level work from accidentally
coupling to Cesium.

## Milestone 2 realized

The generic `geojson/` layer now owns diagnostics independent of rendering:

```
src/geojson/
  types.ts          Minimal RFC-7946 typings + UNNAMED_LABEL
  loadGeoJson.ts    fetch + parse + structural validation (no coordinate repair)
  diagnostics.ts    pure per-feature issue detection -> DiagnosticsReport
  report.ts         DiagnosticsReport/Summary types + dev-mode text formatter
```

`app.ts` runs `diagnoseFeatureCollection` against the loaded collection
before `renderGeoJson`, and prints `formatDevSummary` to the console in
dev only. No production output. No source-data mutation at any point.

## Milestone 3 realized

```
src/geojson/
  normalize.ts      pure copy-on-write normalizer -> NormalizeResult
                    (collection + RepairReport)
  report.ts         also produces RepairReport/Summary types + formatter
```

Pipeline ordering in `app.ts`:

```
load → diagnose (dev-only) → normalize → diagnose (dev-only) → render
```

Both diagnostic summaries and the repair summary are dev-bundle-only. The
production bundle silently runs normalization (necessary for the renderer)
but emits no console output. The input `FeatureCollection` is never
mutated; Cesium receives a fresh copy with winding-correct rings and
preserved properties.
