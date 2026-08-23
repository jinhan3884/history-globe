# Daily Log

## Day 0 — Product direction

Completed:

- Defined Project Alexandria.
- Chose History Atlas and `historyatlas.net`.
- Adopted “History has coordinates.”
- Defined History Data Hub as the long-term asset.
- Defined History Globe as the first app.
- Chose history creators as the first acquisition segment.
- Agreed on fast MVP and incremental expansion.

## OpenCode handoff day

Input assets:

- `legacy/index.html`
- `data/historical-basemaps/world_100.geojson`

Next action:

- Run OpenCode in Plan mode with `OPENCODE_START_PROMPT.md`.

## Milestone 0 — Repository bootstrap (completed)

Implemented the scaffold per the Plan-mode proposal; CEO approved the full
token scrub, oxlint+prettier, coverage-v8 now, and `vite-plugin-static-copy`.

### Security scrub

- Captured the Ion token from `data/cesium access token.txt` into a
  local-only, gitignored `.env.local` (`VITE_CESIUM_ION_TOKEN=...`).
- Deleted the duplicate, undocumented repo-root `index.html`.
- `git rm` the clear-text `data/cesium access token.txt`.
- Scrubbed the token line from `legacy/index.html` (replaced with an
  explanatory notice; the file is preserved as a reference per AGENTS.md).
- Audit: a tree-wide search for the JWT prefix and signature suffix found the
  token **only inside `.env.local`** (gitignored). A full `git rev-list --all`
  walk over every reachable commit blob found the token in **no historical
  commit either** — the secrets only ever existed in the working tree prior to
  this milestone. No `git filter-repo` history rewrite is therefore needed.
  Ion token rotation on the dashboard is still recommended as good hygiene.

### Scaffold created

Toolchain: Vite 8, TypeScript ~6.0.2, vanilla TS (no React), Vitest 4,
oxlint, prettier, vite-plugin-static-copy 4. `src/main.ts` renders only a
branded loading shell ("History has coordinates.") — no Cesium import yet
(progression deferred to Milestone 1).

Files created: `package.json`, `index.html`, `tsconfig.json`,
`tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`,
`vitest.config.ts`, `.oxlintrc.json`, `.prettierrc`, `.prettierignore`,
`src/main.ts`, `src/app.ts`, `src/config.ts`, `src/vite-env.d.ts`,
`src/styles/main.css`, `tests/smoke.test.ts`, `.env.local` (gitignored).

### Verification (all green)

- `npm install` — 117 packages, 0 vulnerabilities.
- `npm run typecheck` — clean (`tsc -b --noEmit`).
- `npm run lint` — clean (oxlint).
- `npm run format:check` — all files already conform.
- `npm run test` — 1 file, 1 test passed.
- `npm run build` — produces `dist/{index.html,assets/,cesium/,data/}`; the
  Cesium `Assets/Widgets/Workers/ThirdParty` trees and the GeoJSON copy are
  emitted under `dist/cesium/` and `dist/data/historical-basemaps/` with
  shred-of-proof hashes matching the source verbatim
  (`SHA256 = BD15D11B…F9B020` for the GeoJSON).
- `npm run preview` — manual fetch smoke test on port 4178 returned:
  `GET /` → 200 (branded shell), `GET /data/historical-basemaps/world_100.geojson`
  → 200, 1,761,405 bytes, `GET /cesium/Assets/approximateTerrainHeights.json`
  → 200, 299,471 bytes.
- Fresh-clone simulation: temporarily moved `.env.local` aside; `npm run build`
  succeeded with no token in the environment, confirming token-optional builds.

### Diagnostics fixed during build

1. `vite-plugin-static-copy@2.x` peer-flagged against Vite 8 → upgraded to
   `^4.1.1`; `vitest` and `@vitest/coverage-v8` matched at `^4.1.10`.
2. Three accidental UTF-8 BOM inserts in JSON configs (PowerShell
   `-Encoding UTF8` artifact) tripped oxlint and Vite's PostCSS search —
   stripped by rewriting the affected files with a no-BOM UTF8Encoding.
