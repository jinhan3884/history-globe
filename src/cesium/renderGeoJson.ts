import * as Cesium from 'cesium';
import type { FeatureCollection } from '../geojson/types';
import { UNNAMED_LABEL } from '../geojson/types';

export async function renderGeoJson(
  viewer: Cesium.Viewer,
  collection: FeatureCollection,
): Promise<Cesium.GeoJsonDataSource> {
  const dataSource = await Cesium.GeoJsonDataSource.load(collection, {
    fill: Cesium.Color.CYAN.withAlpha(0.4),
    stroke: Cesium.Color.TRANSPARENT,
    strokeWidth: 0,
  });

  for (const entity of dataSource.entities.values) {
    const nameProp = entity.properties?.NAME;
    const rawName = nameProp !== undefined && nameProp !== null
      ? (nameProp.getValue(Cesium.JulianDate.now()) as unknown)
      : null;
    const name = typeof rawName === 'string' && rawName.length > 0 ? rawName : UNNAMED_LABEL;
    entity.name = name;
    if (entity.polygon) {
      const hue = nameHue(name);
      entity.polygon.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromHsl(hue, 0.48, 0.55, 0.9),
      );
      entity.polygon.outline = new Cesium.ConstantProperty(true);
      entity.polygon.outlineColor = new Cesium.ConstantProperty(
        Cesium.Color.fromHsl(hue, 0.55, 0.22, 0.9),
      );
    }
  }

  viewer.dataSources.add(dataSource);

  // Label placement: pick the largest polygon for each territory name.
  // The pole of inaccessibility is computed from the outer ring of the
  // largest polygon, so labels never end up on tiny islands.
  const bestEntity = new Map<string, Cesium.Entity>();
  const bestSize = new Map<string, number>();
  for (const entity of dataSource.entities.values) {
    if (!entity.polygon || !entity.name || entity.name === UNNAMED_LABEL) continue;
    const now = Cesium.JulianDate.now();
    if (!entity.polygon) continue;
    const h = entity.polygon.hierarchy?.getValue(now);
    if (!h || h.positions.length < 3) continue;
    const prev = bestSize.get(entity.name) ?? 0;
    if (h.positions.length > prev) {
      bestSize.set(entity.name, h.positions.length);
      bestEntity.set(entity.name, entity);
    }
  }
  const labelEntities: Cesium.Entity[] = [];
  for (const [, entity] of bestEntity) {
    const now = Cesium.JulianDate.now();
    if (!entity.polygon) continue;
    const h = entity.polygon.hierarchy?.getValue(now);
    if (!h) continue;
    // Bounding-box center: the visual center of the polygon on screen.
    // polylabel (pole of inaccessibility) is technically correct but can
    // place labels far from the visual center for irregular shapes.
    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    for (const p of h.positions) {
      const c = Cesium.Cartographic.fromCartesian(p);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const lat = Cesium.Math.toDegrees(c.latitude);
      if (lon < minX) minX = lon;
      if (lon > maxX) maxX = lon;
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const centroid = Cesium.Cartesian3.fromDegrees(cx, cy, 0);
    const labelEntity = viewer.entities.add({
      position: centroid,
      label: {
        text: entity.name,
        font: 'bold 14px sans-serif',
        fillColor: new Cesium.Color(0.06, 0.1, 0.24, 1),
        outlineColor: new Cesium.Color(0.12, 0.18, 0.4, 1),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        eyeOffset: new Cesium.Cartesian3(0, 0, -1000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(500, 1.6, 15e6, 0.2),
      },
    } as unknown as Cesium.Entity);  // Cesium runtime accepts plain-opts label
    labelEntities.push(labelEntity);
  }

  // Backface culling: hide labels on the far side of the globe every frame.
  viewer.scene.preRender.addEventListener(() => {
    if (labelEntities.length === 0) return;
    const camPos = viewer.camera.positionWC;
    const camDist = Cesium.Cartesian3.magnitude(camPos);
    const horizonDot = 6371000 / camDist;
    const normCam = Cesium.Cartesian3.normalize(camPos, new Cesium.Cartesian3());
    for (const e of labelEntities) {
      const lblPos = e.position?.getValue(Cesium.JulianDate.now());
      if (!lblPos) { e.show = false; continue; }
      const normLbl = Cesium.Cartesian3.normalize(lblPos, new Cesium.Cartesian3());
      e.show = Cesium.Cartesian3.dot(normCam, normLbl) > horizonDot;
    }
  });

  return dataSource;
}

function nameHue(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}