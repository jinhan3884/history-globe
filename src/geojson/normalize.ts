import type { Feature, FeatureCollection, Position } from './types';
import { UNNAMED_LABEL } from './types';
import type { FeatureRepairReport, RepairEntry, RepairReport } from './report';
import { summariseRepairs } from './report';

/**
 * Conservative geometry normalisation for the History Atlas MVP.
 *
 * Input  : a `FeatureCollection` that has already passed M1 structural
 *          validation and ideally M2 diagnostics.
 * Output : a *new* `FeatureCollection` with safe transformations applied
 *          plus a `RepairReport` recording every action taken.
 *
 * The input is never mutated. The output is safe to hand to Cesium.
 *
 * Transformations performed here, all reported:
 *   1. Drop positions whose lon/lat are non-finite.
 *   2. Remove consecutive duplicate points in a ring.
 *   3. Close any ring whose first/last point differ.
 *   4. Drop rings that still have fewer than 4 positions after steps 1–3.
 *   5. Normalise winding: outer → CCW, hole → CW (RFC 7946 right-hand rule).
 *
 * We deliberately do NOT:
 *   - split polygons at the antimeridian (dateline artifacts — M4),
 *   - repair self-intersecting rings (M4),
 *   - "wrap" longitudes like 190 into -170 (out of scope for MVP),
 *   - drop features silently — every dropped polygon or feature is reported.
 */

const MIN_RING_POINTS = 4; // 3 distinct + closure
const CLOSURE_TOLERANCE = 1e-9;
/**
 * Latitudes are clamped to ±(90° − this epsilon). A vertex exactly at a
 * pole makes Cesium's `EllipsoidRhumbLine` undefined (heading/distance NaN),
 * which crashes outline geometry workers with
 * `RangeError: Failed to set the 'length' property on 'Array'`. The clamp is
 * ≈11 cm on the WGS84 ellipsoid — visually invisible, geometrically safe.
 */
const MAX_ABS_LATITUDE = 90 - 1e-6;
/**
 * Minimum absolute shoelace area (square degrees) a closed ring must enclose
 * to be renderable. Rings below this threshold are collinear slivers or
 * floating-point noise (measured on world_100.geojson: degenerate rings have
 * |area| <= 9.1e-13 while the smallest genuine ring is 7.3e-12). Cesium's
 * `GeoJsonDataSource` triangulator throws
 * `RangeError: Failed to set the 'length' property on 'Array'` when it is
 * fed such a zero-surface ring, so we drop and report them.
 */
const MIN_RING_AREA = 2e-12;

export interface NormalizeResult {
  collection: FeatureCollection;
  report: RepairReport;
}

interface NormalizedFeature {
  report: FeatureRepairReport;
  /** New feature carried out alongside its report. Undefined when not kept. */
  feature?: Feature;
}

export function normalizeFeatureCollection(
  input: FeatureCollection,
): NormalizeResult {
  const results: NormalizedFeature[] = input.features.map((feature, index) =>
    normalizeFeature(feature, index),
  );

  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: results
      .filter((r) => r.feature !== undefined)
      .map((r) => r.feature!),
  };
  const report = summariseRepairs(results.map((r) => r.report));
  return { collection, report };
}

function normalizeFeature(feature: Feature, index: number): NormalizedFeature {
  const displayName = resolveDisplayName(feature);
  const entries: RepairEntry[] = [];

  const geom = feature.geometry;
  const polygonsInput =
    geom.type === 'MultiPolygon'
      ? (geom.coordinates as Position[][][])
      : [geom.coordinates as Position[][]];

  const polygonsOut: Position[][][] = [];

  polygonsInput.forEach((polygon, pIdx) => {
    const ringsOut: Position[][] = [];

    polygon.forEach((ring, rIdx) => {
      const isOuter = rIdx === 0;
      const ringPath = (i: number) =>
        `polygon[${pIdx}].ring[${rIdx}].point[${i}]`;
      const ringId = `polygon[${pIdx}].ring[${rIdx}]`;

      let working = ring.map(copyPosition);

      working = removeNonFinite(working, ringPath, entries);
      working = clampPolarVertices(working, ringPath, entries);
      working = removeConsecutiveDuplicates(working, ringPath, entries);
      working = ensureClosed(working, ringId, entries);

      // Drop the ring if it has fewer than 4 stored positions (3 distinct +
      // closure). Cesium needs at least three distinct points.
      if (working.length < MIN_RING_POINTS) {
        entries.push({
          code: 'dropped-degenerate-ring',
          path: ringId,
          detail: `had ${working.length} positions after dedup+closure; minimum is ${MIN_RING_POINTS}.`,
        });
        return;
      }

      // Drop rings that enclose no surface (collinear slivers, numerical
      // noise). This subsumes the fewer-than-3-distinct-points case, since
      // any ring with < 3 distinct points has zero shoelace area.
      const ringArea = Math.abs(signedArea(working));
      if (ringArea < MIN_RING_AREA) {
        entries.push({
          code: 'dropped-degenerate-ring',
          path: ringId,
          detail: `encloses no surface after dedup+closure (|signed area| ${ringArea.toExponential(2)} < ${MIN_RING_AREA}); ring is degenerate.`,
        });
        return;
      }

      working = normalizeWinding(working, isOuter, ringId, entries);
      ringsOut.push(working);
    });

    if (ringsOut.length === 0) {
      entries.push({
        code: 'dropped-degenerate-polygon',
        path: `polygon[${pIdx}]`,
        detail: 'no valid rings remained after normalisation.',
      });
      return;
    }
    // A polygon with no outer ring is not representable; if the first ring
    // was dropped we already counted it above — drop the polygon.
    if (ringsOut[0]!.length < MIN_RING_POINTS) {
      entries.push({
        code: 'dropped-degenerate-polygon',
        path: `polygon[${pIdx}]`,
        detail: 'outer ring dropped; polygon has no outer boundary.',
      });
      return;
    }

    polygonsOut.push(ringsOut);
  });

  if (polygonsOut.length === 0) {
    entries.push({
      code: 'dropped-feature-no-polygons',
      path: `feature[${index}]`,
      detail: 'all polygons were dropped during normalisation.',
    });
    return {
      report: {
        featureIndex: index,
        displayName,
        kept: false,
        entries,
      },
    };
  }

  const newGeometry =
    geom.type === 'MultiPolygon'
      ? { type: 'MultiPolygon' as const, coordinates: polygonsOut }
      : { type: 'Polygon' as const, coordinates: polygonsOut[0]! };

  const newFeature: Feature = {
    type: 'Feature',
    geometry: newGeometry,
    properties: { ...feature.properties },
  };

  return {
    report: {
      featureIndex: index,
      displayName,
      kept: true,
      entries,
    },
    feature: newFeature,
  };
}

