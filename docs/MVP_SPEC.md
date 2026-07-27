# History Globe MVP Specification

## Objective

Deploy the smallest credible public product at `historyatlas.net`.

## User story

As a visitor, I can open a globe, inspect historical territories, and identify a named territory without installing GIS software.

## Included

- 3D globe.
- One historical GeoJSON dataset.
- Polygon fill.
- Hover tooltip and/or click details.
- Visible loading and failure states.
- Basic mobile support.
- Branding and source attribution.
- Static deployment.

## Excluded

- User accounts.
- Payments.
- AI chat.
- Full timeline animation.
- Multiple dataset catalog.
- Editing.
- Uploading arbitrary user files.
- MP4/4K export.
- Backend database.
- Universal geometry repair guarantee.

## Data

Initial dataset:

`data/historical-basemaps/world_100.geojson`

Observed facts:

- GeoJSON FeatureCollection.
- 440 features.
- All current features are MultiPolygon.
- `NAME` may be null.
- Current visual issue: internal triangular artifact(s) may occur.

## Functional acceptance tests

1. Page loads with no JavaScript error.
2. Globe is visible.
3. Dataset loading progress is visible.
4. At least one named feature can be hovered or clicked.
5. Null names display “Unknown / Unrecorded territory” or a similarly neutral label.
6. Data load failure displays a visible message.
7. Application does not contain a committed Cesium token.
8. Known artifact test area is visually checked.
9. Production build opens successfully from static hosting.
10. Mobile viewport remains usable.

## Non-functional requirements

- Keep initial bundle and architecture simple.
- No secret embedded in code.
- Preserve dataset properties.
- Record transformations.
- Document data source and license before public launch.
