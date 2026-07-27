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

- [ ] Remove non-finite coordinates.
- [ ] Normalize longitude only where the intended behavior is unambiguous.
- [ ] Remove consecutive duplicates.
- [ ] Ensure ring closure.
- [ ] Remove degenerate rings below the minimum vertex count.
- [ ] Normalize winding order consistently.
- [ ] Preserve holes and properties.
- [ ] Record every transformation in a repair report.
- [ ] Add unit tests for each transformation.

Do not yet attempt aggressive self-intersection repair or arbitrary polygon splitting unless diagnostics prove it is necessary.

Exit criteria:

- Dataset renders with no regression in feature count unless a skipped feature is explicitly reported.
- Known artifact is re-tested.
- Transformations are covered by tests.

---

## Milestone 4 — Artifact-specific fallback

Target: 3–5 hours

Only if Milestone 3 does not remove the artifact:

- [ ] Identify the offending feature and polygon/ring.
- [ ] Test hypotheses separately:
  - dateline crossing,
  - winding/hole classification,
  - self-intersection,
  - disconnected parts encoded in one ring,
  - Cesium triangulation limitation.
- [ ] Select the least destructive fallback:
  1. render offending feature as split entities,
  2. use a trusted geometry library for that class of error,
  3. skip only the irreparable polygon part and report it,
  4. pre-process the source dataset offline.
- [ ] Document why the fallback is safe.
- [ ] Save a repaired derivative with provenance if offline preprocessing is used.

Exit criteria:

- Artifact no longer appears in the tested dataset.
- The solution does not falsely promise universal repair.
- The original file remains unchanged and traceable.

---

## Milestone 5 — Public MVP polish

Target: 3–4 hours

- [ ] Responsive desktop/mobile layout.
- [ ] Accessible tooltip or selection panel.
- [ ] Loading indicator.
- [ ] Friendly error message.
- [ ] Basic “About / Data source” panel.
- [ ] Social sharing metadata.
- [ ] Favicon and minimal visual identity.
- [ ] Confirm page title and description.
- [ ] Add privacy-friendly analytics placeholder, disabled by default.

Exit criteria:

- A first-time visitor understands the site within 10 seconds.
- No developer-only controls are visible in production.

---

## Milestone 6 — Deployment

Target: 2–3 hours

- [ ] Production build succeeds.
- [ ] Add Cloudflare Pages deployment instructions.
- [ ] Configure `historyatlas.net`.
- [ ] Verify HTTPS.
- [ ] Verify asset paths and GeoJSON caching.
- [ ] Run desktop/mobile smoke tests.
- [ ] Record release as `v0.1.0`.

Exit criteria:

- Public URL works.
- No token or secret appears in built assets.
- Rollback instructions exist.

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