function resolveDisplayName(feature: Feature): string {
  const name = feature.properties.NAME;
  return typeof name === 'string' && name.length > 0 ? name : UNNAMED_LABEL;
}

/**
 * Clamp any latitude at or beyond ±90° to ±MAX_ABS_LATITUDE. Cesium's
 * `EllipsoidRhumbLine` (used by polygon outline geometry) is undefined for
 * pole vertices and yields NaN distances that crash the geometry workers.
 * Every clamp is recorded as a `clamped-polar-latitude` repair entry.
 */
function clampPolarVertices(
  ring: Position[],
  ringPath: (i: number) => string,
  entries: RepairEntry[],
): Position[] {
  let clamped = false;
  const out = ring.map((p, i): Position => {
    if (Math.abs(p[1]) <= MAX_ABS_LATITUDE) return p;
    clamped = true;
    const lat = p[1] > 0 ? MAX_ABS_LATITUDE : -MAX_ABS_LATITUDE;
    entries.push({
      code: 'clamped-polar-latitude',
      path: ringPath(i),
      detail: `latitude ${p[1]} clamped to ${lat}; rhumb subdivision is undefined for pole vertices.`,
    });
    return [p[0], lat];
  });
  return clamped ? out : ring;
}

function copyPosition(p: Position): Position {
  return p.length === 3 ? [p[0], p[1], p[2]] : [p[0], p[1]];
}

function removeNonFinite(
  ring: Position[],
  ringPath: (i: number) => string,
  entries: RepairEntry[],
): Position[] {
  const out: Position[] = [];
  ring.forEach((p, i) => {
    if (p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      entries.push({
        code: 'removed-non-finite-coord',
        path: ringPath(i),
        detail: `coord = [${p[0]}, ${p[1]}]`,
      });
      return;
    }
    out.push(p);
  });
  return out;
}

function removeConsecutiveDuplicates(
  ring: Position[],
  ringPath: (i: number) => string,
  entries: RepairEntry[],
): Position[] {
  if (ring.length <= 1) return ring;
  const out: Position[] = [ring[0]!];
  for (let i = 1; i < ring.length; i++) {
    const prev = out[out.length - 1]!;
    const curr = ring[i]!;
    if (prev[0] === curr[0] && prev[1] === curr[1]) {
      entries.push({
        code: 'removed-duplicate-point',
        path: ringPath(i),
        detail: `duplicate of ${ringPath(i - 1)} = [${curr[0]}, ${curr[1]}]`,
      });
      continue;
    }
    out.push(curr);
  }
  return out;
}

function ensureClosed(
  ring: Position[],
  ringId: string,
  entries: RepairEntry[],
): Position[] {
  if (ring.length < 2) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (
    Math.abs(first[0] - last[0]) <= CLOSURE_TOLERANCE &&
    Math.abs(first[1] - last[1]) <= CLOSURE_TOLERANCE
  ) {
    return ring;
  }
  entries.push({
    code: 'closed-ring',
    path: ringId,
    detail: `appended [${first[0]}, ${first[1]}] to close`,
  });
  return [...ring, copyPosition(first)];
}

/** Shoelace sum; > 0 ⇒ Clockwise, < 0 ⇒ Counter-Clockwise. */
function signedArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    sum += (b[0] - a[0]) * (b[1] + a[1]);
  }
  return sum;
}

function normalizeWinding(
  ring: Position[],
  isOuter: boolean,
  ringId: string,
  entries: RepairEntry[],
): Position[] {
  const area = signedArea(ring);
  // Signed-area sign discriminates winding direction. We only short-circuit
  // when the area is *exactly* zero (numerically indistinguishable), not on
  // a coarse tolerance — a self-intersecting ring can have a tiny-but-signed
  // area (e.g. 3e-10) whose sign is still meaningful for choosing which
  // direction to present to the renderer.
  if (area === 0) return ring;
  const isCw = area > 0;
  if (isOuter && isCw) {
    entries.push({
      code: 'rewound-outer-ring',
      path: ringId,
      detail: 'CW ➝ CCW per RFC 7946',
    });
    return ring.toReversed();
  }
  if (!isOuter && !isCw) {
    entries.push({
      code: 'rewound-hole-ring',
      path: ringId,
      detail: 'CCW ➝ CW per RFC 7946',
    });
    return ring.toReversed();
  }
  return ring;
}
