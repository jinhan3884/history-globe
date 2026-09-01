/**
 * Phase B — resolves History Atlas entities to Wikidata QIDs.
 *
 * Build-time only (Work Order §B-5). Reads data/entities.json, searches
 * Wikidata per entity, scores candidates with name/alias + polity-type +
 * temporal signals, classifies confirmed/probable/ambiguous/unmatched, and
 * writes the registry back. Never modifies the polygon files.
 *
 * Determinism + rate-limit safety:
 *   - raw API responses are cached in data/knowledge/wikidata-*.cache.json,
 *     so re-runs never repeat identical requests and stay deterministic;
 *   - requests are sequential with small delays, no parallel bursts;
 *   - an API failure skips the entity (kept unmatched with its previous
 *     value) instead of corrupting existing data (Work Order §B).
 *
 * Usage: npx tsx scripts/match-wikidata.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WikidataApiError,
  firstClaimYear,
  getWikidataEntities,
  searchWikidataEntity,
} from '../src/knowledge/wikidata';
import {
  classifyMatches,
  scoreCandidate,
  type CandidateClaims,
  type MatchTarget,
} from '../src/knowledge/matchScore';
import { applyOverrides, type OverrideFile } from '../src/knowledge/overrides';
import type { EntityRegistry, HistoryEntity } from '../src/knowledge/types';

const REGISTRY_PATH = 'data/entities.json';
const OVERRIDES_PATH = 'data/entity-overrides.json';
const CACHE_DIR = 'data/knowledge';
const SEARCH_CACHE_PATH = join(CACHE_DIR, 'wikidata-search.cache.json');
const ENTITY_CACHE_PATH = join(CACHE_DIR, 'wikidata-entity.cache.json');
const TYPE_CLOSURE_PATH = join(CACHE_DIR, 'wikidata-type-closure.json');

const SEARCH_DELAY_MS = 100;
const BATCH_DELAY_MS = 250;
const SEARCH_LIMIT = 5;
const BATCH_SIZE = 50;

/** Root classes whose P279* subclass closure counts as "polity-like". */
const POLITY_ROOT_CLASSES = [
  'Q3024330', // historical country
  'Q6256', // country
  'Q7275', // state
  'Q1790360', // empire
];

const fetcher: typeof fetch = globalThis.fetch;

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

type SearchCache = Record<
  string,
  Array<{
    qid: string;
    label: string | null;
    description: string | null;
    matchType: string | null;
  }>
>;
type EntityCache = Record<
  string,
  {
    missing: boolean;
    label: string | null;
    description: string | null;
    aliases: string[];
    p31: string[];
    inceptionYear: number | null;
    dissolutionYear: number | null;
    enwikiTitle: string | null;
  }
>;

