import { describe, it, expect } from 'vitest';
import { normalizeFeatureCollection } from '../src/geojson/normalize';
import { diagnoseFeatureCollection } from '../src/geojson/diagnostics';
import type {
  Feature,
  FeatureCollection,
  Position,
} from '../src/geojson/types';

function fc(...features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function poly(
  rings: Position[][],
  properties: Record<string, unknown> = {},
): Feature {
  const coordinates: unknown = rings;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coordinates as never },
    properties,
  };
}

function multiPoly(
  polygons: Position[][][],
  properties: Record<string, unknown> = {},
): Feature {
  return {
    type: 'Feature',
    geometry: { type: 'MultiPolygon', coordinates: polygons as never },
    properties,
  };
}

function codes(reports: ReturnType<typeof normalizeFeatureCollection>) {
  return reports.report.features.flatMap((f) => f.entries.map((e) => e.code));
}

describe('normalize', () => {
  it('removes non-finite coordinates', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [2, 0],
            [Number.NaN, 2],
            [Number.POSITIVE_INFINITY, 0],
            [0, 0],
          ],
        ]),
      ),
    );
    expect(codes(r)).toContain('removed-non-finite-coord');
    // After removal + drop degenerate, the polygon with so few remaining
    // points should be flagged for dropped-degenerate-ring OR — if the
    // closure leaves <4 — dropped-degenerate-polygon or dropped-feature.
    expect(r.collection.features).toHaveLength(0);
  });

  it('removes consecutive duplicate points', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [2, 0],
            [2, 0],
            [2, 2],
            [0, 0],
          ],
        ]),
      ),
    );
    expect(codes(r)).toContain('removed-duplicate-point');
    // The CCW outer ring already satisfies winding so winding should not fire
    expect(codes(r)).not.toContain('rewound-outer-ring');
    expect(r.collection.features[0]?.geometry.coordinates).toBeTruthy();
  });

  it('closes an open ring', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [2, 0],
            [2, 2],
          ],
        ]),
      ),
    );
    // 3-point open ring: closure makes first==last so the ring can survive,
    // but only if we keep all 3 + one closure = 4 points total.
    // Here we have 3 distinct points; closure adds a 4th = (0,0).
    expect(codes(r)).toContain('closed-ring');
    const feature = r.collection.features[0];
    expect(feature).toBeDefined();
    const rings = (feature!.geometry.coordinates as Position[][]) ?? [];
    const ring = rings[0] ?? [];
    expect(ring.length).toBe(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('drops a ring that has fewer than 4 positions after dedup', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [2, 2],
            [0, 0],
          ],
        ]),
      ),
    );
    expect(codes(r)).toContain('dropped-degenerate-ring');
    expect(r.collection.features).toHaveLength(0);
  });

  it('drops a collinear ring that encloses no surface', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [1, 1],
            [2, 2],
            [0, 0],
          ],
        ]),
      ),
    );
    expect(codes(r)).toContain('dropped-degenerate-ring');
    expect(r.collection.features).toHaveLength(0);
  });

  it('keeps a tiny but genuine island ring above the area threshold', () => {
    // Triangle with shoelace area 4.5e-12 deg² — far below any visible
    // feature yet well above the MIN_RING_AREA threshold.
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [10, 10],
            [10.000003, 10],
            [10, 10.000003],
            [10, 10],
          ],
        ]),
      ),
    );
    expect(r.collection.features).toHaveLength(1);
    expect(codes(r)).not.toContain('dropped-degenerate-ring');
  });

  it('reports (never silently drops) a feature whose every ring is degenerate', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly(
          [
            [
              [0, 0],
              [1, 1],
              [2, 2],
              [0, 0],
            ],
          ],
          { NAME: 'Sliver' },
        ),
      ),
    );
    expect(codes(r)).toContain('dropped-feature-no-polygons');
    expect(r.report.droppedFeatureCount).toBe(1);
    const dropped = r.report.features[0];
    expect(dropped?.kept).toBe(false);
    expect(dropped?.displayName).toBe('Sliver');
  });

  it('clamps pole vertices so Cesium rhumb subdivision stays finite', () => {
    // A ring running along lat -90 makes EllipsoidRhumbLine undefined
    // (NaN distance -> worker RangeError). Vertices must be clamped inward
    // and every clamp reported.
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [-180, -89],
            [-179.2, -90],
            [-178, -89],
            [-180, -89],
          ],
        ]),
      ),
    );
    expect(codes(r)).toContain('clamped-polar-latitude');
    const feature = r.collection.features[0];
    expect(feature).toBeDefined();
    const ring = feature!.geometry.coordinates[0] as Position[];
    for (const p of ring) {
      expect(Math.abs(p[1])).toBeLessThanOrEqual(90);
    }
  });

  it('rewinds a CW outer ring to CCW', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [0, 2],
            [2, 2],
            [2, 0],
            [0, 0],
          ],
        ]),
      ),
    );
    expect(codes(r)).toContain('rewound-outer-ring');
    // After rewind, post-normalisation diagnostics should not flag the
    // outer ring as winding-cw-outer.
    const post = diagnoseFeatureCollection(r.collection);
    const outer = post.features[0]?.issues.find(
      (i) => i.code === 'winding-cw-outer',
    );
    expect(outer).toBeUndefined();
  });

  it('rewinds a CCW hole to CW', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
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
        ]),
      ),
    );
    expect(codes(r)).toContain('rewound-hole-ring');
  });

  it('preserves feature properties', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly(
          [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
          {
            NAME: 'Atlantis',
            ABBREVN: 'ATL',
            BORDERPRECISION: 1,
            PARTOF: null,
          },
        ),
      ),
    );
    const props = r.collection.features[0]?.properties;
    expect(props?.NAME).toBe('Atlantis');
    expect(props?.ABBREVN).toBe('ATL');
    expect(props?.BORDERPRECISION).toBe(1);
    expect(props?.PARTOF).toBeNull();
  });

  it('never mutates the input collection', () => {
    const original = fc(
      poly([
        [
          [0, 0],
          [0, 2],
          [2, 2],
          [2, 0],
          [0, 0],
        ],
      ]),
    );
    const snapshot = JSON.stringify(original);
    normalizeFeatureCollection(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('reports dropped features explicitly (no silent skip)', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [Number.NaN, Number.NaN],
            [0, 0],
          ],
        ]),
      ),
    );
    expect(r.report.droppedFeatureCount).toBe(1);
    expect(codes(r)).toContain('dropped-feature-no-polygons');
    expect(r.collection.features).toHaveLength(0);
  });

  it('handles MultiPolygon geometry without leaking ring arrays', () => {
    const r = normalizeFeatureCollection(
      fc(
        multiPoly([
          [
            [
              [0, 0],
              [0, 2],
              [2, 2],
              [2, 0],
              [0, 0],
            ],
          ],
          [
            [
              [10, 10],
              [10, 12],
              [12, 12],
              [12, 10],
              [10, 10],
            ],
          ],
        ]),
      ),
    );
    expect(r.collection.features).toHaveLength(1);
    const feature = r.collection.features[0];
    expect(feature).toBeDefined();
    const g = feature!.geometry;
    expect(g.type).toBe('MultiPolygon');
    expect((g.coordinates as Position[][][]).length).toBe(2);
    expect(
      r.report.features[0]?.entries.filter(
        (e) => e.code === 'rewound-outer-ring',
      ).length,
    ).toBe(2);
  });

  it('repair report summary aggregates action counts', () => {
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [0, 2],
            [2, 2],
            [2, 0],
            [0, 0],
          ],
        ]),
        poly([
          [
            [10, 10],
            [12, 10],
            [12, 12],
            [10, 12],
            [10, 10],
          ],
        ]),
      ),
    );
    expect(r.report.actionCounts['rewound-outer-ring']).toBe(1);
    expect(r.report.features.length).toBe(2);
    expect(r.report.droppedFeatureCount).toBe(0);
  });
});
