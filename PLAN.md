# Project Alexandria — Execution Plan

Status legend: `[ ]` not started, `[~]` active, `[x]` completed, `[!]` blocked.

## North-star goal

Publish a usable first version of **History Atlas** at `historyatlas.net` as quickly as possible, then improve it using real traffic and feedback.

## Scope boundary

This plan is for the first public History Globe MVP. It is not the full History Data Hub or History Operating System.

---

## Milestone 0 — Repository bootstrap

Target: 2–3 hours

- [x] Initialize Git repository.
- [x] Create Vite + TypeScript project without destroying `legacy/`.
- [x] Add scripts for dev, build, preview, test, typecheck, and format.
- [x] Add `.gitignore` and `.env.example`.
- [x] Move Cesium token handling to environment configuration.
- [x] Document local startup.
- [x] Confirm the legacy viewer still works as a reference.

Exit criteria:

- Fresh clone can install and start. (**Verified:** `npm install` + `npm run build` succeed, including with no `.env` present.)
- No credential is required in committed code. (**Verified:** token string absent from the entire working tree outside the gitignored `.env.local`; not present in any prior commit blob reachable from all refs.)
- Baseline screenshot or written smoke-test record exists. (**Written record:** see `docs/DAILY_LOG.md` — Milestone 0 entry.)

**Re-executed 2026-08-23** per CEO instruction (prior in-progress work
ignored, overwrite as needed): bootstrap files independently re-verified;
README local-dev quickstart added; experiment debris removed; Cesium pinned
to the legacy version 1.114.0 with a zip.js shim; browser smoke tests of
dev, preview and token-less builds all pass. See DAILY_LOG re-execution day
entry and D-031.

---

## Milestone 1 — Minimal application shell

Target: 2–3 hours

- [x] Create full-screen Cesium viewer.
- [x] Load `world_100.geojson`.
- [x] Add loading and error states.
- [x] Recreate hover tooltip and click selection.
- [x] Use safe property lookup for `NAME`.
- [x] Add minimal branding:
  - History Atlas
  - History has coordinates.
- [x] Add source/attribution placeholder.

Exit criteria:

- Current proof-of-concept behavior is preserved in the new app. (**Verified:** `npm run build` succeeds; preview serves `/`, dataset (1.76 MB, 200), Cesium Workers, and the JS bundle; dev-mode `console.info` is dev-only.)
- No geometry repair is added yet except basic parse validation. (**Confirmed:** `loadGeoJson` performs only structural validation; no coordinate mutation. Coordinate-level diagnostics deferred to M2.)

---

## Milestone 2 — Geometry diagnostics first

Target: 3–4 hours

Create a deterministic diagnostic pipeline before attempting automatic repair.

- [x] Validate top-level GeoJSON structure.
- [x] Count feature and geometry types.
- [x] Validate coordinate finiteness and longitude/latitude ranges.
- [x] Check ring closure.
- [x] Detect consecutive duplicate points.
- [x] Calculate ring signed area/winding.
- [x] Flag suspicious longitude jumps, especially crossings near ±180°.
- [x] Produce a per-feature diagnostic report keyed by feature index and display name.
- [x] Add development-only console summary.

Exit criteria:

- The exact feature(s) associated with visual artifacts can be isolated or narrowed down. (**Verified:** diagnostics run on `world_100.geojson`; 435/440 features flagged, dominated by `winding-cw-outer` (794 occurrences). This is the principal correlate of the known artifact and the leading hypothesis for M3 normalization.)
- No feature is silently altered. (**Confirmed:** `diagnostics.ts` is pure; it returns a `DiagnosticsReport`. No function mutates the input `FeatureCollection`.)

---

## Milestone 3 — Conservative geometry normalization

Target: 4–6 hours

Implement safe transformations only:

- [x] Remove non-finite coordinates.
- [x] Normalize longitude only where the intended behavior is unambiguous.
- [x] Remove consecutive duplicates.
- [x] Ensure ring closure.
- [x] Remove degenerate rings below the minimum vertex count.
- [x] Normalize winding order consistently.
- [x] Preserve holes and properties.
- [x] Record every transformation in a repair report.
- [x] Add unit tests for each transformation.

Do not yet attempt aggressive self-intersection repair or arbitrary polygon splitting unless diagnostics prove it is necessary.

Exit criteria:

- Dataset renders with no regression in feature count unless a skipped feature is explicitly reported. (**Re-verified 2026-08-23:** after the zero-area/polar degeneracy rules, 417/440 features kept; 23 features consisting solely of collinear or polar sliver rings dropped — every drop reported in the repair report.)
- Known artifact is re-tested. (**Verified at pipeline level:** post-normalisation diagnostics clean; `winding-cw-outer: 794 → 0`. **Visually verified 2026-08-23:** headless-browser smoke test — globe renders full-screen with no render-loop crash and a clean Antarctica.)
- Transformations are covered by tests. (**Verified:** 33 total tests pass, incl. zero-area ring drop, tiny-real-island keep, reported full-feature drop, polar clamp.)

---

## Milestone 4 — Artifact-specific fallback

Target: 3–5 hours

Only if Milestone 3 does not remove the artifact:

