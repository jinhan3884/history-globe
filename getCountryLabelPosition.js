/**
 * getCountryLabelPosition.js
 *
 * 불규칙 폴리곤(국경선) 내부에 국가명 라벨을 배치하기 위한
 * "가장 안쪽 지점(pole of inaccessibility)" 산출 유틸리티.
 *
 * 문제: polylabel은 입력 좌표가 등거리 평면임을 전제로 한다.
 *       위경도(EPSG:4326)는 등거리 좌표계가 아니므로, 폴리곤을
 *       로컬 접평면(ENU, 미터 단위)으로 투영한 뒤 polylabel을
 *       수행하고 다시 지리좌표로 역투영한다.
 *
 * 의존성:
 *   - polylabel        (npm install polylabel)
 *   - Cesium (Cesium.Transforms / Cesium.Matrix4 / Cesium.Cartesian3 등)
 *     -> Node 환경에서 배치 처리할 경우 cesium 패키지를 헤드리스로 사용하거나,
 *        아래 ENU 변환 로직을 순수 수학으로 대체할 수 있음(하단 참고).
 *
 * 사용 예:
 *   node getCountryLabelPosition.js countries.geojson labels_output.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const polylabel = require('@mapbox/polylabel');

// GeoJSON properties에서 국가명을 가져올 필드명 (데이터셋에 맞게 수정)
// 이 저장소의 world_100.geojson 등 normalized 데이터는 NAME 필드를 사용한다.
const NAME_FIELD = 'NAME';
const CODE_FIELD = 'iso_a3';

// ---------------------------------------------------------------------------
// 1. 날짜변경선(180도) unwrap
// ---------------------------------------------------------------------------
/**
 * 폴리곤 ring이 날짜변경선을 가로지르는 경우, 경도값이 연속되도록 unwrap한다.
 * 예: [-179, -178, 179, 178] -> [-179, -178, -181, -182] (또는 반대 방향)
 */
function unwrapRingLongitudes(ring) {
  const unwrapped = [ring[0].slice()];
  for (let i = 1; i < ring.length; i++) {
    const prev = unwrapped[i - 1][0];
    let [lon, lat] = ring[i];
    let diff = lon - prev;
    while (diff > 180) {
      lon -= 360;
      diff = lon - prev;
    }
    while (diff < -180) {
      lon += 360;
      diff = lon - prev;
    }
    unwrapped.push([lon, lat]);
  }
  return unwrapped;
}

function crossesAntimeridian(ring) {
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) return true;
  }
  return false;
}

function normalizeRings(rings) {
  const needsUnwrap = rings.some(crossesAntimeridian);
  if (!needsUnwrap) return rings;
  return rings.map(unwrapRingLongitudes);
}

