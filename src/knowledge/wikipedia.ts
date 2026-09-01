/**
 * Wikipedia summary client (Work Order Phase C).
 *
 * Uses the official Wikimedia REST API (`/api/rest_v1/page/summary/{title}`)
 * which returns exactly the small payload the Knowledge Panel needs: title,
 * thumbnail. Never ingests full articles.
 *
 * Fallback policy (§C-5) is implemented by the caller; this module reports:
 *   - summary result (title/summary/url/thumbnail)
 *   - null for a missing article (HTTP 404)
 *   - throws WikipediaApiError for other failures
 */
import { WIKIDATA_USER_AGENT, type Fetcher } from './wikidata';
import { asRecord, asString } from './json';

const REST_ENDPOINT =
  'https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}';

export class WikipediaApiError extends Error {
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'WikipediaApiError';
    this.status = status;
  }
}

export interface WikipediaSummary {
  language: string;
  title: string;
  summary: string;
  url: string;
  thumbnailUrl: string | null;
}

/** Max characters of extract kept in the pre-generated knowledge JSON. */
export const SUMMARY_MAX_CHARS = 800;

function restUrl(lang: string, title: string): string {
  return REST_ENDPOINT.replace('{lang}', lang).replace(
    '{title}',
    encodeURIComponent(title.replaceAll(' ', '_')),
  );
}

function summaryUrl(contentUrls: unknown): string | null {
  const desktop = asRecord(contentUrls).desktop;
  const page = asRecord(desktop).page;
  return typeof page === 'string' ? page : null;
}

function parseSummary(raw: unknown, lang: string): WikipediaSummary | null {
  const body = asRecord(raw);
  const extract = asString(body.extract);
  if (!extract || extract.trim().length === 0) return null;
  const thumbnailSource = asString(asRecord(body.thumbnail).source);
  const url = summaryUrl(body.content_urls);
  return {
    language: lang,
    title: asString(body.title) ?? '',
    summary: extract.slice(0, SUMMARY_MAX_CHARS).trim(),
    url: url ?? `https://${lang}.wikipedia.org/wiki/`,
    thumbnailUrl: thumbnailSource,
  };
}

/**
 * Fetches a short summary. Returns null when the article does not exist;
 * throws WikipediaApiError on network/HTTP failure.
 */
export async function fetchWikipediaSummary(
  fetcher: Fetcher,
  title: string,
  lang = 'en',
): Promise<WikipediaSummary | null> {
  const res = await fetcher(restUrl(lang, title), {
    headers: { 'User-Agent': WIKIDATA_USER_AGENT },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new WikipediaApiError(
      `Wikipedia REST HTTP ${res.status}`,
      res.status,
    );
  }
  return parseSummary(await res.json(), lang);
}