async function fetchTypeClosure(): Promise<Set<string>> {
  const cached = loadJson<Record<string, string[]>>(TYPE_CLOSURE_PATH, {});
  const cacheKey = POLITY_ROOT_CLASSES.join(',');
  if (cached[cacheKey]) return new Set(cached[cacheKey]!);

  const query = `
    SELECT DISTINCT ?c WHERE {
      VALUES ?root { ${POLITY_ROOT_CLASSES.map((q) => `wd:${q}`).join(' ')} }
      ?c wdt:P279* ?root .
    }`;
  const url =
    'https://query.wikidata.org/sparql?format=json&query=' +
    encodeURIComponent(query);
  const res = await fetcher(url, {
    headers: {
      'User-Agent':
        'HistoryAtlas/0.1 (https://historyatlas.net; knowledge-layer build script)',
      Accept: 'application/sparql-results+json',
    },
  });
  if (!res.ok) {
    throw new Error(`Wikidata SPARQL HTTP ${res.status}`);
  }
  const raw = (await res.json()) as {
    results?: { bindings?: Array<{ c?: { value?: string } }> };
  };
  const qids = (raw.results?.bindings ?? [])
    .map((binding) => binding.c?.value ?? '')
    .map((uri) => uri.replace(/^http:\/\/www\.wikidata\.org\/entity\//, ''))
    .filter((qid) => /^Q\d+$/.test(qid));
  const closure = new Set([...POLITY_ROOT_CLASSES, ...qids]);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    TYPE_CLOSURE_PATH,
    JSON.stringify({ ...cached, [cacheKey]: [...closure] }, null, 2) + '\n',
  );
  console.log(`[match-wikidata] type closure fetched: ${closure.size} classes`);
  return closure;
}

async function ensureSearches(entities: HistoryEntity[]): Promise<SearchCache> {
  const cache = loadJson<SearchCache>(SEARCH_CACHE_PATH, {});
  let fetched = 0;
  for (const entity of entities) {
    if (cache[entity.name]) continue;
    await sleep(SEARCH_DELAY_MS);
    try {
      const results = await searchWikidataEntity(fetcher, entity.name, {
        limit: SEARCH_LIMIT,
      });
      cache[entity.name] = results;
      fetched += 1;
    } catch (error) {
      // Skip the entity this round; its previous match value is preserved.
      console.warn(
        `[match-wikidata] search failed for "${entity.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      cache[entity.name] = [];
    }
    if (fetched > 0 && fetched % 200 === 0) {
      writeFileSync(SEARCH_CACHE_PATH, JSON.stringify(cache));
      console.log(`[match-wikidata] progress: ${fetched} searches fetched`);
    }
  }
  writeFileSync(SEARCH_CACHE_PATH, JSON.stringify(cache));
  console.log(`[match-wikidata] searches fetched this run: ${fetched}`);
  return cache;
}

async function ensureEntities(qids: string[]): Promise<EntityCache> {
  const cache = loadJson<EntityCache>(ENTITY_CACHE_PATH, {});
  const missing = [...new Set(qids)].filter((qid) => !(qid in cache));
  for (const batch of chunk(missing, BATCH_SIZE)) {
    await sleep(BATCH_DELAY_MS);
    try {
      const entities = await getWikidataEntities(fetcher, batch);
      for (const entity of entities.values()) {
        cache[entity.qid] = {
          missing: entity.missing,
          label: entity.label,
          description: entity.description,
          aliases: entity.aliases,
          p31: entity.claims.P31 ?? [],
          inceptionYear: firstClaimYear(entity.claims, 'P571'),
          dissolutionYear: firstClaimYear(entity.claims, 'P576'),
          enwikiTitle: entity.enwikiTitle,
        };
      }
    } catch (error) {
      console.warn(
        `[match-wikidata] entity batch failed (${batch[0]}…): ${
          error instanceof WikidataApiError
            ? `${error.message} (status ${error.status})`
            : String(error)
        } — cached QIDs kept, batch skipped`,
      );
    }
    writeFileSync(ENTITY_CACHE_PATH, JSON.stringify(cache));
  }
  return cache;
}

function toCandidateClaims(
  cached: EntityCache[string],
  qid: string,
): CandidateClaims {
  return {
    qid,
    label: cached.label,
    description: cached.description,
    aliases: cached.aliases,
    p31: cached.p31,
    inceptionYear: cached.inceptionYear,
    dissolutionYear: cached.dissolutionYear,
  };
}

async function main() {
  const registry: EntityRegistry = loadJson(REGISTRY_PATH, {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    entities: [],
  });

  const overrides = loadJson<OverrideFile>(OVERRIDES_PATH, {});
  const withOverrides = applyOverrides(registry.entities, overrides);
  for (const bad of withOverrides.invalid) {
    console.warn(
      `[match-wikidata] invalid QID "${bad.qid}" for ${bad.entityId} — override skipped`,
    );
  }
  let entities = withOverrides.entities;
  console.log(
    `[match-wikidata] manual overrides applied: ${withOverrides.applied.length}`,
  );

  const typeClosure = await fetchTypeClosure();

  // Only entities without a confirmed match go through resolution.
  const toMatch = entities.filter((e) => e.matchStatus !== 'confirmed');
  console.log(`[match-wikidata] entities to match: ${toMatch.length}`);

  const searchCache = await ensureSearches(toMatch);
  const qids = toMatch.flatMap((e) =>
    (searchCache[e.name] ?? []).map((r) => r.qid),
  );
  const entityCache = await ensureEntities(qids);

  let failed = 0;
  entities = entities.map((entity) => {
    if (entity.matchStatus === 'confirmed') return entity;
    const results = searchCache[entity.name];
    if (results === undefined) {
      // Search failed for this entity this run — keep previous value.
      failed += 1;
      return entity;
    }
    const target: MatchTarget = {
      name: entity.name,
      aliases: entity.aliases,
      firstYear: entity.firstYear,
      lastYear: entity.lastYear,
    };
    const scored = results
      .filter((r) => /^Q\d+$/.test(r.qid))
      .filter((r) => !entityCache[r.qid]?.missing)
      .map((r) =>
        scoreCandidate(
          toCandidateClaims(entityCache[r.qid]!, r.qid),
          target,
          typeClosure,
        ),
      );
    const decision = classifyMatches(scored);
    return {
      ...entity,
      wikidataId: decision.top?.qid ?? null,
      matchStatus: decision.status,
      matchConfidence: decision.confidence,
      matchMethod: decision.method,
      matchedLabel: decision.top?.label ?? null,
      candidates: decision.candidates,
    };
  });

  const counts = { confirmed: 0, probable: 0, ambiguous: 0, unmatched: 0 };
  for (const entity of entities) counts[entity.matchStatus] += 1;

  writeFileSync(
    REGISTRY_PATH,
    JSON.stringify({ ...registry, entities }, null, 2) + '\n',
  );

  console.log('[match-wikidata] ---- results ----');
  console.log(`total:     ${entities.length}`);
  console.log(`confirmed: ${counts.confirmed}`);
  console.log(`probable:  ${counts.probable}`);
  console.log(`ambiguous: ${counts.ambiguous}`);
  console.log(`unmatched: ${counts.unmatched}`);
  console.log(`api-skipped (kept previous): ${failed}`);
}

void main();
