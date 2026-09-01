/**
 * Wikidata API client (Work Order Phase B).
 *
 * Thin, fetch-injectable wrapper over the official
 * `wbsearchentities` / `wbgetentities` Action API endpoints. Used only by
 * build-time scripts — never at polygon-click runtime (Work Order §B-5).
 *
 * Network calls live here; scoring/classification stays pure in
 * `matchScore.ts` so it can be tested without a network. API responses are
 * narrowed with runtime guards, never blind-cast.
 */

import { asRecord, asRecord as record, asString, isRecord } from './json';

export const WIKIDATA_API_ENDPOINT = 'https://www.wikidata.org/w/api.php';

/** Wikimedia UA policy requires a descriptive contact-bearing UA. */
export const WIKIDATA_USER_AGENT =
  'HistoryAtlas/0.1 (https://historyatlas.net; knowledge-layer build script)';

export type Fetcher = typeof fetch;

export class WikidataApiError extends Error {
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'WikidataApiError';
    this.status = status;
  }
}

export interface SearchResult {
  qid: string;
  label: string | null;
  description: string | null;
  /** How the search matched: label, alias, or else. */
  matchType: string | null;
}

export interface WikidataEntity {
  qid: string;
  missing: boolean;
  label: string | null;
  description: string | null;
  aliases: string[];
  /** Claim property → datavalue strings (ISO time values kept verbatim). */
  claims: Record<string, string[]>;
  /** English Wikipedia sitelink title, if any. */
  enwikiTitle: string | null;
  /** sitelink site → canonical URL. */
  sitelinks: Record<string, string>;
}

export interface SearchOptions {
  lang?: string;
  limit?: number;
}
function claimValues(claims: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [property, statements] of Object.entries(record(claims))) {
    if (!Array.isArray(statements)) continue;
    const values: string[] = [];
    for (const statement of statements) {
      const datavalue = record(record(record(statement).mainsnak).datavalue);
      const value = datavalue.value;
      if (typeof value === 'string') {
        values.push(value);
      } else if (isRecord(value) && typeof value.time === 'string') {
        values.push(value.time);
      } else if (isRecord(value) && typeof value.id === 'string') {
        values.push(value.id);
      }
    }
    if (values.length > 0) out[property] = values;
  }
  return out;
}

function parseSearchResults(raw: unknown): SearchResult[] {
  const search = record(raw).search;
  if (!Array.isArray(search)) return [];
  const results: SearchResult[] = [];
  for (const item of search) {
    const rec = record(item);
    const qid = asString(rec.id);
    if (!qid) continue;
    const match = record(rec.match);
    results.push({
      qid,
      label: asString(rec.label),
      description: asString(rec.description),
      matchType: asString(match.type),
    });
  }
  return results;
}

function parseEntity(qid: string, entity: unknown): WikidataEntity {
  const rec = record(entity);
  if (rec.missing !== undefined) {
    return {
      qid,
      missing: true,
      label: null,
      description: null,
      aliases: [],
      claims: {},
      enwikiTitle: null,
      sitelinks: {},
    };
  }
  const aliases: string[] = [];
  const enAliases = record(rec.aliases).en;
  if (Array.isArray(enAliases)) {
    for (const alias of enAliases) {
      const value = asString(record(alias).value);
      if (value) aliases.push(value);
    }
  }
  const sitelinks: Record<string, string> = {};
  for (const [site, link] of Object.entries(record(rec.sitelinks))) {
    const url = asString(record(link).url);
    if (url) sitelinks[site] = url;
  }
  return {
    qid: asString(rec.id) ?? qid,
    missing: false,
    label: asString(asRecord(record(rec.labels).en).value),
    description: asString(asRecord(record(rec.descriptions).en).value),
    aliases,
    claims: claimValues(rec.claims),
    enwikiTitle: asString(asRecord(record(rec.sitelinks).enwiki).title),
    sitelinks,
  };
}

async function apiGet(
  fetcher: Fetcher,
  params: Record<string, string>,
): Promise<unknown> {
  const url = `${WIKIDATA_API_ENDPOINT}?${new URLSearchParams({
    format: 'json',
    origin: '*',
    ...params,
  }).toString()}`;
  const res = await fetcher(url, {
    headers: { 'User-Agent': WIKIDATA_USER_AGENT },
  });
  if (!res.ok) {
    throw new WikidataApiError(`Wikidata API HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as unknown;
}

/** Full-text search over labels/aliases. Never auto-confirms by itself. */
export async function searchWikidataEntity(
  fetcher: Fetcher,
  name: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const raw = await apiGet(fetcher, {
    action: 'wbsearchentities',
    search: name,
    language: options.lang ?? 'en',
    limit: String(options.limit ?? 5),
  });
  return parseSearchResults(raw);
}

/** `+27bc` / `+0100-01-01T00:00:00Z` → integer year (BC negative). */
export function wikidataTimeToYear(time: string): number | null {
  const m = time.match(/^([+-])(\d+)/);
  if (!m) return null;
  const year = parseInt(m[2]!, 10);
  return m[1] === '-' ? -year : year;
}

/**
 * Batched entity lookup. Wikidata accepts up to 50 ids per request; the
 * caller is expected to chunk (see scripts/match-wikidata.ts).
 */
export async function getWikidataEntities(
  fetcher: Fetcher,
  qids: string[],
  props: string[] = [
    'labels',
    'descriptions',
    'aliases',
    'claims',
    'sitelinks',
  ],
): Promise<Map<string, WikidataEntity>> {
  const out = new Map<string, WikidataEntity>();
  const raw = await apiGet(fetcher, {
    action: 'wbgetentities',
    ids: qids.join('|'),
    props: props.join('|'),
    languages: 'en',
    sitefilter: 'enwiki',
  });
  const entities = record(raw).entities;
  for (const [qid, entity] of Object.entries(record(entities))) {
    out.set(qid, parseEntity(qid, entity));
  }
  return out;
}

/** Extracts a single integer year from an ISO-ish Wikidata time value. */
export function firstClaimYear(
  claims: Record<string, string[]>,
  property: string,
): number | null {
  for (const value of claims[property] ?? []) {
    const year = wikidataTimeToYear(value);
    if (year !== null) return year;
  }
  return null;
}

/** Extracts referenced entity QIDs from a claim property (P36, P155, …). */
export function firstClaimQids(
  claims: Record<string, string[]>,
  property: string,
  max: number,
): string[] {
  return (claims[property] ?? [])
    .filter((value) => /^Q\d+$/.test(value))
    .slice(0, max);
}
