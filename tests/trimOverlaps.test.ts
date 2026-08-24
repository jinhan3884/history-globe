import { describe, expect, it } from 'vitest';
import type {
  Feature,
  FeatureCollection,
  Position,
} from '../src/geojson/types';
import { trimThinOverlaps } from '../src/geojson/trimOverlaps';

function square(x: number, y: number, size: number, name: string): Feature {
  const ring: Position[] = [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { NAME: name },
  };
}

function fc(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

describe('trimThinOverlaps', () => {
  it('trims a thin overlap strip from the later feature', () => {
    // Later feature overlaps the earlier by a 0.4-deg strip (4% of its area).
    const r = trimThinOverlaps(
      fc([square(0, 0, 10, 'A'), square(9.6, 0, 10, 'B')]),
    );
    expect(r.entries.map((e) => e.code)).toContain('trimmed-thin-overlap');
    const b = r.collection.features[1]!;
    const ring = (b.geometry as { coordinates: Position[][] }).coordinates[0]!;
    // B's western edge moved from x=9.6 to x=10.
    const minX = Math.min(...ring.map((p) => p[0]!));
    expect(minX).toBeCloseTo(10, 5);
  });

  it('keeps a meaningful overlap (>= 5% of the later feature)', () => {
    // Overlap is 5x5 = 25 deg² = 25% of the later feature.
    const r = trimThinOverlaps(
      fc([square(0, 0, 10, 'A'), square(5, 5, 10, 'B')]),
    );
    expect(r.entries.map((e) => e.code)).not.toContain('trimmed-thin-overlap');
    expect(r.collection.features).toHaveLength(2);
  });

  it('never trims disjoint features', () => {
    const r = trimThinOverlaps(
      fc([square(0, 0, 10, 'A'), square(50, 50, 10, 'B')]),
    );
    expect(r.entries).toHaveLength(0);
    expect(r.collection.features).toHaveLength(2);
  });
});
