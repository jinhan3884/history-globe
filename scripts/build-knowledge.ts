/**
 * Phase C — builds the pre-generated knowledge JSON.
 *
 * For every entity with a confirmed/probable Wikidata QID this script:
 *   1. fetches the small structured fact set (label, description, aliases,
 *      inception P571, dissolution P576, capital P36, predecessor P155,
 *      successor P1366, enwiki sitelink);
 *   2. resolves referenced QIDs to English labels;
 *   3. fetches the English Wikipedia summary for the sitelink.
 *
 * Output: data/knowledge/entities-knowledge.json (KnowledgeRegistry, keyed
 * by entityId) consumed at runtime by src/knowledge/knowledgeService.ts.
 * No backend is introduced — the static JSON ships with the site.
 *
 * Determinism + rate-limit safety: every API response is cached under
 * data/knowledge/*.cache.json so re-runs never repeat identical requests
 * and never destroy existing output on failure (Work Order §8).
 *
 * Usage: npx tsx scripts/build-knowledge.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  firstClaimQids,
  firstClaimYear,
  getWikidataEntities,
} from '../src/knowledge/wikidata';
import { fetchWikipediaSummary } from '../src/knowledge/wikipedia';
import type {
  EntityKnowledge,
  EntityRegistry,
  KnowledgeRegistry,
  KnowledgeReference,
  WikipediaKnowledge,
} from '../src/knowledge/types';

const REGISTRY_PATH = 'data/entities.json';
const OUT_PATH = join('data/knowledge', 'entities-knowledge.json');
const FACTS_CACHE_PATH = join('data/knowledge', 'wikidata-facts.cache.json');
const LABEL_CACHE_PATH = join('data/knowledge', 'wikidata-labels.cache.json');
const WIKI_CACHE_PATH = join('data/knowledge', 'wikipedia.cache.json');

const BATCH_DELAY_MS = 250;
const WIKI_DELAY_MS = 150;
const BATCH_SIZE = 50;
/** Claims fetched per entity: inception, dissolution, capital, predecessor, successor. */
const FACT_PROPS = ['P571', 'P576', 'P36', 'P155', 'P1366'];

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

interface CachedFacts {
  label: string | null;
  description: string | null;
  aliases: string[];
  inceptionYear: number | null;
  dissolutionYear: number | null;
  capitalQids: string[];
  predecessorQids: string[];
  successorQids: string[];
  enwikiTitle: string | null;
  missing: boolean;
}

type LabelCache = Record<string, string | null>;
type WikiCache = Record<string, WikipediaKnowledge | null>;

function formatYear(year: number | null): string | null {
  if (year === null) return null;
  return year < 0 ? `${-year} BC` : `${year} CE`;
}

async function ensureFacts(
  qids: string[],
): Promise<Record<string, CachedFacts>> {
  const cache = loadJson<Record<string, CachedFacts>>(FACTS_CACHE_PATH, {});
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
          inceptionYear: firstClaimYear(entity.claims, 'P571'),
          dissolutionYear: firstClaimYear(entity.claims, 'P576'),
          capitalQids: firstClaimQids(entity.claims, 'P36', 3),
          predecessorQids: firstClaimQids(entity.claims, 'P155', 3),
          successorQids: firstClaimQids(entity.claims, 'P1366', 3),
          enwikiTitle: entity.enwikiTitle,
        };
      }
    } catch (error) {
      console.warn(
        `[build-knowledge] facts batch failed (${batch[0]}…): ${String(error)} — skipped`,
      );
    }
    writeFileSync(FACTS_CACHE_PATH, JSON.stringify(cache));
  }
  return cache;
}

async function ensureLabels(qids: string[]): Promise<LabelCache> {
  const cache = loadJson<LabelCache>(LABEL_CACHE_PATH, {});
  const missing = [...new Set(qids)].filter((qid) => !(qid in cache));
  for (const batch of chunk(missing, BATCH_SIZE)) {
    await sleep(BATCH_DELAY_MS);
    try {
      const entities = await getWikidataEntities(fetcher, batch, ['labels']);
      for (const entity of entities.values()) {
        cache[entity.qid] = entity.missing ? null : entity.label;
      }
    } catch (error) {
      console.warn(
        `[build-knowledge] label batch failed (${batch[0]}…): ${String(error)} — skipped`,
      );
    }
    writeFileSync(LABEL_CACHE_PATH, JSON.stringify(cache));
  }
  return cache;
}

