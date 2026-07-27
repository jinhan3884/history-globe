import { describe, it, expect } from 'vitest';
import { loadGeoJson, GeoJsonLoadError } from '../src/geojson/loadGeoJson';

/**
 * M1 scope: loader structural validation only. Coordinate-level diagnostics
 * (finiteness, closure, winding, range) wait for M2 and have their own tests.
 */
describe('loadGeoJson', () => {
  it('parses a minimal FeatureCollection', async () => {
    const url = makeUrl({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [] },
          properties: { NAME: 'Atlantis' },
        },
      ],
    });
    const result = await loadGeoJson(url);
    expect(result.featureCount).toBe(1);
    expect(result.namedFeatureCount).toBe(1);
  });

  it('counts only non-null non-empty NAME as named', async () => {
    const url = makeUrl({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { NAME: 'Atlantis' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { NAME: null },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: { NAME: '' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [] },
          properties: {},
        },
      ],
    });
    const result = await loadGeoJson(url);
    expect(result.featureCount).toBe(4);
    expect(result.namedFeatureCount).toBe(1);
  });

  it('rejects a non-FeatureCollection top-level', async () => {
    const url = makeUrl({ type: 'Feature', geometry: null, properties: {} });
    await expect(loadGeoJson(url)).rejects.toThrow(GeoJsonLoadError);
  });

  it(' rejects unsupported geometry types', async () => {
    const url = makeUrl({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: {},
        },
      ],
    });
    await expect(loadGeoJson(url)).rejects.toThrow(GeoJsonLoadError);
  });

  it('strips a UTF-8 BOM if present', async () => {
    const payload = '\uFEFF{"type":"FeatureCollection","features":[]}';
    const url = makeRawUrl(payload);
    const result = await loadGeoJson(url);
    expect(result.featureCount).toBe(0);
  });
});

/**
 * Bootstrap a `data:` URL pointing at a small JSON blob so we don't touch the
 * filesystem. Vitest runs in node so `Response`/`fetch` are available.
 */
function makeUrl(obj: unknown): string {
  return makeRawUrl(JSON.stringify(obj));
}

function makeRawUrl(payload: string): string {
  const encoded = encodeURIComponent(payload).replace(/%2F/g, '/');
  return `data:application/json;charset=utf-8,${encoded}`;
}