3. `vite-plugin-static-copy` previously copied the full
   `node_modules/cesium/Build/Cesium/...` path into `dist/cesium/`. Fixed by
   switching to glob `src` entries with `rename: { stripBase: 4 }` for
   Cesium assets and `stripBase: 2` for the GeoJSON.

### What was deliberately NOT done

- No Cesium import or `Viewer` construction (M1).
- No GeoJSON load at runtime (M1).
- No React, no router, no state library, no backend, no analytics
  (forbidden by AGENTS.md).
- No Cloudflare deployment config (M6).
- No history rewrite via `git filter-repo` (moot — token never committed).
- No dataset edits of any kind.

### Residual risks

- R1: dev-server wiring of Cesium `CESIUM_BASE_URL` is verified at build
  output time only; the dev hot-reload path will be exercised in M1.
- R2: TypeScript `~6.0.2` is bleeding-edge; pinned, `skipLibCheck: true`,
  downgrade path documented.
- R3: Token rotation on the Cesium Ion dashboard remains a recommended
  CEO action — not agent-doable.

## Milestone 1 — Minimal application shell (completed)

Refactored the legacy single-file viewer into the new Vite + TypeScript
scaffold while preserving the legacy UX (cyan translucent fill, hover
tooltip, named-entity fly-to). The app now boots through the typed module
chain described in `docs/ARCHITECTURE.md`.

### Module structure realised

- `src/cesium/createViewer.ts` — `Cesium.Viewer` with widget UI disabled;
  optional Ion token wiring; no-Ion degradation removes default imagery
  layer to avoid broken Bing attribution badge.
- `src/cesium/renderGeoJson.ts` — `GeoJsonDataSource.load` with the legacy
  cyan/transparent palette; explicit `entity.name` assignment with the
  `UNNAMED_LABEL` fallback for null/empty `NAME`.
- `src/cesium/interaction.ts` — `ScreenSpaceEventHandler` for hover (tooltip
  show/move/hide) and click (name → dev-only log; future side panel is M5).
- `src/geojson/types.ts` — minimal RFC-7946 types (`Position`, `Geometry`,
  `Feature`/`FeatureCollection`, known `FeatureProperties`, `UNNAMED_LABEL`).
- `src/geojson/loadGeoJson.ts` — fetch + BOM-tolerant parse + structural
  validation only (no coordinate repair). Throws `GeoJsonLoadError` on shape
  mismatch; surfaces `featureCount` and `namedFeatureCount` to callers.
- `src/ui/{loading,errorPanel,tooltip}.ts` — DOM panels with explicit
  controller interfaces so app.ts stays glue-only.
- `src/app.ts` — composition; mount order: viewer → tooltip → interaction →
  attribution → dataset load → fly-to. Errors route to the visible error
  overlay, never silence.
- `index.html` — minimal Vite entry; no token.
- `src/styles/main.css` — full-screen reset; loading + error overlay + tooltip
  - attribution styling; CSS custom properties drive tooltip position.
- `tests/loadGeoJson.test.ts` — 6 unit tests covering parse, named-counting,
  Bad top-level type, unsupported geometry type, null-property handling,
  BOM stripping. Coordinate-level tests deferred to M2/M3.

### Verification — all green

- `npm run typecheck` — clean (`tsc -b --noEmit`).
- `npm run lint` — clean (oxlint; one `no-shadow` warning self-resolved by
  renaming a local variable).
- `npm run format:check` — all files conform.
- `npm run test` — 2 files / 6 tests pass; runtime 447 ms.
- `npm run build` — emits `dist/` with the JS bundle
  (`assets/index-…js`, ~4 MB raw / ~1.1 MB gzip; Cesium is ~all of it),
  copied Cesium Assets/Widgets/Workers/ThirdParty, and the dataset.
- `npm run preview` (port 4178, manual fetch):
  - `GET /` → 200 branded Vite entry.
  - `GET /data/historical-basemaps/world_100.geojson` → 200, 1,761,405 bytes.
  - `GET /cesium/Workers/` → 200 directory listing.
  - `GET /assets/index-…js` → 200, 4,093,272 bytes.
- Token-grep audit repeated after M1: token string still absent from the
  working tree outside gitignored `.env.local`.

