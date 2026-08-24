# Decision Log

## D-001 — Internal codename

**Decision:** Project Alexandria.

## D-002 — Public brand and domain

**Decision:** History Atlas at `historyatlas.net`.

## D-003 — Tagline

**Decision:** “History has coordinates.”

## D-004 — Platform identity

**Decision:** A history platform for everyone, not only creators.

## D-005 — Initial go-to-market segment

**Decision:** History YouTubers and other history creators.

## D-006 — First public application

**Decision:** History Globe.

## D-007 — Long-term core asset

**Decision:** History Data Hub.

## D-008 — Product strategy

**Decision:** Launch a small MVP quickly; upgrade using traffic and feedback.

## D-009 — Engineering strategy

**Decision:** Preserve the current working proof of concept and refactor incrementally.

## D-010 — Geometry strategy

**Decision:** Diagnose first, repair conservatively, and avoid claiming universal automatic repair.

## D-011 — Initial deployment model

**Decision:** Static web application; no backend required for v0.1.

## D-012 — Build toolchain

**Decision:** Vite 8 + TypeScript ~6.0.2, vanilla TS (no React). Linked
`tsconfig.{app,node}.json` via a root `tsconfig.json` of project references.
Confirmed against the constraints in `AGENTS.md`.

## D-013 — Lint and formatting toolchain

**Decision:** `oxlint` for linting and `prettier` for formatting (chosen over
eslint+prettier and Biome). Oxlint categories enabled: `correctness` (deny),
`suspicious` (warn), `perf` (warn). `no-console` disabled during M0; will
revisit when Cesium diagnostics need logging discipline.

## D-014 — Cesium static asset serving under Vite

**Decision:** `vite-plugin-static-copy@^4.1.1` copies
`node_modules/cesium/Build/Cesium/{Assets,Widgets,Workers,ThirdParty}` into
`dist/cesium/` (using a single glob target with `rename: { stripBase: 4 }`),
and the local GeoJSON into `dist/data/historical-basemaps/` (`stripBase: 2`).
`CESIUM_BASE_URL` defined globally as `'/cesium/'` via Vite `define`. No CDN;
no React; original dataset file is preserved untouched.

## D-015 — Cesium token scrub

**Decision:** Full working-tree scrub. The duplicate repo-root `index.html`
and the clear-text `data/cesium access token.txt` were removed; the token in
`legacy/index.html` was replaced with an explanatory notice. The token value
was captured into a local-only, gitignored `.env.local` before any file was
deleted. A `git rev-list --all` walk over every reachable commit blob found
the token in **no historical commit**, so a `git filter-repo` history rewrite
is not required. Ion token rotation on the Cesium Ion dashboard is still
recommended as good hygiene, but is a CEO action, not an agent action.

## D-016 — Test runner and coverage

**Decision:** Vitest 4 with `@vitest/coverage-v8`. Tests run in the `node`
environment for the generic GeoJSON layer (M2/M3); a `jsdom` environment will
be added only if/when a UI test requires it. M0 ships one smoke test so the
runner is wired and the `npm run test` command exits cleanly.

## D-017 — Rendering API

**Decision:** Use `Cesium.GeoJsonDataSource.load` for M1, exactly as the
legacy viewer did, instead of building a custom polygon pipeline. The cyan
translucent fill is preserved so M1 is a refactor of the same UX, not a
reskin. A custom entity pipeline is reserved for M4's feature-specific
fallback on the demonstrated artifact.

## D-018 — Cesium viewer boot mode

**Decision:** When no `VITE_CESIUM_ION_TOKEN` is configured, the app removes
Cesium's default ImageryLayers so the globe does not display a broken Bing
attribution badge. The local GeoJSON dataset renders identically with or
without a token. Production builds will likely combine a public Ion token
with Cesium World Imagery; M1 ships usable behaviour for both states.

## D-019 — Null name fallback

**Decision:** Features whose `NAME` is `null`, `undefined`, or empty string
get the neutral label `Unknown / Unrecorded territory` stored on
`entity.name`, so the viewer's tooltip side never draws empty text. The
fallback string is exported once from `src/geojson/types.ts` so the value
cannot drift between code paths.

## D-020 — M2 diagnostics is read-only

**Decision:** `src/geojson/diagnostics.ts` produces a `DiagnosticsReport`
without mutating the source `FeatureCollection`. Repair belongs to M3; M2
exists to give M3 reliable coordinates to act on and to surface correlates
of the known polygon artifact.

## D-021 — Winding convention flagged, not fixed in M2

**Decision:** Diagnostics flag `winding-cw-outer` and `winding-ccw-hole` as
warnings (not errors) per RFC 7946's right-hand rule recommendation. M2 makes
no winding change. Result on the live dataset is 794 `winding-cw-outer`
occurrences across 435/440 features, which is the dominant correlate of the
known polygon artifact and the leading hypothesis for M3 normalization.

## D-022 — Diagnostic issue code vocabulary

**Decision:** Codes `coord-malformed`, `coord-non-finite`,
`lon-out-of-range`, `lat-out-of-range`, `ring-degenerate`, `ring-open`,
`duplicate-point`, `lon-jump`, `winding-cw-outer`, `winding-ccw-hole`. The
set is closed and stable; M3 normalizer will consume these exact codes to
decide what to repair, and any new code added later requires a paired test.

## D-023 — M3 normalizer is pure and copy-on-write

**Decision:** `src/geojson/normalize.ts` produces a new
`FeatureCollection` and a `RepairReport`. The input collection is never
mutated, even for property objects; properties are shallow-copied onto the
new feature objects. Cesium receives the normalized copy; the source
dataset file is never written or copied back.

