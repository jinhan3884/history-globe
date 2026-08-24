import type { Feature, FeatureCollection, Geometry, Position } from './types';
import { UNNAMED_LABEL } from './types';
import type {
  DiagnosticIssue,
  FeatureReport,
  DiagnosticsReport,
} from './report';
import { summarise } from './report';

/**
 * Deterministic per-feature diagnostics.
 *
 * This module never mutates the source `FeatureCollection`. Every issue is
 * recorded with a stable `code` and an optional coordinate-tree `path` so a
 * later normalizer (M3) can act on the same coordinates it diagnoses here
 * without ambiguity. The known artifact correlates we test for:
 *
 *  - non-finite coordinates        (`coord-non-finite`)   error
 *  - longitude outside [-180,180] (`lon-out-of-range`)   error
 *  - latitude outside [-90, 90]   (`lat-out-of-range`)   error
 *  - ring with fewer than 4 pos.  (`ring-degenerate`)    error
 *  - ring not closed              (`ring-open`)          error
 *  - consecutive duplicate point (`duplicate-point`)    warning
 *  - outer ring winding CCW       (`winding-ccw-outer`)  warning
 *  - hole winding CW              (`winding-cw-hole`)    warning
 *  - longitude jump >= 180°       (`lon-jump`)          warning
 *
 * (RFC 7946 recommends right-hand rule; many legacy historical datasets use
 * the opposite winding. We flag the deviation rather than silently flipping,
 * which silently flipping is reserved for M3 conservative normalization.)
 */

const MIN_RING_POINTS = 4; // first + last must repeat; 3 distinct + closure
const CLOSURE_TOLERANCE = 1e-9;

export function diagnoseFeatureCollection(
  collection: FeatureCollection,
): DiagnosticsReport {
  const features = collection.features.map((feature, index) =>
    diagnoseFeature(feature, index),
  );
  return {
    summary: summarise(features),
    features,
  };
}

function diagnoseFeature(feature: Feature, index: number): FeatureReport {
  const displayName = resolveDisplayName(feature);
  const polygons = flattenPolygons(feature.geometry);

  let ringCount = 0;
  let positionCount = 0;
  const issues: DiagnosticIssue[] = [];

  polygons.forEach((polygon, pIdx) => {
    polygon.forEach((ring, rIdx) => {
      ringCount += 1;
      positionCount += ring.length;
      const ringPath = (pointIdx: number) =>
        `polygon[${pIdx}].ring[${rIdx}].point[${pointIdx}]`;

      ring.forEach((point, pointIdx) => {
        checkPoint(point, pointIdx, ringPath, issues);
      });

      checkRingClosure(ring, pIdx, rIdx, issues);
      checkRingSize(ring, pIdx, rIdx, issues);
      checkConsecutiveDuplicates(ring, pIdx, rIdx, issues);
      checkLongitudeJumps(ring, pIdx, rIdx, issues);
      checkWinding(ring, pIdx, rIdx, rIdx === 0, issues);
      checkSelfIntersection(ring, pIdx, rIdx, issues);
    });
  });

  return {
    featureIndex: index,
    displayName,
    geometryType: feature.geometry.type,
    polygonCount: polygons.length,
    ringCount,
    positionCount,
    issues,
  };
}

function resolveDisplayName(feature: Feature): string {
  const name = feature.properties.NAME;
  if (typeof name === 'string' && name.length > 0) return name;
  return UNNAMED_LABEL;
}

/**
 * Reduces a `MultiPolygon` or `Polygon` to a uniform array of polygons so
 * downstream checks share one code path.
 */
function flattenPolygons(geometry: Geometry): Position[][][] {
  const coords = geometry.coordinates as unknown;
  if (geometry.type === 'MultiPolygon') {
    return coords as Position[][][];
  }
  return [coords as Position[][]];
}

