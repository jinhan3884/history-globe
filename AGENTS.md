# AGENTS.md — Project Alexandria

## Product context

This repository builds **History Atlas** (`historyatlas.net`), internally called **Project Alexandria**.

Core statement:

> History has coordinates.

Long-term vision:

- Organize human history across time, space, and relationships.
- Build a reusable History Data Hub.
- Use History Globe as the first public application.
- Eventually support search, timelines, creator tools, AI explanations, downloads, and APIs.

Current commercial strategy:

- Launch the smallest credible public MVP quickly.
- Initial go-to-market segment: history YouTubers and creators.
- Platform identity remains broad: the service is for anyone interested in history.
- Passive-income potential matters, but monetization must not delay the first launch.

## Current repository facts

- `legacy/index.html` is the working Cesium proof of concept.
- `data/historical-basemaps/world_100.geojson` is the current dataset.
- The GeoJSON is a `FeatureCollection` containing 440 `MultiPolygon` features.
- Existing properties include `NAME`, `ABBREVN`, `SUBJECTO`, `BORDERPRECISION`, and `PARTOF`.
- The current viewer loads CesiumJS 1.114 from CDN.
- A visible issue is occasional long triangular/internal polygon artifacts.
- The existing Cesium Ion access token in the legacy HTML must be treated as exposed. Do not commit or reuse it as a secret. Replace it with environment-based configuration or use a setup that does not require a committed token.

## Development priorities

Priority order:

1. Keep a working viewer.
2. Make the project locally reproducible.
3. Remove exposed credentials.
4. Diagnose and mitigate polygon artifacts.
5. Make the page deployable.
6. Improve usability enough for public launch.
7. Only then add timeline/data-registry features.

Do not prioritize:

- A perfect universal geometry engine.
- A backend.
- Authentication.
- Payments.
- AI or RAG.
- 4K/MP4 export.
- A large dataset registry.
- Premature microservices.
- Premature Web Workers.
- A custom spatial database.

## Architecture constraints

- Use TypeScript.
- Prefer Vite for a small static web app.
- Keep Cesium-specific rendering separate from generic GeoJSON normalization.
- Keep data normalization as pure functions where practical.
- Preserve source attribution and license metadata.
- Do not silently discard features. Every repair or skip must be reported.
- Any geometry transformation must retain original feature properties.
- Do not claim that an arbitrary invalid GeoJSON can always be repaired. Use deterministic fallbacks and clear diagnostics.
- Prefer incremental refactoring from `legacy/index.html`.
- Avoid a large framework unless it provides immediate MVP value. Vanilla TypeScript is preferred initially.
- Do not add React merely for a globe with a small control panel.

## Required workflow

For each milestone:

1. Inspect the relevant files.
2. State assumptions.
3. Propose a concise implementation plan.
4. Implement only the approved milestone.
5. Run formatting, type checking, tests, and build.
6. Perform a browser smoke test where possible.
7. Report exactly what changed.
8. Update:
   - `PLAN.md`
   - `docs/DECISION_LOG.md`
   - `docs/DAILY_LOG.md`
9. Stop at the milestone boundary and ask for review.

## Quality rules

- No TypeScript `any` unless justified in a comment.
- No secrets in source control.
- No swallowed exceptions.
- User-facing load failures must be visible, not only logged.
- Geometry repair statistics must be surfaced in development mode.
- Keep functions small and named by responsibility.
- Add tests around coordinate cleaning, ring closure, duplicate removal, and feature preservation.
- Avoid broad refactors unrelated to the active milestone.
- Do not replace the current dataset with fabricated data.
- Do not invent historical facts or entity names.

## MVP acceptance criteria

The MVP is ready to deploy when:

- `npm install`, `npm run dev`, `npm run test`, and `npm run build` succeed.
- The globe renders without a committed Ion token.
- `world_100.geojson` loads successfully.
- A user can hover or click a feature and see a safe display name.
- Invalid or missing names use a neutral fallback.
- The known polygon artifact is either eliminated or isolated with a documented fallback.
- A loading state and visible error state exist.
- The page works at common desktop widths and a mobile viewport.
- Deployment instructions for Cloudflare Pages are documented.
- The production build contains no exposed private keys or tokens.

## Communication style

Be factual and practical. Distinguish:

- confirmed facts from files,
- hypotheses,
- implemented fixes,
- remaining risks.

Do not declare a bug solved merely because the build passes.