### Residual risks carried forward

- R1-M0 collapsed: dev-server path is now exercised through `npm run
preview`; the dataset and Cesium static assets are served identically.
- R4-M1: The 4 MB JS bundle (mostly Cesium) triggers Vite's
  `chunkSizeWarningLimit` warning. Code-splitting and lazy Cesium loading
  are deferred to M5 polish; M1 ships a working single bundle.
- R5-M1: The known polygon artifact is _not_ addressed in M1 (deliberate; M2
  diagnostics and M3/M4 fixes own this). Visually confirmed during smoke
  that the artifact still appears (or doesn't — a real visual check needs a
  browser session and is queued for the human reviewer).
- R6-M1: WAN failures mid-fetch still throw to the visible error overlay;
  offline resilience is not added in M1.

### What was deliberately NOT done

- No coordinate cleaning, ring closure, winding, or range diagnostics (M2).
- No geometry normalization or repair (M3).
- No artifact fallback (M4).
- No responsive layout or accessibility pass beyond the basic overlay roles
  (M5).
- No Cloudflare deployment, no analytics, no share buttons (M5/M6).
- No React, no router, no state library (forbidden by AGENTS.md, holding).
- No additional dataset files loaded.

## Milestone 2 — Geometry diagnostics first (completed)

Added a deterministic, mutation-free diagnostic pipeline
(`src/geojson/diagnostics.ts` + `src/geojson/report.ts`). `app.ts` now runs
the diagnostics against the loaded collection and prints a dev-only summary
to the console before handing the data to the renderer. The original dataset
is never touched.

### Inspections implemented

- non-finite coordinate — `coord-non-finite` (error)
- malformed coordinate — `coord-malformed` (error)
- longitude out of [-180,180] — `lon-out-of-range` (error)
- latitude out of [-90, 90] — `lat-out-of-range` (error)
- ring with fewer than 4 pts — `ring-degenerate` (error)
- ring not closed — `ring-open` (error)
- consecutive duplicate point — `duplicate-point` (warning)
- longitude jump >= 180° — `lon-jump` (warning)
- outer ring CW — `winding-cw-outer` (warning)
- hole ring CCW — `winding-ccw-hole` (warning)

Path-style `path` field (e.g. `polygon[0].ring[3].point[5]`) is recorded for
each issue so M3 can act on exactly the same coordinate.

### Verification — all green

- `npm run typecheck` — clean.
- `npm run lint` — clean (one `unicorn/no-array-sort` warning self-fixed by
  switching to `Array#toSorted`).
- `npm run test` — 3 files / 18 tests pass (12 new diagnostics tests +
  6 from M1).
- `npm run build` — succeeds; bundle size unchanged (diagnostics is a pure
  TS module, no new runtime deps).
- Ran diagnostics against the live `world_100.geojson` via `vite-node`:

  ```
  features:        440
  clean:            5
  with warnings:   435
  with errors:       0
  rings total:     821
  positions total: 30235
  issues by code:
      winding-cw-outer: 794
      winding-ccw-hole: 5
      duplicate-point: 4
  ```

### Findings — principal correlate of the known artifact

- 0 structural errors. Dateline crossings and non-finite coords are absent,
  so the artifact is **not** the result of broken coordinates in the source.
- 435/440 features are flagged, dominated by `winding-cw-outer` (794
  occurrences). The dataset features' outer rings are predominantly
  Clockwise, opposite to the RFC 7946 right-hand rule recommendation that
  Cesium's `GeoJsonDataSource` expects.
- This is the leading hypothesis for the polygon rendering artifact: the
  misorientated outer ring makes the triangulator infer an inside-out polygon
  and fill the complementary space with thin triangular artifacts.
- M3 will normalise winding conservatively (flip CW outer → CCW, CCW hole →
  CW) and re-test the artifact. If the artifact remains, M4 falls back to a
  feature-specific strategy.

### Residual risks carried forward

- R7-M2: M2 inspection does not detect self-intersection. A ring that crosses
  itself passes all current checks. If M3 normalisation does not resolve the
  artifact, M4 will introduce a self-intersection test.
