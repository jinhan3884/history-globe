# History Atlas — Project Alexandria

> **History has coordinates.**

Project Alexandria is the internal codename for **History Atlas**, a historical platform that organizes human history across **time, space, and relationships**.

- Public domain: `historyatlas.net`
- First application: History Globe
- Core long-term asset: History Data Hub
- Initial go-to-market user: history YouTubers and other history creators
- Platform identity: a history platform for everyone

## Current state

The repository begins with an existing Cesium proof of concept:

- `legacy/index.html`
- `data/historical-basemaps/world_100.geojson`

The legacy viewer already loads a 440-feature `MultiPolygon` GeoJSON and displays hover names. It also exhibits occasional polygon triangulation artifacts. The first development task is to turn this proof of concept into a small, deployable MVP without overengineering.

## MVP principle

**Think in decades. Build in days.**

The first public release should let a visitor:

1. Open a historical globe.
2. See one historical world dataset.
3. Hover or click an area and see its name.
4. Share the page.
5. Use it reliably on desktop and mobile.

Timeline switching, downloads, creator exports, AI, API, and the full Data Hub come after launch unless a minimal version is needed for the first release.

## Start with OpenCode

1. Open a terminal in this repository.
2. Start OpenCode.
3. Read `AGENTS.md`, `PLAN.md`, and `docs/MVP_SPEC.md`.
4. Switch to **Plan** agent and paste the prompt in `OPENCODE_START_PROMPT.md`.
5. Review the proposed plan.
6. Switch to **Build** agent only after the plan is approved.
7. Execute one milestone at a time.
8. After every milestone, update `PLAN.md`, `docs/DECISION_LOG.md`, and `docs/DAILY_LOG.md`.

## Important

Do not rewrite everything at once. Preserve the working proof of concept until the replacement passes smoke tests.
