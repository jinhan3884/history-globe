/**
 * Entity Registry builder (Work Order Phase A).
 *
 * Pure function: takes per-year feature collections, returns deduplicated
 * entities. Never mutates input features and never touches the polygon
 * files themselves.
 *
 * Merge rule: names that normalize to the same key (case/whitespace/
 * diacritics variation) are one entity. The canonical display name is the
 * most frequent original spelling; ties break alphabetically for
 * determinism.
 */
import type { FeatureCollection } from '../geojson/types';
import type { EntityRegistry, HistoryEntity } from './types';
import { entityIdFromName, nameKey } from './slug';

export interface YearSliceInput {
  file: string;
  /** Astronomical-style year (BC negative), from the filename. */
  year: number;
  collection: FeatureCollection;
}

interface EntityAccumulator {
  spellings: Map<string, number>;
  abbrevs: Set<string>;
  firstYear: number;
  lastYear: number;
  featureCount: number;
}

export interface RegistryBuildStats {
  totalFeatures: number;
  unnamedFeatures: number;
  namedFeatures: number;
  distinctSpellings: number;
  mergedSpellingGroups: number;
  entities: number;
}

export interface RegistryBuildResult {
  registry: EntityRegistry;
  stats: RegistryBuildStats;
}

function isEmptyName(name: unknown): boolean {
  return typeof name !== 'string' || name.trim().length === 0;
}

export function buildEntityRegistry(
  slices: YearSliceInput[],
  generatedAt = new Date().toISOString(),
): RegistryBuildResult {
  const byKey = new Map<string, EntityAccumulator>();

  let totalFeatures = 0;
  let unnamedFeatures = 0;

  for (const slice of slices) {
    for (const feature of slice.collection.features) {
      totalFeatures += 1;
      const name = feature.properties.NAME;
      if (isEmptyName(name)) {
        unnamedFeatures += 1;
        continue;
      }
      const trimmed = (name as string).trim();
      const key = nameKey(trimmed);
      if (key.length === 0) {
        unnamedFeatures += 1;
        continue;
      }

      let acc = byKey.get(key);
      if (!acc) {
        acc = {
          spellings: new Map(),
          abbrevs: new Set(),
          firstYear: slice.year,
          lastYear: slice.year,
          featureCount: 0,
        };
        byKey.set(key, acc);
      }
      acc.spellings.set(trimmed, (acc.spellings.get(trimmed) ?? 0) + 1);
      acc.featureCount += 1;
      acc.firstYear = Math.min(acc.firstYear, slice.year);
      acc.lastYear = Math.max(acc.lastYear, slice.year);

      const abbrev = feature.properties.ABBREVN;
      if (typeof abbrev === 'string' && abbrev.trim().length > 0) {
        acc.abbrevs.add(abbrev.trim());
      }
    }
  }

  const entities: HistoryEntity[] = [];
  let mergedSpellingGroups = 0;

  for (const [key, acc] of byKey) {
    const spellings = [...acc.spellings.entries()];
    // Canonical name: most frequent spelling, ties → alphabetical.
    spellings.sort(
      ([aName, aCount], [bName, bCount]) =>
        bCount - aCount || aName.localeCompare(bName),
    );
    const canonical = spellings[0]![0];
    const entityId = entityIdFromName(canonical);
    if (!entityId) continue; // slug empty after normalization — skip safely

    if (spellings.length > 1) mergedSpellingGroups += 1;

    // Aliases: alternate spellings + dataset abbreviations, minus the
    // canonical name itself.
    const aliases = new Set<string>();
    for (const [spelling] of spellings.slice(1)) aliases.add(spelling);
    for (const abbrev of acc.abbrevs) {
      if (nameKey(abbrev) !== key) aliases.add(abbrev);
    }

    entities.push({
      entityId,
      type: 'polity',
      name: canonical,
      aliases: [...aliases].sort(),
      wikidataId: null,
      matchStatus: 'unmatched',
      matchConfidence: null,
      matchMethod: null,
      matchedLabel: null,
      candidates: [],
      sourceFeatureNames: spellings.map(([spelling]) => spelling),
      firstYear: acc.firstYear,
      lastYear: acc.lastYear,
      featureCount: acc.featureCount,
    });
  }

  entities.sort((a, b) => a.entityId.localeCompare(b.entityId));

  const distinctSpellings = [...byKey.values()].reduce(
    (sum, acc) => sum + acc.spellings.size,
    0,
  );

  return {
    registry: {
      version: 1,
      generatedAt,
      entities,
    },
    stats: {
      totalFeatures,
      unnamedFeatures,
      namedFeatures: totalFeatures - unnamedFeatures,
      distinctSpellings,
      mergedSpellingGroups,
      entities: entities.length,
    },
  };
}

/** Convenience for scripts that load one collection per file. */
