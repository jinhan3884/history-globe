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

## Milestone 0 realized

The proposed folder structure is partially bootstrapped. The following are in
place after M0:

```
index.html                       Vite entry; minimal, token-free
package.json                     dev/build/preview/typecheck/test/format/lint scripts
tsconfig.{json,app,node}.json    project-references TS config
vite.config.ts                   define CESIUM_BASE_URL + static-copy of Cesium assets and dataset
vitest.config.ts                 vitest + coverage-v8, node environment
.oxlintrc.json / .prettierrc     lint/format config
src/
  main.ts                        vanilla TS entry; mounts app into #root
  app.ts                         M0 mounts only a branded loading shell
  config.ts                      typed env access (VITE_CESIUM_ION_TOKEN, DATASET_PATH)
  vite-env.d.ts                  import.meta.env type augmentation
  styles/main.css                full-screen reset + center layout
tests/
  smoke.test.ts                  toolchain smoke test
data/historical-basemaps/…       untouched source dataset, copied into dist/ on build
dist/                            gitignored build output: assets/ cesium/ data/ index.html
.env.local                       gitignored; local-only Ion token (not committed)
legacy/index.html                preserved reference; token scrubbed (no longer functional
                                 for Ion imagery, but the local GeoJSON still renders)
```

Folders proposed by this document but **not yet created** in M0:
`src/geojson/`, `src/cesium/`, `src/ui/`. These arrive in M1–M3 with their
own files (no empty placeholder directories shipped in M0).
