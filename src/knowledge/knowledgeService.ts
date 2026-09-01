/**
 * Runtime knowledge service (Work Order Phase D).
 *
 * Loads the pre-generated static JSON produced by
 * scripts/build-knowledge.ts — no entity resolution and no external API
 * calls happen at runtime (Work Order §B-5, §C-6). Module-level promises
 * act as the in-memory cache: each file is fetched at most once per page
 * load.
 *
 * Failure isolation: any load failure rejects the lookup promise only —
 * the globe keeps rendering; the panel shows its error state.
 */

import { nameKey } from './slug';
import type {
  EntityKnowledge,
  EntityRegistry,
  HistoryEntity,
  KnowledgeRegistry,
} from './types';

const REGISTRY_URL = '/data/entities.json';
const KNOWLEDGE_URL = '/data/knowledge/entities-knowledge.json';

export interface FeatureLookup {
  /** null when no registry entity exists for the feature name. */
  entity: HistoryEntity | null;
  knowledge: EntityKnowledge | null;
}

let registryPromise: Promise<EntityRegistry> | null = null;
let knowledgePromise: Promise<KnowledgeRegistry> | null = null;

function fetchJson<T>(url: string): Promise<T> {
  // 'no-cache' revalidates before use so a new deployment's knowledge JSON
  // is never masked by a stale heuristic browser cache entry.
  return fetch(url, { cache: 'no-cache' }).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  });
}

function loadRegistry(): Promise<EntityRegistry> {
  // A transient failure must not poison the cache: drop the rejected
  // promise so the next lookup retries the fetch.
  registryPromise ??= fetchJson<EntityRegistry>(REGISTRY_URL).catch(
    (error: unknown) => {
      registryPromise = null;
      throw error;
    },
  );
  return registryPromise;
}

function loadKnowledge(): Promise<KnowledgeRegistry> {
  knowledgePromise ??= fetchJson<KnowledgeRegistry>(KNOWLEDGE_URL).catch(
    (error: unknown) => {
      knowledgePromise = null;
      throw error;
    },
  );
  return knowledgePromise;
}

/**
 * Resolves a clicked feature NAME to its entity and knowledge. Never
 * throws — failures surface as `{ entity: null, knowledge: null }` plus a
 * rejected knowledge future consumed by the panel's error state.
 */
export async function lookupFeatureName(name: string): Promise<FeatureLookup> {
  const registry = await loadRegistry();
  const entity =
    registry.entities.find(
      (candidate) => nameKey(candidate.name) === nameKey(name),
    ) ?? null;
  if (!entity) return { entity: null, knowledge: null };
  try {
    const knowledgeRegistry = await loadKnowledge();
    return {
      entity,
      knowledge: knowledgeRegistry.knowledge[entity.entityId] ?? null,
    };
  } catch {
    // Knowledge JSON unavailable: the entity is still known to the panel.
    return { entity, knowledge: null };
  }
}

/** Test seam: resets the in-memory caches. */
export function resetCaches(): void {
  registryPromise = null;
  knowledgePromise = null;
}
