/**
 * Phase A — extracts the History Atlas Entity Registry from the polygon
 * dataset. Reads data/world_*.geojson, deduplicates polity names into
 * entities, and writes data/entities.json (the polygon files are never
 * modified).
 *
 * Usage: npx tsx scripts/extract-entities.ts
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildEntityRegistry } from '../src/knowledge/entityRegistry';
import type { FeatureCollection } from '../src/geojson/types';

const DATA_DIR = 'data';
const OUT_PATH = 'data/entities.json';

function extractYear(filename: string): number | null {
  // world_bc123000 → -123000, world_100 → 100 (same convention as
  // scripts/prepare-data.ts and data/years.json).
  const m = filename.match(/^world_(?:bc)?(\d+)\.geojson$/);
  if (!m) return null;
  const num = parseInt(m[1]!, 10);
  return filename.includes('bc') ? -num : num;
}

function main() {
  const files = readdirSync(DATA_DIR)
    .filter((f) => /^world_(?:bc)?\d+\.geojson$/.test(f))
    .sort();

  const slices = files
    .map((file) => {
      const year = extractYear(file);
      if (year === null) return null;
      const collection: FeatureCollection = JSON.parse(
        readFileSync(join(DATA_DIR, file), 'utf8'),
      );
      return { file, year, collection };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const { registry, stats } = buildEntityRegistry(slices);

  writeFileSync(OUT_PATH, JSON.stringify(registry, null, 2) + '\n');

  console.log(`[extract-entities] slices loaded: ${slices.length}`);
  console.log(`[extract-entities] total features: ${stats.totalFeatures}`);
  console.log(
    `[extract-entities] unnamed features skipped: ${stats.unnamedFeatures}`,
  );
  console.log(`[extract-entities] named features: ${stats.namedFeatures}`);
  console.log(
    `[extract-entities] distinct NAME spellings: ${stats.distinctSpellings}`,
  );
  console.log(
    `[extract-entities] spelling groups merged: ${stats.mergedSpellingGroups}`,
  );
  console.log(`[extract-entities] entities: ${stats.entities}`);
  console.log(`[extract-entities] wrote ${OUT_PATH}`);
}

main();