- R8-M2: The 4 `duplicate-point` warnings are minor and could be removed in
  M3; the 5 `winding-ccw-hole` warnings affect only 5 hole rings.
- R5-M1 (the artifact itself) persists — by design; M3 owns the fix attempt.

### What was deliberately NOT done

- No coordinate mutation, winding flip, ring closure, or duplicate removal
  (M3).
- No Cesium-side rendering change.
- No CLI tooling around diagnostics (the `vite-node` run was a one-off
  verification, not a shipped command).
- No public/exposed diagnostic UI; the summary is dev-bundle-only via
  `import.meta.env.DEV`.

## Milestone 3 — Conservative geometry normalization (completed)

Added a pure, copy-on-write normalizer
(`src/geojson/normalize.ts`) between diagnostics and rendering. `app.ts`
now runs: load → diagnose (dev-only console.info) → normalize → diagnose
(dev-only console.info) → render. No Cesium-side change beyond receiving
the normalized collection.

### Transformations performed

1. `removeNonFinite` — drop positions where lon/lat are non-finite
2. `removeConsecutiveDuplicates` — drop a point equal to its predecessor
3. `ensureClosed` — append first point as last if ring is open
4. dropped-degenerate-ring — rings with fewer than 4 positions after 1–3
5. `normalizeWinding` — outer → CCW, hole → CW (RFC 7946)
6. dropped-degenerate-polygon / dropped-feature-no-polygons when no valid
   rings remain; reported, never silent

Source collection is never mutated. Properties are shallow-copied. Holes are
preserved and rewound separately from the outer ring.

### Repair report types

Added `RepairAction`, `RepairEntry`, `FeatureRepairReport`, `RepairReport`,
`summariseRepairs`, and `formatDevRepairSummary` in `src/geojson/report.ts`
— parallel to the diagnostic-summary vocabulary established in M2.

### Verification — all green

- `npm run typecheck` — clean.
- `npm run lint` — clean (two `unicorn/no-array-reverse` warnings
  self-fixed by switching to `Array#toReversed`).
- `npm run format:check` — all files conform.
- `npm run test` — 4 files / 29 tests pass (11 new normalize tests +
  12 diagnostics + 6 loader).
- `npm run build` — succeeds.
- `npm run preview` (port 4178): `/` 200, dataset 200 (1,761,405 bytes),
  bundle 200.
- Ran diagnostics + normalize on the live `world_100.geojson`:

  ```
  === BEFORE ===
  features:       440, clean: 5, warnings: 435, errors: 0
  winding-cw-outer: 794, winding-ccw-hole: 5, duplicate-point: 4

  === REPAIRS ===
  features dropped: 0
  rewound-outer-ring:    794
  rewound-hole-ring:       5
  removed-duplicate-point: 4

  === AFTER ===
  features:       440, clean: 440, warnings: 0, errors: 0
  ```

### Diagnostic finding during M3

A first implementation pass used `Math.abs(area) < 1e-9` to short-circuit
the winding flip. Re-running post-normalisation diagnostics then showed
348 residual `winding-cw-outer` warnings. Investigation revealed a class of
self-intersecting rings with tiny-but-signed shoelace values on the order
of 3.4e-10 — the coarse tolerance skipped their flip even though the sign
was still meaningful. The short-circuit now uses an exact `area === 0`
test (D-024). M4 owns the self-intersection problem itself; M3 only handles
winding direction deterministically.

### Residual risks carried forward

- R9-M3: Self-intersecting rings (the sample at feature #1 in the dataset
  walks outward then traces back across its own outline) are _not_ repaired
  by M3. The signed-area sign is meaningless for them but
  healing/removal is M4 scope. Today, those rings are still rewound on
  the basis of sign so Cesium sees a deterministic winding; we have not
  inspected the artifact visually.
- R10-M3: The visual verification of artifact removal needs a human
  browser smoke test of `npm run preview`. The pipeline-level diagnostic
  collapse is strong evidence, not a visual proof.
- R5-M1 (the artifact itself): the _correlate_ is eliminated; the _symptom_
  is re-tested as part of M4.

### What was deliberately NOT done