function checkPoint(
  point: Position,
  pointIdx: number,
  ringPath: (i: number) => string,
  issues: DiagnosticIssue[],
): void {
  if (!Array.isArray(point) || point.length < 2) {
    issues.push({
      severity: 'error',
      code: 'coord-malformed',
      message: `Coordinate at ${ringPath(pointIdx)} is not a [lon,lat] pair.`,
      path: ringPath(pointIdx),
    });
    return;
  }
  const [lon, lat] = point;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    issues.push({
      severity: 'error',
      code: 'coord-non-finite',
      message: `Non-finite coordinate at ${ringPath(pointIdx)} = [${lon}, ${lat}].`,
      path: ringPath(pointIdx),
    });
    return;
  }
  if (lon < -180 || lon > 180) {
    issues.push({
      severity: 'error',
      code: 'lon-out-of-range',
      message: `Longitude ${lon} at ${ringPath(pointIdx)} is outside [-180, 180].`,
      path: ringPath(pointIdx),
    });
  }
  if (lat < -90 || lat > 90) {
    issues.push({
      severity: 'error',
      code: 'lat-out-of-range',
      message: `Latitude ${lat} at ${ringPath(pointIdx)} is outside [-90, 90].`,
      path: ringPath(pointIdx),
    });
  }
}

function checkRingSize(
  ring: Position[],
  pIdx: number,
  rIdx: number,
  issues: DiagnosticIssue[],
): void {
  if (ring.length < MIN_RING_POINTS) {
    issues.push({
      severity: 'error',
      code: 'ring-degenerate',
      message: `polygon[${pIdx}].ring[${rIdx}] has ${ring.length} positions; minimum is ${MIN_RING_POINTS} (3 distinct + closure).`,
      path: `polygon[${pIdx}].ring[${rIdx}]`,
    });
  }
}

function checkRingClosure(
  ring: Position[],
  pIdx: number,
  rIdx: number,
  issues: DiagnosticIssue[],
): void {
  if (ring.length < 2) return; // degenerate case is already reported above
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first.length < 2 || last.length < 2) return;
  const dLon = Math.abs(first[0] - last[0]);
  const dLat = Math.abs(first[1] - last[1]);
  if (dLon > CLOSURE_TOLERANCE || dLat > CLOSURE_TOLERANCE) {
    issues.push({
      severity: 'error',
      code: 'ring-open',
      message: `polygon[${pIdx}].ring[${rIdx}] is not closed (first=${first[0]},${first[1]}; last=${last[0]},${last[1]}).`,
      path: `polygon[${pIdx}].ring[${rIdx}]`,
    });
  }
}

function checkConsecutiveDuplicates(
  ring: Position[],
  pIdx: number,
  rIdx: number,
  issues: DiagnosticIssue[],
): void {
  for (let i = 1; i < ring.length; i++) {
    const prev = ring[i - 1];
    const curr = ring[i];
    if (!prev || !curr || prev.length < 2 || curr.length < 2) continue;
    if (
      prev[0] === curr[0] &&
      prev[1] === curr[1] &&
      Number.isFinite(prev[0]) &&
      Number.isFinite(prev[1])
    ) {
      issues.push({
        severity: 'warning',
        code: 'duplicate-point',
        message: `Consecutive duplicate point at polygon[${pIdx}].ring[${rIdx}].point[${i}] = [${curr[0]}, ${curr[1]}].`,
        path: `polygon[${pIdx}].ring[${rIdx}].point[${i}]`,
      });
    }
  }
}

function checkLongitudeJumps(
  ring: Position[],
  pIdx: number,
  rIdx: number,
  issues: DiagnosticIssue[],
): void {
  for (let i = 1; i < ring.length; i++) {
    const prev = ring[i - 1];
    const curr = ring[i];
    if (!prev || !curr || prev.length < 2 || curr.length < 2) continue;
    if (!Number.isFinite(prev[0]) || !Number.isFinite(curr[0])) continue;
    const d = Math.abs(curr[0] - prev[0]);
    if (d >= 180) {
      issues.push({
        severity: 'warning',
        code: 'lon-jump',
        message: `Longitude jump of ${d.toFixed(2)}° at polygon[${pIdx}].ring[${rIdx}].point[${i}] ([${prev[0]} ➝ ${curr[0]}]); suspected dateline or self-intersection.`,
        path: `polygon[${pIdx}].ring[${rIdx}].point[${i}]`,
      });
    }
  }
}

