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
 * Two non-adjacent vertices within this tolerance (≈1 cm) are the same
 * point: a self-touch. Measured jitter in world_100.geojson retracing
 * spikes is well under 1e-7 degrees; genuine distinct border vertices are
 * never this close.
 */
const SELF_TOUCH_TOLERANCE = 1e-7;

/**
 * Non-adjacent vertices closer than this (≈17 km) across a far-reaching
 * spur mark a "near-touching" blade: the boundary runs out and comes back
 * almost onto itself. Guarded excision (see healSelfTouchingRing) removes
 * the spur; small islands whose vertices are naturally close are protected
 * by the extent and area-ratio guards.
 */
const NEAR_TOUCH_TOLERANCE = 0.15;

/** A spur must reach at least this far (≈111 km) to be excised. */
const MIN_SPUR_EXTENT_DEG = 1.0;

/** A spur larger than this fraction of the kept loop is left alone. */
const MAX_SPUR_AREA_FRACTION = 0.1;

/** Bounded re-scan passes for `healSelfTouchingRing`. */
const MAX_HEAL_PASSES = 16;

/**
 * Segments longer than this (degrees, great-circle-ish chord length in
 * lon/lat space) are subdivided with linearly interpolated vertices.
 * Cesium interpolates long polygon edges along geodesics/rhumb lines before
 * triangulating; for coarse historical borders those interpolated 3D arcs
 * can cross other edges in 3D even when the lon/lat ring is simple, which
 * renders as huge translucent wedge artifacts. Capping segment length keeps
 * the rendered boundary on the ring.
 */
const MAX_SEGMENT_DEG = 2;

/**
 * Insert intermediate vertices so no segment exceeds `MAX_SEGMENT_DEG`.
 * Reported once per ring with the inserted-point count. Linear lon/lat
 * interpolation: at <= 2 deg the deviation from a geodesic is < ~0.5 km,
 * far below the dataset's own precision.
 */
function subdivideLongSegments(
  ring: Position[],
  ringId: string,
  entries: RepairEntry[],
): Position[] {
  let inserted = 0;
  const out: Position[] = [ring[0]!];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.ceil(d / MAX_SEGMENT_DEG);
    for (let s = 1; s < steps; s++) {
      out.push([
        a[0] + ((b[0] - a[0]) * s) / steps,
        a[1] + ((b[1] - a[1]) * s) / steps,
      ]);
      inserted++;
    }
    out.push([b[0], b[1]]);
  }
  if (inserted > 0) {
    entries.push({
      code: 'subdivided-long-segment',
      path: ringId,
      detail: `inserted ${inserted} interpolated vertices; longest segment exceeded ${MAX_SEGMENT_DEG} deg.`,
    });
    return out;
  }
  return ring;
}
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

/**
 * Minimum ring area as a fraction of the ring's lon/lat bounding-box area.
 * Rings below this ratio are "needles": paths that run out and back with a
 * negligible enclosed surface (measured on world_100.geojson — 363 rings
 * sit below 1e-4 with a 100x gap up to the next ring at ~1e-2). Cesium
 * renders such rings as long bright blade artifacts. Axis-aligned thin
 * rectangles that genuinely fill their bbox are unaffected (ratio ~1).
 */
const MIN_RING_FILL_RATIO = 1e-4;

/**
 * Rings that dip below this latitude have their Antarctic excursion trimmed.
 * A straight chord at LAT cap replaces the portion south of this parallel.
 */
