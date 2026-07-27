import * as Cesium from 'cesium';
import type { FeatureCollection } from '../geojson/types';
import { UNNAMED_LABEL } from '../geojson/types';

/**
 * Renders a `FeatureCollection` into a Cesium `GeoJsonDataSource` and adds
 * it to `viewer.dataSources`. The dataset is passed twice:
 *
 *  1. To `GeoJsonDataSource.load` for fill/stroke styling (mirrors the legacy
 *     cyan translucent appearance so this milestone stays a refactor of the
 *     same UX, not a reskin).
 *  2. As we add it: we attach an explicit `entity.name` to every feature so
 *     the tooltip needs no property lookup logic of its own. Null/empty names
 *     get the neutral `UNNAMED_LABEL` so the visitor is never shown `undefined`
 *     or empty text. Entities whose `properties.NAME` is already set remain
 *     untouched.
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

  // If the source feature has `NAME === null` then Cesium stores that null
  // literal as a property; entity.name remains unset, which the tooltip would
  // surface as blank. Assign an explicit fallback before adding the source.
  for (const entity of dataSource.entities.values) {
    const nameProp = entity.properties?.NAME;
    const rawName =
      nameProp !== undefined && nameProp !== null
        ? (nameProp.getValue(Cesium.JulianDate.now()) as unknown)
        : null;
    if (typeof rawName === 'string' && rawName.length > 0) {
      entity.name = rawName;
    } else {
      entity.name = UNNAMED_LABEL;
    }
  }

  viewer.dataSources.add(dataSource);
  return dataSource;
}
