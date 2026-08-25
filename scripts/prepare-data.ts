/**
 * Pre-processes all raw GeoJSON files through the normalization pipeline
 * and outputs normalized files + years.json to data/ (which gets copied
 * to dist/data/ by Vite).
 *
 * Usage: npx tsx scripts/prepare-data.ts
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { normalizeFeatureCollection } from '../src/geojson/normalize';
import { trimThinOverlaps } from '../src/geojson/trimOverlaps';
import type { FeatureCollection } from '../src/geojson/types';

const RAW_DIR = 'data/raw';
const OUT_DIR = 'data';

interface YearEntry {
  year: number;
  file: string;
  label: string;
}

function extractYear(filename: string): { year: number; label: string } | null {
  // world_bc123000 → year: -123000, label: "BC 123,000"
  // world_100 → year: 100, label: "100 CE"
  const m = filename.match(/^world_(?:bc)?(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1]!, 10);
  const isBC = filename.includes('bc');
  const year = isBC ? -num : num;
  const label = isBC
    ? `BC ${num.toLocaleString()}`
    : `${num.toLocaleString()} CE`;
  return { year, label };
}

function normalizeFile(filename: string): boolean {
  const inPath = join(RAW_DIR, filename);
  const outPath = join(OUT_DIR, filename);
  if (!existsSync(inPath)) return false;

  try {
    const raw: FeatureCollection = JSON.parse(readFileSync(inPath, 'utf-8'));
    let result: FeatureCollection;
    try {
      const norm = normalizeFeatureCollection(raw);
      const trimmed = trimThinOverlaps(norm.collection);
      result = trimmed.collection;
    } catch {
      // Normalize or trim failed (e.g., polygon-clipping on complex geometry)
      // Fall back to raw data — better than no data
      console.warn(`  WARN ${filename}: normalize/trim failed, using raw data`);
      result = raw;
    }

    writeFileSync(outPath, JSON.stringify(result), 'utf-8');
    const inKB = (JSON.stringify(raw).length / 1024).toFixed(0);
    const outKB = (JSON.stringify(result).length / 1024).toFixed(0);
    const feats = result.features.length;
    console.log(`  ok ${filename}: ${feats} feats, ${inKB}KB → ${outKB}KB`);
    return true;
  } catch (e) {
    console.error(`  FAIL ${filename}: ${e}`);
    return false;
  }
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = readdirSync(RAW_DIR).filter(
    (f) => f.endsWith('.geojson') && f !== 'places.geojson',
  );
  const years: YearEntry[] = [];

  let ok = 0,
    fail = 0;
  for (const filename of files.sort()) {
    const info = extractYear(filename.replace('.geojson', ''));
    if (!info) continue;
    if (normalizeFile(filename)) {
      ok++;
      years.push({ year: info.year, file: filename, label: info.label });
    } else {
      fail++;
    }
  }

  // Sort by year
  years.sort((a, b) => a.year - b.year);

  // Write years.json
  const yearsPath = join(OUT_DIR, 'years.json');
  writeFileSync(yearsPath, JSON.stringify(years, null, 2), 'utf-8');
  console.log(`\nyears.json: ${years.length} entries`);

  console.log(`Done: ${ok} ok, ${fail} failed, ${files.length} total`);
  if (fail > 0) process.exit(1);
}

main();
