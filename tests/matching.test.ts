import { describe, it, expect } from 'vitest';
import { applyOverrides, type OverrideFile } from '../src/knowledge/overrides';
import {
  classifyMatches,
  scoreCandidate,
  type CandidateClaims,
  type MatchTarget,
} from '../src/knowledge/matchScore';
import {
  WikidataApiError,
  searchWikidataEntity,
} from '../src/knowledge/wikidata';
import type { HistoryEntity } from '../src/knowledge/types';

function entity(overrides: Partial<HistoryEntity> = {}): HistoryEntity {
  return {
    entityId: 'ha:polity:roman_empire',
    type: 'polity',
    name: 'Roman Empire',
    aliases: [],
    wikidataId: null,
    matchStatus: 'unmatched',
    matchConfidence: null,
    matchMethod: null,
    matchedLabel: null,
    candidates: [],
    sourceFeatureNames: ['Roman Empire'],
    firstYear: -27,
    lastYear: 476,
    featureCount: 3,
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateClaims> = {}): CandidateClaims {
  return {
    qid: 'Q2277',
    label: 'Roman Empire',
    description: 'ancient empire',
    aliases: [],
    p31: ['Q3024330'],
    inceptionYear: -27,
    dissolutionYear: 476,
    ...overrides,
  };
}

const target: MatchTarget = {
  name: 'Roman Empire',
  aliases: [],
  firstYear: -27,
  lastYear: 476,
};

const fullClosure = new Set(['Q3024330', 'Q6256', 'Q7275', 'Q1790360']);

describe('scoreCandidate / classifyMatches', () => {
  it('confirms an exact label + polity type + temporal match', () => {
    const decision = classifyMatches([
      scoreCandidate(candidate(), target, fullClosure),
    ]);
    expect(decision.status).toBe('confirmed');
    expect(decision.top?.qid).toBe('Q2277');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('stays probable on an alias-only match (no exact label)', () => {
    const decision = classifyMatches([
      scoreCandidate(
        candidate({ label: 'Rōmisches Reich', aliases: ['Roman Empire'] }),
        target,
        fullClosure,
      ),
    ]);
    expect(decision.status).toBe('probable');
  });

  it('reports ambiguous when two candidates are within the margin', () => {
    const decision = classifyMatches([
      scoreCandidate(candidate({ qid: 'Q1' }), target, fullClosure),
      scoreCandidate(candidate({ qid: 'Q2' }), target, fullClosure),
    ]);
    expect(decision.status).toBe('ambiguous');
    expect(decision.top).toBeNull();
    expect(decision.candidates).toHaveLength(2);
  });

  it('reports unmatched when there is no result', () => {
    const decision = classifyMatches([]);
    expect(decision.status).toBe('unmatched');
  });

  it('reports unmatched for low scores', () => {
    const decision = classifyMatches([
      scoreCandidate(
        candidate({
          label: 'Something Else',
          aliases: [],
          p31: ['Q5'],
          inceptionYear: 1900,
          dissolutionYear: null,
        }),
        target,
        fullClosure,
      ),
    ]);
    expect(decision.status).toBe('unmatched');
  });

  it('does not match humans even on exact names', () => {
    const decision = classifyMatches([
      scoreCandidate(candidate({ p31: ['Q5'] }), target, fullClosure),
    ]);
    expect(decision.status).not.toBe('confirmed');
    expect(decision.status).not.toBe('probable');
  });
});

describe('applyOverrides', () => {
  it('applies a confirmed override over automatic matching', () => {
    const autoMatched = entity({
      matchStatus: 'probable',
      matchConfidence: 0.7,
      wikidataId: 'Q9999',
    });
    const overrides: OverrideFile = {
      'ha:polity:roman_empire': { wikidata_id: 'Q2277', status: 'confirmed' },
    };
    const result = applyOverrides([autoMatched], overrides);
    expect(result.applied).toEqual(['ha:polity:roman_empire']);
    const matched = result.entities[0]!;
    expect(matched.wikidataId).toBe('Q2277');
    expect(matched.matchStatus).toBe('confirmed');
    expect(matched.matchMethod).toBe('manual-override');
  });

  it('rejects invalid QIDs without touching the entity', () => {
    const overrides: OverrideFile = {
      'ha:polity:roman_empire': { wikidata_id: 'not-a-qid' },
    };
    const result = applyOverrides([entity()], overrides);
    expect(result.applied).toEqual([]);
    expect(result.invalid).toEqual([
      { entityId: 'ha:polity:roman_empire', qid: 'not-a-qid' },
    ]);
    expect(result.entities[0]!.matchStatus).toBe('unmatched');
  });

  it('ignores entities without an override entry', () => {
    const result = applyOverrides([entity()], {});
    expect(result.applied).toEqual([]);
    expect(result.entities[0]!.wikidataId).toBeNull();
  });
});

describe('searchWikidataEntity API failure', () => {
  it('propagates a WikidataApiError on HTTP 500', async () => {
    const failingFetcher = (async () => {
      throw new WikidataApiError('Wikidata API HTTP 500', 500);
    }) as unknown as typeof fetch;
    await expect(
      searchWikidataEntity(failingFetcher, 'Roman Empire'),
    ).rejects.toThrow(WikidataApiError);
  });

  it('parses a successful search response', async () => {
    const okFetcher = (async () =>
      new Response(
        JSON.stringify({
          search: [
            {
              id: 'Q2277',
              label: 'Roman Empire',
              description: 'ancient empire',
              match: { type: 'label' },
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const results = await searchWikidataEntity(okFetcher, 'Roman Empire');
    expect(results).toEqual([
      {
        qid: 'Q2277',
        label: 'Roman Empire',
        description: 'ancient empire',
        matchType: 'label',
      },
    ]);
  });
});
