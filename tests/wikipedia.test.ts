import { describe, it, expect } from 'vitest';
import {
  WikipediaApiError,
  SUMMARY_MAX_CHARS,
  fetchWikipediaSummary,
} from '../src/knowledge/wikipedia';

const SAMPLE = {
  title: 'Roman Empire',
  extract: 'The Roman Empire was the post-Republican state of ancient Rome.',
  thumbnail: { source: 'https://upload.wikimedia.org/example.jpg' },
  content_urls: {
    desktop: { page: 'https://en.wikipedia.org/wiki/Roman_Empire' },
  },
};

function okFetcher(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
    })) as unknown as typeof fetch;
}

describe('fetchWikipediaSummary', () => {
  it('parses a sitelink summary with title, extract, url, thumbnail', async () => {
    const summary = await fetchWikipediaSummary(
      okFetcher(SAMPLE),
      'Roman Empire',
    );
    expect(summary).toEqual({
      language: 'en',
      title: 'Roman Empire',
      summary: SAMPLE.extract,
      url: 'https://en.wikipedia.org/wiki/Roman_Empire',
      thumbnailUrl: 'https://upload.wikimedia.org/example.jpg',
    });
  });

  it('returns null when the article is missing (404)', async () => {
    const fetcher404 = (async () =>
      new Response('{}', { status: 404 })) as unknown as typeof fetch;
    const summary = await fetchWikipediaSummary(fetcher404, 'Nope');
    expect(summary).toBeNull();
  });

  it('throws WikipediaApiError on rate/error responses (429/500)', async () => {
    const fetcher429 = (async () =>
      new Response('{}', { status: 429 })) as unknown as typeof fetch;
    await expect(
      fetchWikipediaSummary(fetcher429, 'Roman Empire'),
    ).rejects.toThrow(WikipediaApiError);
  });

  it('returns null for an empty summary extract', async () => {
    const summary = await fetchWikipediaSummary(
      okFetcher({ ...SAMPLE, extract: '' }),
      'Roman Empire',
    );
    expect(summary).toBeNull();
  });

  it('truncates extracts to SUMMARY_MAX_CHARS', async () => {
    const long = 'x'.repeat(SUMMARY_MAX_CHARS + 500);
    const summary = await fetchWikipediaSummary(
      okFetcher({ ...SAMPLE, extract: long }),
      'Roman Empire',
    );
    expect(summary!.summary.length).toBe(SUMMARY_MAX_CHARS);
  });

  it('falls back to the language default in the URL', async () => {
    const summary = await fetchWikipediaSummary(
      okFetcher(SAMPLE),
      'Roman Empire',
      'en',
    );
    expect(summary!.url).toContain('en.wikipedia.org');
  });
});
