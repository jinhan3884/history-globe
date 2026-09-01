import { describe, it, expect } from 'vitest';
import { buildEntityRegistry } from '../src/knowledge/entityRegistry';
import { entityIdFromName, nameKey } from '../src/knowledge/slug';
import type { Feature, FeatureCollection } from '../src/geojson/types';
import type { YearSliceInput } from '../src/knowledge/entityRegistry';

function poly(properties: Record<string, unknown>): Feature {
  const coordinates: unknown = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ];
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coordinates as never },
    properties,
  };
}

function fc(...features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function slice(
  file: string,
  year: number,
  features: Feature[],
): YearSliceInput {
  return { file, year, collection: fc(...features) };
}

describe('entityIdFromName', () => {
  it('produces stable ASCII slugs', () => {
    expect(entityIdFromName('Roman Empire')).toBe('ha:polity:roman_empire');
    expect(entityIdFromName('Monte Albán')).toBe('ha:polity:monte_alban');
    expect(entityIdFromName('Joseon')).toBe('ha:polity:joseon');
  });

  it('is deterministic across runs', () => {
    expect(entityIdFromName('Kingdom of France')).toBe(
      entityIdFromName('Kingdom of France'),
    );
  });

  it('returns null for names with no usable slug characters', () => {
    expect(entityIdFromName('★')).toBeNull();
    expect(entityIdFromName('')).toBeNull();
  });
});

describe('buildEntityRegistry', () => {
  it('deduplicates the same polity name across multiple time slices', () => {
    const result = buildEntityRegistry([
      slice('world_bc100', -100, [poly({ NAME: 'Roman Empire' })]),
      slice('world_100', 100, [poly({ NAME: 'Roman Empire' })]),
      slice('world_200', 200, [poly({ NAME: 'Roman Empire' })]),
    ]);
    expect(result.stats.entities).toBe(1);
    const entity = result.registry.entities[0]!;
    expect(entity.entityId).toBe('ha:polity:roman_empire');
    expect(entity.firstYear).toBe(-100);
    expect(entity.lastYear).toBe(200);
    expect(entity.featureCount).toBe(3);
    expect(entity.matchStatus).toBe('unmatched');
    expect(entity.wikidataId).toBeNull();
  });

  it('skips null and missing names', () => {
    const result = buildEntityRegistry([
      slice('world_100', 100, [
        poly({ NAME: null }),
        poly({}),
        poly({ NAME: 'Dacia' }),
      ]),
    ]);
    expect(result.stats.unnamedFeatures).toBe(2);
    expect(result.stats.entities).toBe(1);
    expect(result.registry.entities[0]!.name).toBe('Dacia');
  });

  it('skips whitespace-only names', () => {
    const result = buildEntityRegistry([
      slice('world_100', 100, [poly({ NAME: '   ' }), poly({ NAME: 'Dacia' })]),
    ]);
    expect(result.stats.unnamedFeatures).toBe(1);
    expect(result.stats.entities).toBe(1);
  });

  it('merges whitespace variation into one entity', () => {
    const result = buildEntityRegistry([
      slice('world_100', 100, [
        poly({ NAME: 'Han' }),
        poly({ NAME: ' Han  ' }),
      ]),
    ]);
    expect(result.stats.entities).toBe(1);
    expect(result.registry.entities[0]!.sourceFeatureNames).toEqual(['Han']);
    expect(result.registry.entities[0]!.featureCount).toBe(2);
  });

  it('merges case variation and keeps the most frequent spelling', () => {
    const result = buildEntityRegistry([
      slice('world_100', 100, [
        poly({ NAME: 'dacia' }),
        poly({ NAME: 'Dacia' }),
        poly({ NAME: 'DACIA' }),
        poly({ NAME: 'Dacia' }),
      ]),
    ]);
    expect(result.stats.entities).toBe(1);
    expect(result.registry.entities[0]!.name).toBe('Dacia');
    expect(result.registry.entities[0]!.sourceFeatureNames).toHaveLength(3);
    expect(result.stats.mergedSpellingGroups).toBe(1);
  });

  it('merges diacritics variation into one entity', () => {
    expect(nameKey('Monte Albán')).toBe(nameKey('Monte Alban'));
  });

  it('keeps distinct polities as separate entities', () => {
    const result = buildEntityRegistry([
      slice('world_100', 100, [
        poly({ NAME: 'Han', ABBREVN: null }),
        poly({ NAME: 'Parthian Empire' }),
      ]),
    ]);
    expect(result.stats.entities).toBe(2);
    expect(result.registry.entities.map((e) => e.entityId)).toEqual([
      'ha:polity:han',
      'ha:polity:parthian_empire',
    ]);
  });

  it('collects ABBREVN values distinct from the name as aliases', () => {
    const result = buildEntityRegistry([
      slice('world_100', 100, [
        poly({ NAME: 'Roman Empire', ABBREVN: 'R.E.' }),
        poly({ NAME: 'Roman Empire', ABBREVN: 'ROM' }),
      ]),
    ]);
    expect(result.registry.entities[0]!.aliases).toEqual(['R.E.', 'ROM']);
  });

  it('does not alias an ABBREVN equal to the canonical name', () => {
    const result = buildEntityRegistry([
      slice('world_100', 100, [poly({ NAME: 'Dacia', ABBREVN: 'Dacia' })]),
    ]);
    expect(result.registry.entities[0]!.aliases).toEqual([]);
  });

  it('produces a deterministic registry across runs', () => {
    const input = [
      slice('world_100', 100, [poly({ NAME: 'Dacia' })]),
      slice('world_200', 200, [poly({ NAME: 'Han' })]),
    ];
    const a = buildEntityRegistry(input, '2026-01-01T00:00:00Z');
    const b = buildEntityRegistry(input, '2026-01-01T00:00:00Z');
    expect(a.registry).toEqual(b.registry);
  });
});
