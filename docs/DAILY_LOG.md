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