## D-024 — Winding flip tolerance

**Decision:** The normalizer's `signedArea === 0` short-circuit uses an
_exact_ zero test, not a tolerance band. Several rings in the live dataset
are self-intersecting with tiny-but-signed areas (e.g. `3.4e-10`); a coarse
tolerance of `1e-9` skipped their winding flip in early M3 drafts and left
348 `winding-cw-outer` warnings residual. Exact zero keeps the flip decision
tied to the sign, which is what the diagnostic and renderer rely on. A
geometric "is this ring degenerate?" test still uses `ring.length <
MIN_RING_POINTS`.

## D-025 — Repair action vocabulary

**Decision:** Repair action codes are `removed-non-finite-coord`,
`removed-duplicate-point`, `closed-ring`, `dropped-degenerate-ring`,
`rewound-outer-ring`, `rewound-hole-ring`, `dropped-degenerate-polygon`,
`dropped-feature-no-polygons`. Each is recorded with a coordinate-tree
`path` so an audit can show "feature X coordinate Y was changed for reason
Z". The set is closed for M3; new actions in M4 require paired tests.

## D-026 — No longitude wrap in M3

**Decision:** M3 does not remap longitudes like `190 → -170`. The live
dataset has no out-of-range longitudes, so the action is not needed and the
risk of an ambiguous remap is not justified. Antimeridian handling belongs
to M4 if the artifact persists after winding normalization.

## D-027 — Polar-latitude clamp in the normalizer

**Decision:** Vertices at exactly ±90° latitude are clamped to
±(90° − 1e-6) during normalization, each clamp recorded as a
`clamped-polar-latitude` repair entry. Root cause: Cesium's
`EllipsoidRhumbLine` (used by polygon _outline_ geometry workers) is
undefined for pole-touching segments — heading/distance become NaN and
`positions.length = NaN * 3` throws
`RangeError: Failed to set the 'length' property on 'Array'`, killing the
whole render loop. The clamp moves vertices ≈11 cm; visually invisible.
In `world_100.geojson` the only surviving polar ring is the Antarctica
boundary (raw data has 363 polar vertices in 63 features; the rest live in
rings already dropped as degenerate slivers).

## D-028 — Zero-area ring drop threshold

**Decision:** Rings whose |shoelace sum| < 2e-12 after dedup+closure are
dropped and reported as `dropped-degenerate-ring`. This subsumes the
fewer-than-3-distinct-points rule. Measured on the live dataset: degenerate
rings have |sum| ≤ 9.09e-13 (floating-point noise from collinear specks);
the smallest genuine ring is 7.28e-12 — the threshold sits inside that gap.
Consequence: 23 features whose every polygon is a polar/collinear speck are
now dropped **with a report** (was 440 kept / 0 dropped under the M3
criteria; now 417 kept / 23 dropped, all reported).

## D-029 — Cesium widgets.css must be imported by the app

**Decision:** `src/main.ts` imports
`cesium/Build/Cesium/Widgets/widgets.css`. The legacy page linked it via
`<link>`; the Vite port had dropped it, collapsing the viewer to the
canvas' intrinsic 300×150 instead of filling the viewport. Found during the
browser smoke test (globe rendered tiny in the corner).

## D-030 — Cesium pinned to 1.114.0 with a zip.js shim

**Decision:** `cesium` is pinned to `1.114.0` (the exact version the legacy
CDN viewer used) so rendering behavior stays comparable while the artifact
investigation is open. Cesium 1.114's `@cesium/engine@7.0.0` statically
imports `@zip.js/zip.js/lib/zip-no-worker.js`, a subpath that zip.js 2.8.34's
`exports` map no longer exposes; `vite.config.ts` aliases it to a one-line
empty-module shim (`shims/zip-no-worker.js`). KML import/export is not used
by the MVP, so the stub is inert. The build emits benign
`IMPORT_IS_UNDEFINED` rollup warnings for this stub — accepted noise, not
suppressed.

## D-031 — Milestone 0 re-execution policy

**Decision:** Per CEO instruction, the milestone workflow was re-run from
scratch ignoring prior uncommitted work-in-progress; bootstrap files were
verified (not trusted) and debris (`temp_*.json` experiment outputs)
removed. Verified fixes from the interrupted session (Cesium pin + shim,
degenerate-ring work) were kept only after independent verification:
typecheck, 33 unit tests, production build, and browser smoke tests of dev,
preview, and token-less builds.

## D-032 — Self-intersection diagnostic scope

**Decision:** `checkSelfIntersection` in `src/geojson/diagnostics.ts` flags
only _proper_ segment crossings (strict orientation test, shared endpoints
and collinear touches ignored). Result on the live dataset: **0 proper
crossings** — so the classic bowtie hypothesis is dead. The actual artifact
class is **self-touching retracing rings**: 297 of 741 rings revisit one of
their own vertices (out-and-back digitisation of small islands/coastal
spikes). Cesium triangulates these into the wedge/streak artifacts visible
in the Mediterranean close-up (Alps/Adriatic wedge). Repair strategy is
pending CEO review: (a) split retracing rings into simple parts, (b) drop
self-touching rings with report, (c) offline preprocessing with
provenance. The diagnostic ships as a regression guard either way.

## D-033 — Dev-only viewer test hook

**Decision:** `createViewer` exposes `window.__historyAtlasViewer` in dev
bundles only (`import.meta.env.DEV`), typed via a narrow cast, never read
by app code, dead-code-eliminated in production. Purpose: deterministic
camera positioning for browser smoke tests. Note: the browser tool's
`page.evaluate` runs in an isolated world — main-world globals must be
reached via injected `<script>` tags writing results to DOM attributes.
