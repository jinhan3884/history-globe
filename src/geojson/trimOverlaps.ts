import polygonClipping, {
  type Geom,
  type MultiPolygon as ClippingMultiPolygon,
} from 'polygon-clipping';
import type { Feature, FeatureCollection, Position } from './types';
import type { RepairEntry } from './report';

/**
 * Removes *thin* overlaps between consecutive features.
 *
 * The source dataset's adjacent territories overlap slightly along their
 * borders (hand digitisation). Where two translucent fills overlap, the
 * strip renders brighter than either fill — the "blade" artifacts. Per the
 * dataset author, some overlaps are meaningful (cultural spheres), so we
 * only trim when the overlap is a small fraction of the later feature:
 * meaningful overlaps (conquest, annexation) are orders of magnitude
 * larger and survive untouched. The later feature wins (it draws on top).
 *
 * Pure: returns a new collection; inputs are not mutated. Every trim is
 * reported as a `trimmed-thin-overlap` repair entry keyed by feature index.
 */

/** Overlaps smaller than this fraction of the later feature are trimmed. */
const MAX_OVERLAP_FRACTION = 0.05;

interface BBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function geomBBox(geom: ClippingMultiPolygon): BBox {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const poly of geom) {
    for (const ring of poly) {
      for (const p of ring) {
        minX = Math.min(minX, p[0]!);
        maxX = Math.max(maxX, p[0]!);
        minY = Math.min(minY, p[1]!);
        maxY = Math.max(maxY, p[1]!);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

function bboxesIntersect(a: BBox, b: BBox): boolean {
  return (
    a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
  );
}

function polygonArea(poly: Position[][]): number {
  let area = 0;
  // Outer ring minus holes: absolute value of the summed signed areas is
  // fine here — we only compare relative magnitudes.
  for (const ring of poly) {
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i]![0]! * ring[i + 1]![1]! - ring[i + 1]![0]! * ring[i]![1]!;
    }
  }
  return Math.abs(area / 2);
}

function multiPolygonArea(geom: ClippingMultiPolygon): number {
  let area = 0;
  for (const poly of geom) area += polygonArea(poly);
  return area;
}

function toClippingMultiPolygon(feature: Feature): ClippingMultiPolygon {
  const geom = feature.geometry as { coordinates: unknown };
  if (feature.geometry.type === 'MultiPolygon') {
    return geom.coordinates as ClippingMultiPolygon;
  }
  return [geom.coordinates as unknown as Position[][]] as ClippingMultiPolygon;
}

function toFeatureGeometry(geom: ClippingMultiPolygon): Feature['geometry'] {
  if (geom.length === 1) {
    return {
      type: 'Polygon',
      coordinates: geom[0]! as unknown as Position[][],
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geom as unknown as Position[][][],
  };
}

export interface TrimOverlapsResult {
  collection: FeatureCollection;
  entries: RepairEntry[];
}

export function trimThinOverlaps(input: FeatureCollection): TrimOverlapsResult {
  const features = input.features.map((f) => ({
    feature: f,
    geom: toClippingMultiPolygon(f),
    bbox: geomBBox(toClippingMultiPolygon(f)),
  }));
  const entries: RepairEntry[] = [];

  for (let j = 1; j < features.length; j++) {
    const later = features[j]!;
    for (let i = 0; i < j; i++) {
      const earlier = features[i]!;
      if (!bboxesIntersect(earlier.bbox, later.bbox)) continue;
      if (!earlier.feature || !later.feature) continue;

      let intersection: ClippingMultiPolygon;
      try {
        intersection = polygonClipping.intersection(
          earlier.geom as Geom,
          later.geom as Geom,
        ) as ClippingMultiPolygon;
      } catch {
        entries.push({
          code: 'overlap-trim-failed',
          path: `feature[${i}]+feature[${j}]`,
          detail: 'polygon-clipping intersection threw; overlap left as-is.',
        });
        continue;
      }
      if (intersection.length === 0) continue;

      const overlapArea = multiPolygonArea(intersection);
      const laterArea = multiPolygonArea(later.geom);
      if (laterArea <= 0 || overlapArea / laterArea >= MAX_OVERLAP_FRACTION) {
        continue; // meaningful overlap — keep it
      }

      let difference: ClippingMultiPolygon;
      try {
        difference = polygonClipping.difference(
          later.geom as Geom,
          intersection as Geom,
        ) as ClippingMultiPolygon;
      } catch {
        entries.push({
          code: 'overlap-trim-failed',
          path: `feature[${j}]`,
          detail: `polygon-clipping difference threw for pair [${i}]+[${j}]; overlap left as-is.`,
        });
        continue;
      }
      const trimmedArea = multiPolygonArea(difference);
      if (trimmedArea <= 0) continue; // would erase the feature entirely

      later.geom = difference;
      later.bbox = geomBBox(difference);
      later.feature = {
        ...later.feature,
        geometry: toFeatureGeometry(difference),
      };
      entries.push({
        code: 'trimmed-thin-overlap',
        path: `feature[${j}]`,
        detail: `trimmed ${overlapArea.toExponential(2)} deg² overlap with feature[${i}] (${((overlapArea / laterArea) * 100).toFixed(2)}% of later feature).`,
      });
    }
  }

  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: features.map((f) => f.feature!),
  };
  return { collection, entries };
}
