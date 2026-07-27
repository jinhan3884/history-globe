import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryType,
} from './types';

/**
 * Result of a structural parse + basic validation.
 *
 * `featureCount` reflects the number of features observed in the source
 * collection, regardless of validity, so callers can detect a "lost feature"
 * even when `Error` is thrown elsewhere. Thrown errors instead surface via
 * the `LoadError` class below.
 */
export interface LoadResult {
  /** The validated collection. Features may still contain geometry issues
   *  that are out of scope for M1 (dateline crossing, self-intersection);
   *  those wait for M2 diagnostics. */
  collection: FeatureCollection;
  /** Number of features seen in the source payload. */
  featureCount: number;
  /** Number of features whose name field resolved to a non-null string. */
  namedFeatureCount: number;
}

/**
 * Error thrown when the top-level shape is not a GeoJSON FeatureCollection we
 * can hand to Cesium. Downstream code surfaces this to the user via the
 * `errorPanel` UI module.
 */
export class GeoJsonLoadError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'GeoJsonLoadError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

const ALLOWED_GEOMETRY_TYPES: ReadonlySet<GeometryType> = new Set([
  'MultiPolygon',
  'Polygon',
]);

/**
 * Fetch and parse a GeoJSON FeatureCollection from `url`.
 *
 * This performs only the *structural* validation necessary in M1: the
 * top-level type tag is correct, features is an array, and each feature has
 * a recognised geometry. Coordinate-level diagnostics (finiteness, closure,
 * winding, range, dateline jumps) are squarely in M2 scope and are not
 * attempted here.
 *
 * Source properties are preserved byte-for-byte; no repair happens in M1.
 */
export async function loadGeoJson(url: string): Promise<LoadResult> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (networkError) {
    throw new GeoJsonLoadError(
      `Failed to reach the dataset at ${url}.`,
      networkError,
    );
  }

  if (!response.ok) {
    throw new GeoJsonLoadError(
      `Dataset request failed with HTTP ${response.status} ${response.statusText} at ${url}.`,
    );
  }

  const text = await response.text();

  let parsed: unknown;
  try {
    // Strip a leading UTF-8 BOM if present, then trim whitespace. The MVP
    // dataset does not carry a BOM today, but the legacy viewer did this
    // defensively and we keep the behaviour.
    const cleaned = text.replace(/^\uFEFF/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (parseError) {
    throw new GeoJsonLoadError('Dataset is not valid JSON.', parseError);
  }

  return validateFeatureCollection(parsed);
}

function validateFeatureCollection(parsed: unknown): LoadResult {
  if (!isObject(parsed)) {
    throw new GeoJsonLoadError('Top-level JSON is not an object.');
  }
  if ((parsed as { type?: unknown }).type !== 'FeatureCollection') {
    throw new GeoJsonLoadError(
      `Expected a FeatureCollection; received type "${String((parsed as { type?: unknown }).type)}".`,
    );
  }
  const features = (parsed as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    throw new GeoJsonLoadError('FeatureCollection.features is not an array.');
  }

  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [],
  };
  let named = 0;

  features.forEach((raw, index) => {
    const feature = validateFeature(raw, index);
    collection.features.push(feature);
    if (feature.properties.NAME && feature.properties.NAME.length > 0) {
      named += 1;
    }
  });

  return {
    collection,
    featureCount: features.length,
    namedFeatureCount: named,
  };
}

function validateFeature(raw: unknown, index: number): Feature {
  if (!isObject(raw)) {
    throw new GeoJsonLoadError(`Feature at index ${index} is not an object.`);
  }
  if ((raw as { type?: unknown }).type !== 'Feature') {
    throw new GeoJsonLoadError(
      `Feature at index ${index} has type "${String(
        (raw as { type?: unknown }).type,
      )}", expected "Feature".`,
    );
  }
  const geometry = (raw as { geometry?: unknown }).geometry;
  if (!isObject(geometry)) {
    throw new GeoJsonLoadError(
      `Feature at index ${index} has no geometry object.`,
    );
  }
  if (!ALLOWED_GEOMETRY_TYPES.has(geometry.type as GeometryType)) {
    throw new GeoJsonLoadError(
      `Feature at index ${index} has unsupported geometry type "${String(
        geometry.type,
      )}" (M1 supports MultiPolygon/Polygon only).`,
    );
  }
  if (!Array.isArray((geometry as { coordinates?: unknown }).coordinates)) {
    throw new GeoJsonLoadError(
      `Feature at index ${index} has non-array geometry.coordinates.`,
    );
  }
  const properties = (raw as { properties?: unknown }).properties;
  // Properties may be null in RFC 7946; normalise to an empty record so the
  // signature stays simple downstream. We do not mutate the parsed object
  // in place — we copy properties as-is to preserve provenance.
  const safeProperties =
    isObject(properties) || properties == null
      ? (properties as Record<string, unknown> | null)
      : null;
  if (safeProperties === null) {
    throw new GeoJsonLoadError(
      `Feature at index ${index} has non-object properties.`,
    );
  }

  return {
    type: 'Feature',
    geometry: geometry as unknown as Geometry,
    properties: (safeProperties ?? {}) as Feature['properties'],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
