# Deployment — Cloudflare Pages

Target: static hosting of the production build at `historyatlas.net`.

## Prerequisites

- A Cloudflare account with access to the `historyatlas.net` zone.
- `VITE_CESIUM_ION_TOKEN` value (Ion dashboard). Rotate the legacy token
  first if not already done (see `docs/DECISION_LOG.md` D-015) — it was
  exposed historically.
- Node 20+ locally for the build.

## Build

```bash
npm install
npm run build     # emits dist/ (index.html, assets/, cesium/, data/, public files)
npm run preview   # local smoke test on http://localhost:4173
```

The build is fully static; no server runtime is required.

## Create the Pages project

1. Cloudflare dashboard → Workers & Pages → Create → Pages → **Upload
   assets** or connect the Git repository (recommended: Git integration,
   production branch `main`).
2. Build settings:
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable (Production and Preview):
     `VITE_CESIUM_ION_TOKEN = <token>` — set as **encrypted**; never
     commit it. The app renders without it (solid-color base globe), but
     satellite imagery requires it.
3. Deploy. The `*.pages.dev` URL is live immediately.

## Custom domain

1. Pages project → Custom domains → Set up a custom domain →
   `historyatlas.net`, then add `www.historyatlas.net` → redirect to apex.
2. If the zone is on Cloudflare, both DNS records are created automatically.
   HTTPS certificates are issued automatically.

To redirect `www.historyatlas.net` → `historyatlas.net`:

1. Cloudflare dashboard → **Rules** → **Bulk Redirects**
2. Create a bulk redirect rule: source `www.historyatlas.net/*` → target
   `https://historyatlas.net/` + path, status 301, preserve query string.

## Caching

`public/_headers` (copied verbatim into `dist/`) sets:

- `/cesium/*` — `max-age=31536000, immutable` (versioned with the pinned
  Cesium dependency; content never changes without a version bump).
- `/data/*` — `max-age=3600` (dataset updates should propagate within an
  hour).

Hashed bundle files under `/assets/` get immutable caching from Pages
defaults — no override needed.

## Rollback

- Git integration: revert the commit on `main` and let Pages rebuild.
- Upload mode: redeploy a previous `dist/` from the project's deployment
  history (each deployment is retained and restorable in one click).

## Pre-launch checklist (CEO actions)

- [ ] Rotate the Cesium Ion token and set it as the Pages env var.
- [ ] Confirm the dataset license line in the About panel
      (currently CC-BY 4.0 / aourednik historical-basemaps — verify).
- [ ] Attach `historyatlas.net` + `www` and verify HTTPS.
- [ ] Decide on analytics (flag `VITE_ANALYTICS_ID` exists, provider not
      wired).
