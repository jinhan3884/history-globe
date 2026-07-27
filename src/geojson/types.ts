/**
 * Minimal GeoJSON type definitions used by the generic layer.
 *
 * We deliberately keep these narrower than the full RFC 7946 surface so the
 * MVP stays small. Anything outside the live dataset
 * `data/historical-basemaps/world_100.geojson` (440 MultiPolygon features with
 * `NAME/ABBREVN/SUBJECTO/BORDERPRECISION/PARTOF` properties) is out of scope
 * here; Milestone 2 expands this typing.
 *
 * Coordinate numbering follows the GeoJSON spec: `[longitude, latitude]`,
 * with an optional numeric height in third position.
 */

export type Position = [number, number] | [number, number, number];

/** A closed ring of positions. Type alias only; closure is checked later. */
export type LinearRing = Position[];

export type Polygon = LinearRing[];

export type MultiPolygon = Polygon[];

export type GeometryType = 'MultiPolygon' | 'Polygon';

export interface Geometry {
  type: GeometryType;
  coordinates: MultiPolygon | Polygon;
}

/**
 * Properties carried by a feature. The MVP dataset uses a fixed set of
 * string-or-null keys, but properties is open by default — anything not in
 * the known keys still round-trips untouched. We declare the known keys so
 * safe-name resolution can be typed.
 */
export interface FeatureProperties {
  NAME?: string | null;
  ABBREVN?: string | null;
  SUBJECTO?: string | null;
  BORDERPRECISION?: number | null;
  PARTOF?: string | null;
  [key: string]: unknown;
}

export interface Feature {
  type: 'Feature';
  geometry: Geometry;
  properties: FeatureProperties;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

/**
 * Neutral display label used when a feature has no usable name. Defined once
 * so the user-facing string never diverges between the fallback paths.
 */
export const UNNAMED_LABEL = 'Unknown / Unrecorded territory';
