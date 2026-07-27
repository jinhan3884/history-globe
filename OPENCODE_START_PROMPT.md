# OpenCode Start Prompt

You are the lead implementation agent for **History Atlas**, internally called **Project Alexandria**.

Before doing anything:

1. Read `AGENTS.md`.
2. Read `README.md`.
3. Read `PLAN.md`.
4. Read `docs/PRODUCT_ONE_PAGER.md`.
5. Read `docs/MVP_SPEC.md`.
6. Read `docs/ARCHITECTURE.md`.
7. Inspect `legacy/index.html`.
8. Inspect the structure and properties of `data/historical-basemaps/world_100.geojson`.
9. Do not edit any files while in Plan mode.

## Product context

- Domain: `historyatlas.net`
- Tagline: “History has coordinates.”
- Long-term vision: a platform organizing history through time, space, and relationships.
- Long-term asset: History Data Hub.
- First public product: History Globe.
- Initial acquisition segment: history YouTubers and creators.
- Platform audience: everyone interested in history.
- Business strategy: publish quickly, obtain traffic, and improve incrementally.

## Immediate goal

Turn the current single-file Cesium proof of concept into a small, maintainable, deployable MVP.

The legacy page already:

- initializes Cesium,
- loads `world_100.geojson`,
- applies a cyan translucent fill,
- displays feature names on hover,
- flies to the loaded data.

Known issues:

- an Ion access token is hard-coded and must be considered exposed;
- polygon triangulation artifacts appear in at least one area;
- coordinate cleaning is recursive but not topology-aware;
- the implementation is one HTML file;
- loading and error states are developer-oriented;
- deployment is not documented.

## Non-negotiable constraints

- Do not build the full History Data Hub now.
- Do not add a backend, authentication, payment, AI, React, or database.
- Do not promise that every arbitrary GeoJSON can be perfectly repaired.
- Do not discard features silently.
- Do not overwrite the original GeoJSON.
- Preserve original feature properties.
- Keep `legacy/index.html` as a reference until replacement acceptance tests pass.
- Use TypeScript and a minimal Vite static app.
- Separate generic GeoJSON logic from Cesium rendering.
- Remove secrets from committed source.
- Work one milestone at a time.
- Stop after each milestone for review.

## Your first task in Plan mode

Produce a repository-specific plan for **Milestone 0 only**.

The plan must include:

1. Exact files to create or modify.
2. Proposed package dependencies and why each is needed.
3. How Cesium will be initialized without committing a token.
4. How Cesium static assets will be served under Vite.
5. How the existing GeoJSON path will be handled.
6. Build, test, typecheck, and formatting commands.
7. Risks and rollback approach.
8. Verification steps.
9. What you will deliberately not do in this milestone.
10. Any ambiguity that genuinely requires CEO approval.

Do not implement yet.

After presenting the plan, wait for approval.

## After approval and switch to Build mode

Implement only Milestone 0.

Then:

- run all checks;
- show command results;
- summarize files changed;
- update `PLAN.md`, `docs/DECISION_LOG.md`, and `docs/DAILY_LOG.md`;
- state remaining risks;
- stop and request review before Milestone 1.
