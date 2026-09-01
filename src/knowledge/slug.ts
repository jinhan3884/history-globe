/**
 * Deterministic History Atlas entity ID generation (Work Order §A-5).
 *
 * Rules: lowercase, ASCII, stable across runs. The slug function is isolated
 * here so the scheme can be swapped later without touching callers. MVP uses
 * name-derived slugs; a future migration can map these to numeric IDs.
 *
 * Collisions between genuinely distinct names are possible but rare; the
 * registry builder merges such names into one entity and records every
 * original spelling in `sourceFeatureNames` so the merge stays auditable.
 */

export function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics → ASCII
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
}

export function entityIdFromName(name: string): string | null {
  const slug = slugifyName(name);
  if (slug.length === 0) return null;
  return `ha:polity:${slug}`;
}

/**
 * Normalized merge key for entity identity: case/whitespace/diacritics
 * variations of the same name collapse into one entity.
 */
export function nameKey(name: string): string {
  return slugifyName(name);
}
