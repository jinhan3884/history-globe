import * as Cesium from 'cesium';
// @ts-expect-error — @mapbox/polylabel has no bundled type declarations
import polylabel from '@mapbox/polylabel';
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

  // Backface culling for labels: hide labels on the far side of the globe.
  // Runs every frame via preRender.
  const labelEntities: Cesium.Entity[] = [];
  viewer.scene.preRender.addEventListener(() => {
    const camPos = viewer.camera.positionWC;
    const camDist = Cesium.Cartesian3.magnitude(camPos);
    const horizonDot = 6371000 / camDist;
    const normCam = Cesium.Cartesian3.normalize(
      camPos,
      new Cesium.Cartesian3(),
    );
    for (const e of labelEntities) {
      const lblPos = e.position?.getValue(Cesium.JulianDate.now());
      if (!lblPos) continue;
      const normLbl = Cesium.Cartesian3.normalize(
        lblPos,
        new Cesium.Cartesian3(),
      );
      e.show = Cesium.Cartesian3.dot(normCam, normLbl) > horizonDot;
    }
  });

  // Add ONE globe-surface label per named territory (deduplicated by name).
  // CLAMP_TO_GROUND keeps labels on the ellipsoid with proper occlusion.
  const seenLabels = new Set<string>();
  for (const entity of dataSource.entities.values) {
    if (!entity.polygon || !entity.name || entity.name === UNNAMED_LABEL)
      continue;
    if (seenLabels.has(entity.name)) continue;
    seenLabels.add(entity.name);
    const now = Cesium.JulianDate.now();
    const h = entity.polygon.hierarchy?.getValue(now);
    if (!h || h.positions.length < 3) continue;
    const ringDeg: [number, number][] = [];
    for (const p of h.positions) {
      const c = Cesium.Cartographic.fromCartesian(p);
      ringDeg.push([Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)]);
    }
    const poi = polylabel([ringDeg], 0.5) as [number, number];
    const centroid = Cesium.Cartesian3.fromDegrees(poi[0], poi[1], 0);
    const labelEntity = viewer.entities.add({
      position: centroid,
      label: {
        text: entity.name,
        font: 'bold 14px sans-serif',
        fillColor: new Cesium.Color(0.06, 0.1, 0.24, 1), // dark navy blue
        outlineColor: new Cesium.Color(0.12, 0.18, 0.4, 1),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        eyeOffset: new Cesium.Cartesian3(0, 0, -1000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(500, 1.6, 15e6, 0.2),
      },
    } as any);
    labelEntities.push(labelEntity);
  }
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
