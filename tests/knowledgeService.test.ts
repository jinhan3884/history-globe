import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  lookupFeatureName,
  resetCaches,
} from '../src/knowledge/knowledgeService';
import type {
  EntityKnowledge,
  EntityRegistry,
  HistoryEntity,
} from '../src/knowledge/types';

const entity: HistoryEntity = {
  entityId: 'ha:polity:roman_empire',
  type: 'polity',
  name: 'Roman Empire',
  aliases: [],
  wikidataId: 'Q2277',
  matchStatus: 'confirmed',
  matchConfidence: 0.98,
  matchMethod: 'name+alias+type+temporal',
  matchedLabel: 'Roman Empire',
  candidates: [],
  sourceFeatureNames: ['Roman Empire'],
  firstYear: -27,
  lastYear: 476,
  featureCount: 3,
};

const registry: EntityRegistry = {
  version: 1,
  generatedAt: '2026-09-01T00:00:00Z',
  entities: [entity],
};

const knowledge: Record<string, EntityKnowledge> = {
  'ha:polity:roman_empire': {
    entityId: 'ha:polity:roman_empire',
    wikidataId: 'Q2277',
    label: 'Roman Empire',
    description: 'ancient empire',
    inception: '27 BC',
    dissolution: '476 CE',
    capitals: [{ label: 'Rome', wikidataId: 'Q220' }],
    predecessors: [],
    successors: [],
    wikipedia: {
      language: 'en',
      title: 'Roman Empire',
      summary: 'The Roman Empire was…',
      url: 'https://en.wikipedia.org/wiki/Roman_Empire',
      thumbnailUrl: null,
    },
    provenance: {
      wikidataFetchedAt: '2026-09-01T00:00:00Z',
      wikipediaFetchedAt: '2026-09-01T00:00:00Z',
    },
  },
};

const knowledgeRegistry = {
  version: 1 as const,
  generatedAt: '2026-09-01T00:00:00Z',
  knowledge,
};

afterEach(() => {
  resetCaches();
  vi.unstubAllGlobals();
});

function stubFetch(responses: Map<string, unknown | Error>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const body = responses.get(String(url));
      if (body instanceof Error) throw body;
      if (body === undefined) {
        return new Response('{"error":"not found"}', { status: 404 });
      }
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

function registryAndKnowledge(): Map<string, unknown | Error> {
  return new Map<string, unknown | Error>([
    ['/data/entities.json', registry],
    ['/data/knowledge/entities-knowledge.json', knowledgeRegistry],
  ]);
}

describe('lookupFeatureName', () => {
  it('resolves a matched entity with its knowledge', async () => {
    stubFetch(registryAndKnowledge());
    const result = await lookupFeatureName('Roman Empire');
    expect(result.entity?.entityId).toBe('ha:polity:roman_empire');
    expect(result.knowledge?.wikipedia?.url).toContain('wikipedia.org');
  });

  it('matches case/whitespace variants of the same name', async () => {
    stubFetch(registryAndKnowledge());
    const result = await lookupFeatureName('  roman empire ');
    expect(result.entity?.entityId).toBe('ha:polity:roman_empire');
  });

  it('returns null entity for an unmatched feature name', async () => {
    stubFetch(registryAndKnowledge());
    const result = await lookupFeatureName('Atlantis');
    expect(result.entity).toBeNull();
    expect(result.knowledge).toBeNull();
  });

  it('still returns the entity when the knowledge JSON fails to load', async () => {
    stubFetch(
      new Map<string, unknown | Error>([
        ['/data/entities.json', registry],
        ['/data/knowledge/entities-knowledge.json', new Error('HTTP 500')],
      ]),
    );
    const result = await lookupFeatureName('Roman Empire');
    expect(result.entity?.entityId).toBe('ha:polity:roman_empire');
    expect(result.knowledge).toBeNull();
  });

  it('propagates a registry load failure so the panel shows its error state', async () => {
    stubFetch(
      new Map<string, unknown | Error>([
        ['/data/entities.json', new Error('HTTP 500')],
      ]),
    );
    await expect(lookupFeatureName('Roman Empire')).rejects.toThrow();
  });

  it('serves repeat lookups from the in-memory cache without refetching', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const payload = String(url).endsWith('entities-knowledge.json')
        ? knowledge
        : registry;
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await lookupFeatureName('Roman Empire');
    await lookupFeatureName('Roman Empire');
    // One fetch per static JSON file, none repeated for the second click.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
