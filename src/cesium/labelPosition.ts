import * as Cesium from 'cesium';
// @ts-expect-error — @mapbox/polylabel has no bundled type declarations
import polylabel from '@mapbox/polylabel';

/**
 * ENU frame scratch objects reused across calls to avoid GC pressure.
 */
const _center = new Cesium.Cartesian3();
const _fixedToEnu = new Cesium.Matrix4();
const _enuScratch = new Cesium.Cartesian3();
const _enuResult = new Cesium.Cartesian3();
const _ecefResult = new Cesium.Cartesian3();

/**
 * Compute the optimal label position (pole of inaccessibility) for a polygon
 * defined by ECEF positions and optional hole rings.
 *
 * Uses a local ENU (east-north-up) tangent-plane projection at the polygon
 * center so that polylabel operates on meter-level (x, y) coordinates rather
 * than raw (lon, lat), which would distort at high latitudes.
 *
 * @param outerRing  Outer ring positions in ECEF (Cartesian3[]).
 * @param holes      Optional hole rings, each as Cartesian3[].
 * @returns Label position in degrees: { longitude, latitude }.
 */
export function computeLabelPosition(
  outerRing: readonly Cesium.Cartesian3[],
  holes?: readonly (readonly Cesium.Cartesian3[])[],
): { longitude: number; latitude: number } {
  // 1. Geometric center (mean of outer-ring ECEF positions)
  Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, _center);
  for (const p of outerRing) {
    Cesium.Cartesian3.add(_center, p, _center);
  }
  Cesium.Cartesian3.divideByScalar(_center, outerRing.length, _center);

  // 2. ENU frame at center
  const enuToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(_center);
  Cesium.Matrix4.inverse(enuToFixed, _fixedToEnu);

  // 3. Transform all rings to ENU (x = east, y = north)
  const enuRings: [number, number][][] = [];

  // Outer ring
  const outerEnu: [number, number][] = [];
  for (const p of outerRing) {
    Cesium.Matrix4.multiplyByPoint(_fixedToEnu, p, _enuScratch);
    outerEnu.push([_enuScratch.x, _enuScratch.y]);
  }
  enuRings.push(outerEnu);

  // Hole rings
  if (holes) {
    for (const hole of holes) {
      const holeEnu: [number, number][] = [];
      for (const p of hole) {
        Cesium.Matrix4.multiplyByPoint(_fixedToEnu, p, _enuScratch);
        holeEnu.push([_enuScratch.x, _enuScratch.y]);
      }
      if (holeEnu.length >= 3) {
        enuRings.push(holeEnu);
      }
    }
  }

  // 4. Dynamic precision: 0.1% of bounding-box extent, min 1 m
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of outerEnu) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  const precision = Math.max(1, extent * 0.001);

  // 5. polylabel on ENU rings
  const poi = polylabel(enuRings, precision) as [number, number];

  // 6. Inverse transform: ENU (x, y, 0) → ECEF → lon/lat
  _enuResult.x = poi[0];
  _enuResult.y = poi[1];
  _enuResult.z = 0;
  Cesium.Matrix4.multiplyByPoint(enuToFixed, _enuResult, _ecefResult);
  const carto = Cesium.Cartographic.fromCartesian(_ecefResult);

  return {
    longitude: Cesium.Math.toDegrees(carto.longitude),
    latitude: Cesium.Math.toDegrees(carto.latitude),
  };
}
