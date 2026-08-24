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
    expect(ring.length).toBeGreaterThanOrEqual(4);
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

  it('heals an out-and-back spike ring (keeps the real loop)', () => {
    // A(0,0) B(10,0) C(10,10) D(5,5) B'(10,0) A: the D->B'->A path is a
    // zero-area spur; the B->C->D->B loop holds all the surface.
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [5, 5],
            [10, 0],
            [0, 0],
          ],
        ]),
      ),
    );
    expect(codes(r)).toContain('removed-retracing-loop');
    expect(r.collection.features).toHaveLength(1);
    const ring = r.collection.features[0]!.geometry
      .coordinates[0] as Position[];
    expect(ring.length).toBeGreaterThanOrEqual(4); // triangle + closure (+ subdivision)
  });

  it('excises a mid-ring retracing spike (keeps the surrounding polygon)', () => {
    // Touch at (10,10): indices 2 and 4. The 2->3->4 sub-loop is a thin
    // zero-area spike; the rest is a real quadrilateral.
    const r = normalizeFeatureCollection(
      fc(
        poly([
          [
            [0, 0],
            [0, 10],
            [10, 10],
            [5, 5],
            [10, 10.00000005],
            [10, 0],
            [0, 0],
          ],
        ]),
      ),
    );
    expect(codes(r)).toContain('removed-retracing-loop');
    expect(r.collection.features).toHaveLength(1);
    const ring = r.collection.features[0]!.geometry
      .coordinates[0] as Position[];
    expect(ring.length).toBeGreaterThanOrEqual(5); // quad + closure (+ subdivision)
    expect(ring.every((p) => !(p[0] === 5 && Math.abs(p[1] - 5) < 0.5))).toBe(
      true,
    ); // spike midpoint (5,5) excised
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

it('drops needle rings (long out-and-back paths with vanishing area)', () => {
  // A 20-deg-long diagonal needle: bbox ~20x10, enclosed area ~0.005 deg².
  const r = normalizeFeatureCollection(
    fc(
      poly([
        [
          [0, 0],
          [20, 10],
          [20, 10.0002],
          [0, 0.0002],
          [0, 0],
        ],
      ]),
    ),
  );
  expect(codes(r)).toContain('dropped-needle-ring');
  expect(r.collection.features).toHaveLength(0);
});

it('keeps a genuinely compact ring that fills its bbox', () => {
  const r = normalizeFeatureCollection(
    fc(
      poly([
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ]),
    ),
  );
  expect(codes(r)).not.toContain('dropped-needle-ring');
  expect(r.collection.features).toHaveLength(1);
});

it('heals a far-reaching near-touching blade spur', () => {
  // Main body (0,0)-(30,30) with a thin blade spur from (15,30) out to
  // (16,40) and back to (15.04,30) — vertices 0.04 deg apart at the mouth.
  const r = normalizeFeatureCollection(
    fc(
      poly([
        [
          [0, 0],
          [30, 0],
          [30, 30],
          [15, 30],
          [16, 40],
          [15.04, 30],
          [0, 30],
          [0, 0],
        ],
      ]),
    ),
  );
  expect(codes(r)).toContain('removed-retracing-loop');
  expect(r.collection.features).toHaveLength(1);
  const ring = r.collection.features[0]!.geometry.coordinates[0] as Position[];
  // Spur apex (16,40) excised.
  expect(ring.every((p) => p[1]! <= 30.5)).toBe(true);
  // Ring still closed.
  expect(ring[0]).toEqual(ring[ring.length - 1]);
});

it('leaves small islands with naturally close vertices untouched', () => {
  // A tiny island: all vertices are close; the close approach is the
  // ring's own scale, not a blade.
  const r = normalizeFeatureCollection(
    fc(
      poly([
        [
          [0, 0],
          [0.1, 0.05],
          [0.2, 0.1],
          [0.15, 0.12],
          [0.05, 0.04],
          [0, 0],
        ],
      ]),
    ),
  );
  expect(r.collection.features).toHaveLength(1);
  const ring = r.collection.features[0]!.geometry.coordinates[0] as Position[];
  expect(ring.length).toBe(6);
});

it('leaves a figure-eight with two comparable lobes untouched', () => {
  // Two ~real lobes joined by a 0.07-deg near touch: excising either lobe
  // would destroy real territory, so the ring is left alone.
  const r = normalizeFeatureCollection(
    fc(
      poly([
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0.05, 0.05],
          [-5, 0.05],
          [-5, -5],
          [0.05, -5],
          [0.049, 0.049],
        ],
      ]),
    ),
  );
  expect(r.collection.features).toHaveLength(1);
  // Both lobes survive (subdivision may add vertices along long edges).
  expect(codes(r)).not.toContain('removed-retracing-loop');
  expect(codes(r)).not.toContain('dropped-needle-ring');
});

it('clips the Antarctic excursion from a ring that dips south of -60 and returns', () => {
  // Ring: north, south (into Antarctica), north, crossing -60 line twice.
  const r = normalizeFeatureCollection(
    fc(
      poly([
        [
          [0, -50],
          [30, -50],
          [30, -70],
          [20, -65],
          [10, -50],
          [0, -50],
        ],
      ]),
    ),
  );
  const codes_ = codes(r);
  expect(codes_).toContain(
    'trimmed-antarctic-excursion' as 'dropped-needle-ring',
  );
  expect(r.collection.features).toHaveLength(1);
  const ring = r.collection.features[0]!.geometry.coordinates[0] as Position[];
  // All remaining vertices should be >= -60
  expect(ring.every((p) => p[1]! >= -60)).toBe(true);
});

it('leaves an entirely Antarctic ring untouched', () => {
  const r = normalizeFeatureCollection(
    fc(
      poly([
        [
          [0, -70],
          [2, -70],
          [2, -75],
          [0, -75],
          [0, -70],
        ],
      ]),
    ),
  );
  expect(codes(r)).not.toContain(
    'trimmed-antarctic-excursion' as 'dropped-needle-ring',
  );
  expect(r.collection.features).toHaveLength(1);
});