const MAX_SOUTH_LAT = -60;

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
      working = healSelfTouchingRing(working, ringId, entries);

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

      // Needle test: a ring whose area is a vanishing fraction of its
      // bounding box is an out-and-back path, not a territory. Rendered,
      // such rings produce long bright blade artifacts.
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of working) {
        minX = Math.min(minX, p[0]!);
        maxX = Math.max(maxX, p[0]!);
        minY = Math.min(minY, p[1]!);
        maxY = Math.max(maxY, p[1]!);
      }
      const bboxArea = (maxX - minX) * (maxY - minY);
      const fillRatio = bboxArea > 0 ? ringArea / bboxArea : 0;
      if (fillRatio < MIN_RING_FILL_RATIO) {
        entries.push({
          code: 'dropped-needle-ring',
          path: ringId,
          detail: `area is ${fillRatio.toExponential(2)} of the bounding box (bbox ${(maxX - minX).toFixed(1)}x${(maxY - minY).toFixed(1)} deg, area ${ringArea.toExponential(2)} deg² < ${MIN_RING_FILL_RATIO}); ring is a needle.`,
        });
        return;
      }

      working = normalizeWinding(working, isOuter, ringId, entries);
      working = subdivideLongSegments(working, ringId, entries);
      working = trimAntarcticExcursion(working, ringId, entries);
      working = dropContinentScaleAntarctica(working, ringId, entries);
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

/**
 * Heal rings that revisit one of their own vertices ("out-and-back" spikes
 * from hand digitisation). Cesium triangulates such retracing paths into
 * large wedge/streak artifacts. At each self-touch the ring decomposes into
 * two closed loops sharing the touched vertex; measured on world_100.geojson
 * (296 touches) one loop always encloses ~zero surface, so we keep the
 * larger-area loop and excise the zero-surface one. Every excision is
 * reported. Re-scans until the ring is clean (bounded passes).
 */
function healSelfTouchingRing(
  ring: Position[],
  ringId: string,
  entries: RepairEntry[],
): Position[] {
  let working = ring;
  for (let pass = 0; pass < MAX_HEAL_PASSES; pass++) {
    const found = findSelfTouch(working);
    if (!found) return working;
    const [i, j, dist] = found;
    const n = working.length - 1; // closed: last == first
    // Loop A: ring[i..j]; Loop B: ring[j..n-1] + ring[0..i]. Both are closed
    // by the shared (or nearly shared) touched vertex.
    const loopA = working.slice(i, j + 1);
    const loopB = working.slice(j, n).concat(working.slice(0, i + 1));
    const areaA = Math.abs(signedArea(loopA));
    const areaB = Math.abs(signedArea(loopB));
    let keep = areaA >= areaB ? loopA : loopB;
    // The two loops share the touched vertex; if keep's last point is that
    // same vertex, drop the duplicate before re-closing.
    if (keep.length > 1) {
      const f = keep[0]!;
      const l = keep[keep.length - 1]!;
      if (
        Math.abs(f[0] - l[0]) <= SELF_TOUCH_TOLERANCE &&
        Math.abs(f[1] - l[1]) <= SELF_TOUCH_TOLERANCE
      ) {
        keep = keep.slice(0, -1);
      }
    }
    const excisedArea = Math.min(areaA, areaB);
    const keptArea = Math.max(areaA, areaB);
    if (dist > SELF_TOUCH_TOLERANCE) {
      // Near touch (not an exact retracing vertex). Only excise far-reaching
      // thin spurs: a close approach inside a small ring is that ring's own
      // scale (a tiny island), and two comparable lobes may be a genuine
      // figure-eight. Leaving them untouched is the conservative choice.
      let exMinX = Infinity;
      let exMaxX = -Infinity;
      let exMinY = Infinity;
      let exMaxY = -Infinity;
      const excised = areaA >= areaB ? loopB : loopA;
      for (const p of excised) {
        exMinX = Math.min(exMinX, p[0]!);
        exMaxX = Math.max(exMaxX, p[0]!);
        exMinY = Math.min(exMinY, p[1]!);
        exMaxY = Math.max(exMaxY, p[1]!);
      }
      const extent = Math.hypot(exMaxX - exMinX, exMaxY - exMinY);
      if (extent < MIN_SPUR_EXTENT_DEG) return working;
      if (excisedArea > MAX_SPUR_AREA_FRACTION * keptArea) return working;
    }
    entries.push({
      code: 'removed-retracing-loop',
      path: ringId,
      detail: `self-touch at point[${i}] ~= point[${j}] (dist ${dist.toExponential(2)} deg): excised zero-surface loop (|area| ${excisedArea.toExponential(2)} deg²), kept ${keep.length}-point loop.`,
    });
    if (keep.length + 1 < MIN_RING_POINTS) return keep; // downstream drops it
    working = [...keep, copyPosition(keep[0]!)];
  }
  return working;
}

