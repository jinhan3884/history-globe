/**
 * Loads normalized GeoJSON for a given year, with an in-memory LRU cache.
 * Previously loaded years are served instantly from cache.
 */

import type { FeatureCollection } from './types';

const MAX_CACHE = 5;
const cache = new Map<string, FeatureCollection>();
const loading = new Map<string, Promise<FeatureCollection>>();

function evictOldest() {
  if (cache.size <= MAX_CACHE) return;
  const oldest = cache.keys().next().value;
  if (oldest) cache.delete(oldest);
}

export async function loadYear(file: string): Promise<FeatureCollection> {
  const cached = cache.get(file);
  if (cached) {
    // Refresh LRU order
    cache.delete(file);
    cache.set(file, cached);
    return cached;
  }

  const pending = loading.get(file);
  if (pending) return pending;

  const promise = (async () => {
    const res = await fetch(`/data/${file}`);
    if (!res.ok) throw new Error(`Failed to load ${file}: HTTP ${res.status}`);
    const data: FeatureCollection = await res.json();
    cache.set(file, data);
    evictOldest();
    loading.delete(file);
    return data;
  })();

  loading.set(file, promise);
  return promise;
}
