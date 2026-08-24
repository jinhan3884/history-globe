import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import type { FeatureCollection } from '../src/geojson/types';
import { normalizeFeatureCollection } from '../src/geojson/normalize';

describe('temp: max segment length + geometry types', () => {
  it('scans normalized output', () => {
    const raw = JSON.parse(
      readFileSync('data/historical-basemaps/world_100.geojson', 'utf-8'),
    ) as FeatureCollection;
    const types: Record<string, number> = {};
    for (const f of raw.features)
      types[f.geometry.type] = (types[f.geometry.type] ?? 0) + 1;
    const { collection } = normalizeFeatureCollection(raw);
    const lines: string[] = ['raw geometry types: ' + JSON.stringify(types)];
    let maxSeg = 0;
    let maxAt = '';
    collection.features.forEach((f, fi) => {
      const polys =
        f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates
          : [f.geometry.coordinates];
      polys.forEach((poly, pi) => {
        poly.forEach((ring, ri) => {
          for (let i = 0; i < ring.length - 1; i++) {
            const a = ring[i]!;
            const b = ring[i + 1]!;
            const d = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
            if (d > maxSeg) {
              maxSeg = d;
              maxAt = `f${fi} p${pi} r${ri} seg${i}: [${a[0]!.toFixed(2)},${a[1]!.toFixed(2)}]->[${b[0]!.toFixed(2)},${b[1]!.toFixed(2)}] d=${d.toFixed(2)}`;
            }
          }
        });
      });
    });
    lines.push('max segment: ' + maxSeg.toFixed(3) + ' deg — ' + maxAt);
    writeFileSync('temp_scan_out.txt', lines.join('\n'));
  });
});