// ---------------------------------------------------------------------------
// 2. 구면 근사 면적 (서브폴리곤 대표 선정용, 정밀도보다 상대비교 목적)
// ---------------------------------------------------------------------------
function ringAreaApprox(ring) {
  // 단순 평면 슈라이스 공식 (도 단위) - 국가간 상대 면적 비교용으로 충분
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

/**
 * MultiPolygon 좌표(Array<Array<Ring>>) 중 외곽 ring 면적이 가장 큰
 * 서브폴리곤(rings 배열)을 선택한다.
 */
function pickLargestPolygon(multiPolygonCoords) {
  let best = null;
  let bestArea = -1;
  for (const polygonRings of multiPolygonCoords) {
    const outer = polygonRings[0];
    const area = ringAreaApprox(outer);
    if (area > bestArea) {
      bestArea = area;
      best = polygonRings;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 3. lon/lat <-> 로컬 접평면(ENU, 미터) 변환
//    Cesium이 있는 브라우저/런타임 환경에서는 Cesium.Transforms 사용을 권장.
//    아래는 Cesium 없이도 동작하는 구면 근사 ENU 변환(간이 구현)이다.
// ---------------------------------------------------------------------------
const EARTH_RADIUS = 6378137.0; // WGS84 장반경 근사(m)

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * 기준점(centerLon, centerLat)에 대한 로컬 접평면(x=East, y=North, 미터)으로 투영.
 * 소~중규모 폴리곤에서 충분한 정밀도. 대륙급 폴리곤은 오차가 커질 수 있음
 * (작업지시서 8절 후속 과제 참고).
 */
function lonLatToLocalXY(lon, lat, centerLon, centerLat) {
  const dLon = toRad(lon - centerLon);
  const dLat = toRad(lat - centerLat);
  const x = dLon * Math.cos(toRad(centerLat)) * EARTH_RADIUS;
  const y = dLat * EARTH_RADIUS;
  return [x, y];
}

function localXYToLonLat(x, y, centerLon, centerLat) {
  const lat = centerLat + toDeg(y / EARTH_RADIUS);
  const lon =
    centerLon + toDeg(x / (EARTH_RADIUS * Math.cos(toRad(centerLat))));
  return [lon, lat];
}

// Cesium 런타임(브라우저)에서 더 정확한 ENU 변환을 쓰고 싶다면 아래 함수로 교체:
//
// function lonLatRingsToLocalXY_Cesium(rings, center) {
//   const centerCartesian = Cesium.Cartesian3.fromDegrees(center[0], center[1]);
//   const enuFrame = Cesium.Transforms.eastNorthUpToFixedFrame(centerCartesian);
//   const inverseEnu = Cesium.Matrix4.inverse(enuFrame, new Cesium.Matrix4());
//   return rings.map(ring => ring.map(([lon, lat]) => {
//     const c = Cesium.Cartesian3.fromDegrees(lon, lat);
//     const local = Cesium.Matrix4.multiplyByPoint(inverseEnu, c, new Cesium.Cartesian3());
//     return [local.x, local.y];
//   }));
// }
// (역변환도 동일한 enuFrame으로 Matrix4.multiplyByPoint 사용)

// ---------------------------------------------------------------------------
// 4. 단일 국가(Polygon/MultiPolygon)에 대한 라벨 위치 산출
// ---------------------------------------------------------------------------
/**
 * @param {Object} geometry GeoJSON geometry (Polygon 또는 MultiPolygon)
 * @param {Object} [options]
 * @param {number} [options.precisionRatio=0.001] 폴리곤 크기 대비 polylabel precision 비율
 * @returns {{lon: number, lat: number}}
 */
function computeCountryLabelPosition(geometry, options = {}) {
  const precisionRatio = options.precisionRatio ?? 0.001;

  let rings;
  if (geometry.type === 'Polygon') {
    rings = geometry.coordinates;
  } else if (geometry.type === 'MultiPolygon') {
    rings = pickLargestPolygon(geometry.coordinates);
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }

  // 날짜변경선 unwrap
  rings = normalizeRings(rings);

  // 폴리곤 bbox 중심을 접평면 기준점으로 사용
  const outer = rings[0];
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of outer) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;

  // 로컬 평면 좌표로 투영 (모든 ring: 외곽 + holes)
  const localRings = rings.map((ring) =>
    ring.map(([lon, lat]) => lonLatToLocalXY(lon, lat, centerLon, centerLat)),
  );

  // 폴리곤 대략 크기 기준으로 precision 동적 설정 (최소 1m)
  const widthM =
    (maxLon - minLon) *
    Math.cos(toRad(centerLat)) *
    (Math.PI / 180) *
    EARTH_RADIUS;
  const heightM = (maxLat - minLat) * (Math.PI / 180) * EARTH_RADIUS;
  const scale = Math.max(widthM, heightM);
  const precision = Math.max(1, scale * precisionRatio);

  const [x, y] = polylabel(localRings, precision);

  const [labelLonUnwrapped, labelLat] = localXYToLonLat(
    x,
    y,
    centerLon,
    centerLat,
  );

  // unwrap으로 -180~180 범위를 벗어났을 수 있으므로 재정규화
  let labelLon = labelLonUnwrapped;
  while (labelLon > 180) labelLon -= 360;
  while (labelLon < -180) labelLon += 360;

  return { lon: labelLon, lat: labelLat };
}

// ---------------------------------------------------------------------------
// 5. Cesium 표시용 변환 헬퍼
// ---------------------------------------------------------------------------
/**
 * Cesium 런타임에서 결과를 바로 Cartesian3로 쓰고 싶을 때 사용.
 * (Node 배치 스크립트에서는 사용하지 않음)
 */
// function toCesiumCartesian3(labelPos, height = 0) {
//   return Cesium.Cartesian3.fromDegrees(labelPos.lon, labelPos.lat, height);
// }

// ---------------------------------------------------------------------------
// 6. 전체 국가 GeoJSON 일괄 처리
// ---------------------------------------------------------------------------
function processAllCountries(inputPath, outputPath) {
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (raw.type !== 'FeatureCollection') {
    throw new Error('입력 파일은 GeoJSON FeatureCollection이어야 합니다.');
  }

  const results = [];
  const errors = [];

  for (const feature of raw.features) {
    const name = feature.properties?.[NAME_FIELD] ?? '(unknown)';
    const code = feature.properties?.[CODE_FIELD] ?? null;
    try {
      const pos = computeCountryLabelPosition(feature.geometry);
      results.push({
        name,
        code,
        label_lon: pos.lon,
        label_lat: pos.lat,
      });
    } catch (err) {
      errors.push({ name, code, error: err.message });
    }
  }

  const outputGeoJSON = {
    type: 'FeatureCollection',
    features: results.map((r) => ({
      type: 'Feature',
      properties: { name: r.name, code: r.code },
      geometry: { type: 'Point', coordinates: [r.label_lon, r.label_lat] },
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputGeoJSON, null, 2), 'utf8');

  console.log(`처리 완료: ${results.length}개 국가, 실패: ${errors.length}건`);
  if (errors.length > 0) {
    console.log('실패 목록:', errors);
  }
  console.log(`출력 파일: ${path.resolve(outputPath)}`);
}

// ---------------------------------------------------------------------------
// CLI 실행부
// ---------------------------------------------------------------------------
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg || !outputArg) {
    console.error(
      '사용법: node getCountryLabelPosition.js <input.geojson> <output.json>',
    );
    process.exit(1);
  }
  processAllCountries(inputArg, outputArg);
}

export {
  computeCountryLabelPosition,
  processAllCountries,
  unwrapRingLongitudes,
  pickLargestPolygon,
};