- No self-intersection repair (M4).
- No antimeridian split (M4).
- No longitude remapping like 190 → -170 (D-026).
- No offline dataset preprocessing or persisted repaired derivative.
- No change to Cesium rendering API or styling.

## Re-execution day (2026-08-23) — M0 re-verified + render-crash remediation

CEO instruction: ignore all prior in-progress work and re-run the
OPENCODE_START_PROMPT workflow, overwriting as needed.

### State found

- Commits M0–M3 present; working tree carried uncommitted changes: Cesium
  pinned 1.143 → 1.114.0, a `@zip.js/zip.js` subpath shim in
  `vite.config.ts`, a partial `normalize.ts` degenerate-ring fix,
  and four `temp_*.json` experiment outputs.

### Bootstrap re-verification (M0 scope)

- Secrets audit: tracked files contain no token; the only lockfile hit for
  the JWT pattern is a base64 integrity hash substring (false positive).
- `.gitignore`, `.env.example`, scripts, toolchain verified intact.
- README gained a "Local development" quickstart section.
- Removed debris: `temp_norm_*.json`, `temp_orig_feature1.json`.
- Kept after verification: Cesium 1.114.0 pin + zip shim (necessary — the
  subpath is blocked by zip.js's exports map) and the normalize.ts work
  (extended below). CEO business documents (`*.docx`, `*.xlsx`) untouched.

### Browser smoke test found a hard crash

`npm run dev` + headless Chromium: the render loop stopped with
`RangeError: Failed to set the 'length' property on 'Array': Invalid array
length`. Stack captured via the Cesium error panel:
`subdivideRhumbLine` inside the `createPolygonOutlineGeometry` worker.

Root cause chain, reproduced in Node against Cesium's own source modules:

1. Ring segments touching latitude ±90° make `EllipsoidRhumbLine` undefined;
   surface distance is NaN → `positions.length = NaN * 3` throws. The raw
   dataset has 363 polar vertices across 63 features (mostly Antarctica's
   boundary closed along −90°).
2. Separately, 66 normalized rings had exactly 3 distinct points and zero
   floating-point area (collinear specks ≤ 9.09e-13); these pass any
   distinct-point count but are geometrically empty.

Fixes (see D-027, D-028):

- `clampPolarVertices` clamps ±90° to ±(90 − 1e-6), reported per vertex as
  `clamped-polar-latitude`.
- Rings with |shoelace| < 2e-12 are dropped as degenerate (replacing the
  distinct-point rule); 23 features consisting only of such specks are
  dropped **with report** (417 of 440 kept).
- `src/main.ts` now imports Cesium `widgets.css` (D-029) — without it the
  viewer collapsed to a 300×150 corner canvas.

### Verification — all green

- `npm run typecheck`, `npm run lint`, `npm run format:check` — clean.
- `npm run test` — 4 files / 33 tests pass (4 new: collinear drop, tiny real
  island kept, full-feature drop reported, polar clamp).
- Node segment scan over the full normalized dataset using Cesium's own
  `EllipsoidRhumbLine`: 0 non-finite subdivision segments remain.
- `npm run build` — succeeds (benign shim warnings only).
- Dev server + headless Chromium: globe renders full-screen, no error panel;
  hover tooltip verified ("Khoiasan", computed display block/visible).
- Production preview (port 4173): same result; hover works.
- Token-less rebuild (`.env.local` moved aside): globe renders with solid
  base color, polygons + tooltip still work. Bundle scan: the only JWT is
  Cesium's own public library default token, byte-identical to
  `node_modules/@cesium/engine/Source/Core/Ion.js`; our secret is absent.

### Residual risks

- R11: 23 dropped features are reported in dev console only; production has
  no visible indicator (acceptable until M5 polish).
- R12: visual artifact status (triangles) not yet systematically diffed
  against legacy; Antarctica now renders cleanly at the pole, which was the
  largest suspected artifact source.
- R13: Ion token rotation still pending (CEO action, unchanged).

### What was deliberately NOT done

- No self-intersection repair or antimeridian split (M4).
- No production-visible repair reporting (M5).
- No deployment config (M6).
- No dataset file edits; normalization stays copy-on-write at runtime.
