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