async function ensureWikipedia(titles: string[]): Promise<WikiCache> {
  const cache = loadJson<WikiCache>(WIKI_CACHE_PATH, {});
  for (const title of titles) {
    if (title in cache) continue;
    await sleep(WIKI_DELAY_MS);
    try {
      const summary = await fetchWikipediaSummary(fetcher, title, 'en');
      cache[title] = summary
        ? {
            language: summary.language,
            title: summary.title,
            summary: summary.summary,
            url: summary.url,
            thumbnailUrl: summary.thumbnailUrl,
          }
        : null;
    } catch (error) {
      // Leave the title out of the cache so a later run retries it.
      console.warn(
        `[build-knowledge] wikipedia summary failed for "${title}": ${String(error)} — will retry next run`,
      );
    }
  }
  writeFileSync(WIKI_CACHE_PATH, JSON.stringify(cache));
  return cache;
}

function references(qids: string[], labels: LabelCache): KnowledgeReference[] {
  return qids.map((qid) => ({ label: labels[qid] ?? null, wikidataId: qid }));
}

async function main() {
  const registry: EntityRegistry = loadJson(REGISTRY_PATH, {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    entities: [],
  });

  const targets = registry.entities.filter(
    (entity) =>
      (entity.matchStatus === 'confirmed' ||
        entity.matchStatus === 'probable') &&
      entity.wikidataId !== null,
  );
  console.log(`[build-knowledge] matched entities: ${targets.length}`);

  const facts = await ensureFacts(targets.map((e) => e.wikidataId!));

  const referencedQids = targets.flatMap((entity) => {
    const fact = facts[entity.wikidataId!];
    if (!fact) return [];
    return [
      ...fact.capitalQids,
      ...fact.predecessorQids,
      ...fact.successorQids,
    ];
  });
  const labels = await ensureLabels(referencedQids);

  const wikiTitles = [
    ...new Set(
      targets
        .map((entity) => facts[entity.wikidataId!]?.enwikiTitle)
        .filter((title): title is string => typeof title === 'string'),
    ),
  ];
  console.log(
    `[build-knowledge] wikipedia articles to summarize: ${wikiTitles.length}`,
  );
  const wikipedia = await ensureWikipedia(wikiTitles);

  const now = new Date().toISOString();
  const knowledge: Record<string, EntityKnowledge> = {};
  let built = 0;
  let missingFacts = 0;

  for (const entity of targets) {
    const fact = facts[entity.wikidataId!];
    if (!fact) {
      missingFacts += 1;
      continue;
    }
    const wiki: WikipediaKnowledge | null = fact.enwikiTitle
      ? (wikipedia[fact.enwikiTitle] ?? null)
      : null;
    knowledge[entity.entityId] = {
      entityId: entity.entityId,
      wikidataId: entity.wikidataId,
      label: fact.label ?? entity.name,
      description: fact.description,
      inception: formatYear(fact.inceptionYear),
      dissolution: formatYear(fact.dissolutionYear),
      capitals: references(fact.capitalQids, labels),
      predecessors: references(fact.predecessorQids, labels),
      successors: references(fact.successorQids, labels),
      wikipedia: wiki,
      provenance: {
        wikidataFetchedAt: now,
        wikipediaFetchedAt: wiki ? now : null,
      },
    };
    built += 1;
  }

  const output: KnowledgeRegistry = {
    version: 1,
    generatedAt: now,
    knowledge,
  };
  mkdirSync('data/knowledge', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');

  console.log('[build-knowledge] ---- results ----');
  console.log(`knowledge entries built: ${built}`);
  console.log(`facts missing (skipped): ${missingFacts}`);
  console.log(
    `wikipedia summaries:     ${Object.values(wikipedia).filter(Boolean).length}`,
  );
  console.log(`wrote ${OUT_PATH}`);
}

void main();