/**
 * Shoelace signed area; positive in Counter-Clockwise (CCW) orientation.
 * Per RFC 7946, outer rings should be CCW and holes CW. We flag deviations
 * but do not flip; flipping is M3.
 */
function checkWinding(
  ring: Position[],
  pIdx: number,
  rIdx: number,
  isOuter: boolean,
  issues: DiagnosticIssue[],
): void {
  if (ring.length < MIN_RING_POINTS) return;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    if (!Number.isFinite(a[0]) || !Number.isFinite(b[1])) continue;
    sum += (b[0] - a[0]) * (b[1] + a[1]);
  }
  // sum > 0  => CW; sum < 0 => CCW (note sign convention used by shoelace
  // here matches the "xN * yNorS" form used widely in mapping libraries).
  const isCw = sum > 0;
  const isCcw = sum < 0;
  if (isOuter && isCw) {
    issues.push({
      severity: 'warning',
      code: 'winding-cw-outer',
      message: `polygon[${pIdx}].ring[${rIdx}] (outer) is clockwise; RFC 7946 recommends CCW.`,
      path: `polygon[${pIdx}].ring[${rIdx}]`,
    });
  } else if (!isOuter && isCcw) {
    issues.push({
      severity: 'warning',
      code: 'winding-ccw-hole',
      message: `polygon[${pIdx}].ring[${rIdx}] (hole) is CCW; RFC 7946 recommends CW for holes.`,
      path: `polygon[${pIdx}].ring[${rIdx}]`,
    });
  }
}

/**
 * Flags rings that properly cross themselves (bowtie / figure-eight shapes).
 * Cesium triangulates such rings into long spike/wedge artifacts, which is
 * the visually confirmed artifact class of M4. Only *proper* crossings are
 * flagged: shared endpoints, collinear touches, and duplicate points are
 * endemic to hand-digitised borders and are benign.
 */
function checkSelfIntersection(
  ring: Position[],
  pIdx: number,
  rIdx: number,
  issues: DiagnosticIssue[],
): void {
  if (ring.length < MIN_RING_POINTS) return;
  const n = ring.length - 1; // closed ring: last == first
  for (let i = 0; i < n - 1; i++) {
    const a1 = ring[i];
    const a2 = ring[i + 1];
    if (!a1 || !a2) continue;
    for (let j = i + 2; j < n; j++) {
      // Skip the wrap-around pair (segment 0 shares its endpoint with the
      // closing segment): touching at a shared vertex is not a crossing.
      if (i === 0 && j === n - 1) continue;
      const b1 = ring[j];
      const b2 = ring[j + 1];
      if (!b1 || !b2) continue;
      if (segmentsProperlyCross(a1, a2, b1, b2)) {
        issues.push({
          severity: 'warning',
          code: 'ring-self-intersection',
          message: `polygon[${pIdx}].ring[${rIdx}] crosses itself: segment ${i}->${i + 1} × segment ${j}->${j + 1}.`,
          path: `polygon[${pIdx}].ring[${rIdx}].point[${i + 1}]`,
        });
        return; // one report per ring is enough for triage
      }
    }
  }
}

/** Orientation cross product of (o→a) × (o→b). */
function orientationCross(o: Position, a: Position, b: Position): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** True when segment a1→a2 strictly crosses segment b1→b2. */
function segmentsProperlyCross(
  a1: Position,
  a2: Position,
  b1: Position,
  b2: Position,
): boolean {
  const d1 = orientationCross(b1, b2, a1);
  const d2 = orientationCross(b1, b2, a2);
  const d3 = orientationCross(a1, a2, b1);
  const d4 = orientationCross(a1, a2, b2);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}
