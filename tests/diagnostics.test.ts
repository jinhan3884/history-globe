import { describe, it, expect } from 'vitest';
import { diagnoseFeatureCollection } from '../src/geojson/diagnostics';
import type { FeatureCollection } from '../src/geojson/types';

function fc(features: ReturnType<typeof makeFeature>[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function makeFeature(
  geometry: { type: 'MultiPolygon' | 'Polygon'; coordinates: unknown },
  properties: { NAME?: string | null } = {},
) {
  return {
    type: 'Feature' as const,
    geometry: geometry as never,
    properties,
  };
}

function issues(collection: FeatureCollection) {
  return diagnoseFeatureCollection(collection).features[0]?.issues ?? [];
}

function codes(collection: FeatureCollection): string[] {
  return issues(collection).map((i) => i.code);
}

describe('diagnostics', () => {
  it('flags non-finite coordinates', () => {
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [Number.NaN, 1],
            [0, 0],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('coord-non-finite');
  });

  it('flags longitude out of range', () => {
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [200, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('lon-out-of-range');
  });

  it('flags latitude out of range', () => {
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 95],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('lat-out-of-range');
  });

  it('flags degenerate ring with fewer than 4 positions', () => {
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('ring-degenerate');
  });

  it('flags an open ring whose first and last point differ', () => {
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [1, 1],
            [0.001, 0.001],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('ring-open');
  });

  it('accepts a correctly closed, simple, CCW square as clean', () => {
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      }),
    ]);
    // CCW outer ring → no winding warning; check no error/warning codes appear
    const flagged = codes(c).filter(
      (x) => x !== 'winding-ccw-outer' && x !== 'winding-cw-outer',
    );
    expect(flagged).toHaveLength(0);
    // sanity: outer ring is CCW → no winding-cw-outer warning expected
    expect(codes(c)).not.toContain('winding-cw-outer');
  });

  it('flags consecutive duplicate points', () => {
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('duplicate-point');
  });

  it('flags longitude jump >= 180 degrees (dateline suspect)', () => {
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [-170, 0],
            [170, 0],
            [0, 1],
            [-170, 0],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('lon-jump');
  });

  it('flags a clockwise outer ring as winding-cw-outer', () => {
    // Clockwise outer ring: (0,0) -> (0,2) -> (2,2) -> (2,0) -> (0,0)
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 2],
            [2, 2],
            [2, 0],
            [0, 0],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('winding-cw-outer');
  });

  it('flags a CCW hole as winding-ccw-hole', () => {
    // Outer CCW + hole CCW (should be CW)
    const c = fc([
      makeFeature({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 2],
            [1, 1],
          ],
        ],
      }),
    ]);
    expect(codes(c)).toContain('winding-ccw-hole');
  });

  it('handles MultiPolygon geometry', () => {
    const c = fc([
      makeFeature({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
          [
            [
              [10, 10],
              [12, 10],
              [12, 12],
              [10, 12],
              [10, 10],
            ],
          ],
        ],
      }),
    ]);
    const r = diagnoseFeatureCollection(c).features[0];
    expect(r?.polygonCount).toBe(2);
    expect(r?.ringCount).toBe(2);
    expect(r?.positionCount).toBe(10);
  });

  it('summary aggregates counts correctly', () => {
    const c = fc([
      makeFeature(
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
        },
        { NAME: 'Atlantis' },
      ),
      makeFeature(
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
        { NAME: null },
      ),
    ]);
    const report = diagnoseFeatureCollection(c);
    expect(report.summary.featureCount).toBe(2);
    expect(report.summary.cleanFeatureCount).toBe(1);
    expect(report.summary.errorFeatureCount).toBe(1);
    expect(report.features[1]?.displayName).toBe(
      'Unknown / Unrecorded territory',
    );
    expect(report.summary.issueCounts['ring-degenerate']).toBe(1);
  });
});
