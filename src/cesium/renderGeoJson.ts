import * as Cesium from 'cesium';
import type { FeatureCollection } from '../geojson/types';
import { UNNAMED_LABEL } from '../geojson/types';

/**
 * Renders a `FeatureCollection` into a Cesium `GeoJsonDataSource` and adds
 * it to `viewer.dataSources`. Styling: each distinct territory `NAME` gets a
 * deterministic fill hue and a darker border of the same hue, so polities
 * are visually distinguishable and shared names (e.g. colonial empires
 * spanning multiple polygons) keep one color. Null/empty names get the
 * neutral `UNNAMED_LABEL` and a shared hue.
 *
 * We never mutate the source `collection` object; Cesium's loader copies
 * properties into its own `ConstantProperty` wrappers.
 */
export async function renderGeoJson(
  viewer: Cesium.Viewer,
  collection: FeatureCollection,
): Promise<Cesium.GeoJsonDataSource> {
  const dataSource = await Cesium.GeoJsonDataSource.load(collection, {
    fill: Cesium.Color.CYAN.withAlpha(0.4),
    stroke: Cesium.Color.TRANSPARENT,
    strokeWidth: 0,
  });

  // Per-territory styling: same NAME → same color (deterministic hue from a
  // name hash), visible darker border. Unnamed territories share one neutral
  // hue so they read as a group rather than as random colors.
  for (const entity of dataSource.entities.values) {
    const nameProp = entity.properties?.NAME;
    const rawName =
      nameProp !== undefined && nameProp !== null
        ? (nameProp.getValue(Cesium.JulianDate.now()) as unknown)
        : null;
    const name =
      typeof rawName === 'string' && rawName.length > 0
        ? rawName
        : UNNAMED_LABEL;
    entity.name = name;

    if (entity.polygon) {
      const hue = nameHue(name);
      entity.polygon.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromHsl(hue, 0.48, 0.55, 0.9), // near-opaque w/ faint imagery
      );
      entity.polygon.outline = new Cesium.ConstantProperty(true);
      entity.polygon.outlineColor = new Cesium.ConstantProperty(
        Cesium.Color.fromHsl(hue, 0.55, 0.22, 0.9),
      );
    }
  }

  viewer.dataSources.add(dataSource);
  return dataSource;
}

/**
 * Deterministic hue in [0, 1) for a territory name (FNV-1a). Golden-ratio
 * spacing would guarantee adjacent hues differ, but hashing keeps the same
 * territory the same color across sessions and datasets.
 */
function nameHue(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}