/**
 * Closest non-adjacent vertex pair in a closed ring, or null when every
 * such pair is at least NEAR_TOUCH_TOLERANCE apart.
 */
function findSelfTouch(ring: Position[]): [number, number, number] | null {
  const n = ring.length - 1; // closed: last == first
  if (n < 4) return null;
  let best: [number, number, number] | null = null;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // shared closure vertex
      const b = ring[j]!;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d < (best ? best[2] : NEAR_TOUCH_TOLERANCE)) {
        best = [i, j, d];
      }
    }
  }
  return best;
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

/**
 * Clip the portion of a closed ring that lies south of `MAX_SOUTH_LAT`
 * (-60 deg). Rings of South American/Patagonian territories include vertices
 * in the Southern Ocean whose geodesic arcs cut across Antarctica on the
 * globe, rendering as broad crescent fills over the continent. This step
 * removes the Antarctic protrusion and replaces it with a boundary along
 * the latitude cap.
 */
function trimAntarcticExcursion(
  ring: Position[],
  ringId: string,
  entries: RepairEntry[],
): Position[] {
  // Only clip rings that CROSS the boundary (not entirely Antarctic features).
  let crossCount = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!,
      b = ring[i + 1]!;
    if (a[1]! >= MAX_SOUTH_LAT !== b[1]! >= MAX_SOUTH_LAT) crossCount++;
  }
  if (crossCount < 2) return ring; // entirely north or south, or single crossing (degenerate)
  let clipped = false;
  const out: Position[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const inA = a[1]! >= MAX_SOUTH_LAT;
    const inB = b[1]! >= MAX_SOUTH_LAT;
    if (inA && inB) {
      out.push(a);
    } // both north — keep
    else if (!inA && !inB) {
      clipped = true;
    } // both south — skip
    else if (inA && !inB) {
      out.push(a);
      const t = (MAX_SOUTH_LAT - a[1]!) / (b[1]! - a[1]!);
      out.push([a[0]! + (b[0]! - a[0]!) * t, MAX_SOUTH_LAT]);
      clipped = true;
    } else {
      const t = (MAX_SOUTH_LAT - a[1]!) / (b[1]! - a[1]!);
      out.push([a[0]! + (b[0]! - a[0]!) * t, MAX_SOUTH_LAT]);
      clipped = true;
    }
  }
  if (!clipped) return ring;
  // Close the ring.
  if (out.length > 0) out.push([out[0]![0]!, out[0]![1]!]);
  entries.push({
    code: 'trimmed-antarctic-excursion' as never,
    path: ringId,
    detail: `clipped ${ring.length - 1}pts → ${out.length - 1}pts; section south of ${MAX_SOUTH_LAT} deg removed.`,
  });
  return out;
}

/**
 * Drop rings that are entirely south of `MAX_SOUTH_LAT` and span more than
 * `MAX_ANTARCTIC_EXTENT_DEG` — they are continent-scale Antarctic outline
 * rings (e.g. f63, which wraps the globe at ~-63 to -90 deg, 1016 pts).
 * Small Antarctic islets (bbox < 10 deg) are kept.
 */
function dropContinentScaleAntarctica(
  ring: Position[],
  ringId: string,
  entries: RepairEntry[],
): Position[] {
  let maxLat = -Infinity;
  for (const p of ring) if (p[1]! > maxLat) maxLat = p[1]!;
  if (maxLat >= MAX_SOUTH_LAT) return ring; // not entirely south

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of ring) {
    if (p[0]! < minX) minX = p[0]!;
    if (p[0]! > maxX) maxX = p[0]!;
    if (p[1]! < minY) minY = p[1]!;
    if (p[1]! > maxY) maxY = p[1]!;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (diag >= 10) {
    entries.push({
      code: 'dropped-antarctic-ring' as never,
      path: ringId,
      detail: `entire ring south of ${MAX_SOUTH_LAT} deg with extent ${diag.toFixed(1)} deg — continent-scale Antarctic outline.`,
    });
    // Return a degenerate ring that downstream checks will drop.
    return [];
  }
  return ring;
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
