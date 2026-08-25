/**
 * Downloads all 53 historical basemap GeoJSON files from the
 * aourednik/historical-basemaps GitHub repository into data/raw/.
 *
 * Usage: npx tsx scripts/download-raw.ts
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL =
  'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson';
const OUT_DIR = 'data/raw';

const FILES = [
  'world_bc123000',
  'world_bc10000',
  'world_bc8000',
  'world_bc5000',
  'world_bc4000',
  'world_bc3000',
  'world_bc2000',
  'world_bc1500',
  'world_bc1000',
  'world_bc700',
  'world_bc500',
  'world_bc400',
  'world_bc323',
  'world_bc300',
  'world_bc200',
  'world_bc100',
  'world_bc1',
  'world_100',
  'world_200',
  'world_300',
  'world_400',
  'world_500',
  'world_600',
  'world_700',
  'world_800',
  'world_900',
  'world_1000',
  'world_1100',
  'world_1200',
  'world_1279',
  'world_1300',
  'world_1400',
  'world_1492',
  'world_1500',
  'world_1530',
  'world_1600',
  'world_1650',
  'world_1700',
  'world_1715',
  'world_1783',
  'world_1800',
  'world_1815',
  'world_1880',
  'world_1900',
  'world_1914',
  'world_1920',
  'world_1930',
  'world_1938',
  'world_1945',
  'world_1960',
  'world_1994',
  'world_2000',
  'world_2010',
];

async function download(name: string): Promise<boolean> {
  const outFile = join(OUT_DIR, `${name}.geojson`);
  if (existsSync(outFile)) {
    console.log(`  skip ${name} (already downloaded)`);
    return true;
  }
  const url = `${BASE_URL}/${name}.geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  FAIL ${name}: HTTP ${res.status}`);
      return false;
    }
    const body = await res.text();
    // Validate JSON
    JSON.parse(body);
    writeFileSync(outFile, body, 'utf-8');
    console.log(`  ok ${name} (${(body.length / 1024).toFixed(0)} KB)`);
    return true;
  } catch (e) {
    console.error(`  FAIL ${name}: ${e}`);
    return false;
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0;
  let fail = 0;
  for (const name of FILES) {
    if (await download(name)) ok++;
    else fail++;
  }
  console.log(`\nDone: ${ok} ok, ${fail} failed, ${FILES.length} total`);
  if (fail > 0) process.exit(1);
}

main();