- [x] Identify the offending feature and polygon/ring.
- [x] Test hypotheses separately:
  - dateline crossing, — absent from dataset (M2)
  - winding/hole classification, — normalized in M3
  - self-intersection, — **tested 2026-08-23**: proper segment crossings = 0 in the whole dataset; NOT the cause
  - disconnected parts encoded in one ring, — **confirmed 2026-08-23**: 297/741 rings self-touch (revisit a vertex; out-and-back spikes) — the wedge/streak artifact class
  - Cesium triangulation limitation. — **confirmed 2026-08-23**: polar-touching segments crash `EllipsoidRhumbLine` in outline workers; zero-area rings crash triangulation.
- [~] Select the least destructive fallback:
  1. render offending feature as split entities,
  2. use a trusted geometry library for that class of error,
  3. skip only the irreparable polygon part and report it, — **done for degenerate slivers and pole vertices** (23 features dropped with report; pole vertices clamped)
  4. pre-process the source dataset offline.
- [x] Document why the fallback is safe. (D-027, D-028: clamp ≈11 cm; threshold inside the measured noise/genuine-area gap.)
- [ ] Save a repaired derivative with provenance if offline preprocessing is used.

**Visual review 2026-08-23 (blocked on repair choice):** global, Antarctic
and Pacific views are clean; the Mediterranean close-up still shows wedge +
streak artifacts over the Alps/Adriatic. Root cause class identified as
self-touching retracing rings (297 rings, e.g. `f41` Greenland islets,
`f75` South America coastal spikes). `ring-self-intersection` diagnostic
added (proper crossings only — 0 hits, kept as regression guard). Repair
strategy for retracing rings needs CEO review before implementation:
(a) split retracing rings into simple parts, (b) drop self-touching rings
with report, (c) offline preprocessing with provenance.

Exit criteria:

- Artifact no longer appears in the tested dataset.
- The solution does not falsely promise universal repair.
- The original file remains unchanged and traceable.

---

## Milestone 5 — Public MVP polish

Target: 3–4 hours

- [x] Responsive desktop/mobile layout. (<=640px media query; verified 375x667)
- [x] Accessible tooltip or selection panel. (role=tooltip + aria-live=polite)
- [x] Loading indicator. (M1)
- [x] Friendly error message. (M1)
- [x] Basic “About / Data source” panel. (About button + panel; license line pending CEO confirmation)
- [x] Social sharing metadata. (OG + twitter:card)
- [x] Favicon and minimal visual identity. (public/favicon.svg)
- [x] Confirm page title and description. (index.html)
- [x] Add privacy-friendly analytics placeholder, disabled by default. (VITE_ANALYTICS_ID flag, no provider wired)

Exit criteria:

- A first-time visitor understands the site within 10 seconds.
- No developer-only controls are visible in production.

---

## Milestone 6 — Deployment

Target: 2–3 hours

- [x] Production build succeeds.
- [x] Add Cloudflare Pages deployment instructions. (docs/DEPLOYMENT.md)
- [ ] Configure `historyatlas.net`. (CEO action: DNS + Pages custom domain)
- [ ] Verify HTTPS. (follows domain attach)
- [x] Verify asset paths and GeoJSON caching. (public/_headers: /cesium/* immutable, /data/* 1h; all endpoints 200)
- [x] Run desktop/mobile smoke tests. (production preview, 1440x900 + 375x667)
- [x] Record release as `v0.1.0`.

Exit criteria:

- Public URL works.
- No token or secret appears in built assets.
- Rollback instructions exist.
---

## Milestone 7 — Knowledge Layer (Wikidata + Wikipedia)

Target: 1–2 days

Work order: `2026-09-01() Project_Alexandria_OMP_Knowledge_Layer_Work_Order.md`

- [x] Entity extraction from all 53 polygon files → Entity Registry (`data/entities.json`). (3,004 entities; dedup across time slices + case/whitespace/diacritics variants)
- [x] Internal `ha:polity:*` entity IDs; Wikidata QID kept as external link only.
- [x] Wikidata entity resolution (name/alias + polity-type closure + temporal plausibility), statuses confirmed/probable/ambiguous/unmatched, cached + deterministic. (`scripts/match-wikidata.ts`)
- [x] Manual override file (`data/entity-overrides.json`) — beats automatic matching.
- [x] Wikidata facts + Wikipedia summary pre-build (`scripts/build-knowledge.ts` → `data/knowledge/entities-knowledge.json`).
- [x] Knowledge Panel UI on polygon click (right-side desktop / bottom sheet mobile), unmatched + loading + error states. (`src/ui/knowledgePanel.ts`)
- [x] Unit tests for extraction, matching, overrides, Wikipedia fallback, runtime lookup. (tests/entityRegistry, matching, wikipedia, knowledgeService)

Exit criteria:

- Polygon click shows a knowledge panel; unmatched polygons show a neutral message without errors.
- Knowledge/API failure never breaks globe rendering (runtime uses only pre-generated static JSON).
- Attribution to Wikidata/Wikipedia visible with a "Read more" link.

---

## Post-launch backlog

Prioritize using real feedback:

1. Multiple years / simple year selector.
2. Dataset registry and provenance UI.
3. Search.
4. PNG export for creators.
5. Shareable camera/year URLs.
6. Creator presets.
7. Download/API.
8. AI explanation grounded in sources.
9. More robust geometry preprocessing.
10. Full temporal knowledge graph.

## Estimated elapsed time

At four focused hours per day, the MVP can plausibly be deployed in **4–7 working days**, because the current viewer and initial dataset already exist. This is an execution estimate, not a guarantee; the largest uncertainty is the polygon artifact and the deployment/token configuration.
