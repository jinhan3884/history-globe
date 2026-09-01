/**
 * Pure candidate scoring + match classification (Work Order Phase B).
 *
 * Signals: name/alias similarity, polity-type plausibility (P31 inside a
 * subclass closure of historical-polity root classes), and temporal
 * plausibility (inception/dissolution vs. the entity's dataset year span).
 * No network access — the caller feeds Wikidata claims in.
 */

import type { MatchCandidate, MatchStatus } from './types';

export interface CandidateClaims {
  qid: string;
  label: string | null;
  description: string | null;
  aliases: string[];
  p31: string[];
  inceptionYear: number | null;
  dissolutionYear: number | null;
}

export interface MatchTarget {
  name: string;
  aliases: string[];
  firstYear: number;
  lastYear: number;
}

export interface ScoredCandidate extends MatchCandidate {
  nameScore: number;
  typeScore: number;
  temporalScore: number;
}

export interface MatchDecision {
  status: MatchStatus;
  confidence: number | null;
  method: string | null;
  top: ScoredCandidate | null;
  candidates: MatchCandidate[];
}

/** Normalizes names for comparison: ASCII, lowercase, collapsed. */
function norm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const TYPE_PENALTY_HUMAN = 0.0;
const TYPE_UNTYPED = 0.3;
const TYPE_PARTIAL = 0.6;
const TYPE_MATCH = 1.0;

const TEMPORAL_MISMATCH = 0.2;
const TEMPORAL_NEUTRAL = 0.5;
const TEMPORAL_MATCH = 1.0;

/** Tolerance in years when comparing dataset spans with Wikidata dates. */
export const TEMPORAL_TOLERANCE_YEARS = 150;

/**
 * Classes that can never be the polity a polygon refers to: individual
 * people and personal names top the list — wbsearchentities surfaces them
 * constantly for short names.
 */
const NON_POLITY_TYPES = new Set([
  'Q5', // human
  'Q101352', // family name
  'Q12308941', // given name
]);

function candidateTypeScore(
  candidate: CandidateClaims,
  polityTypeClosure: ReadonlySet<string>,
): number {
  if (candidate.p31.some((type) => NON_POLITY_TYPES.has(type))) {
    return TYPE_PENALTY_HUMAN;
  }
  if (candidate.p31.some((type) => polityTypeClosure.has(type))) {
    return TYPE_MATCH;
  }
  if (candidate.p31.length === 0) {
    return TYPE_UNTYPED;
  }
  return TYPE_PARTIAL;
}

export function scoreCandidate(
  candidate: CandidateClaims,
  target: MatchTarget,
  polityTypeClosure: ReadonlySet<string>,
): ScoredCandidate {
  const nameNorm = norm(target.name);
  const labelNorm = candidate.label ? norm(candidate.label) : null;
  const aliasNorms = [
    ...target.aliases.map(norm),
    ...candidate.aliases.map(norm),
  ];

  let nameScore = 0;
  if (labelNorm !== null && labelNorm === nameNorm) {
    nameScore = 1.0;
  } else if (aliasNorms.includes(nameNorm)) {
    nameScore = 0.9;
  } else if (
    labelNorm !== null &&
    (labelNorm.startsWith(nameNorm) || nameNorm.startsWith(labelNorm))
  ) {
    nameScore = 0.5;
  }

  const typeScore = candidateTypeScore(candidate, polityTypeClosure);

  const temporalScore = scoreTemporal(candidate, target);

  const score = 0.5 * nameScore + 0.25 * typeScore + 0.25 * temporalScore;

  return {
    qid: candidate.qid,
    label: candidate.label,
    description: candidate.description,
    score,
    nameScore,
    typeScore,
    temporalScore,
  };
}

function scoreTemporal(
  candidate: CandidateClaims,
  target: MatchTarget,
): number {
  if (candidate.inceptionYear === null && candidate.dissolutionYear === null) {
    return TEMPORAL_NEUTRAL;
  }
  const start = candidate.inceptionYear;
  const end = candidate.dissolutionYear;
  // Each known bound must be consistent with the dataset span; a missing
  // bound is unconstrained (e.g. a dissolution-only polity can still fit).
  const startOk =
    start === null || start <= target.lastYear + TEMPORAL_TOLERANCE_YEARS;
  const endOk =
    end === null || end >= target.firstYear - TEMPORAL_TOLERANCE_YEARS;
  return startOk && endOk ? TEMPORAL_MATCH : TEMPORAL_MISMATCH;
}

export const CONFIRMED_THRESHOLD = 0.9;
export const PROBABLE_THRESHOLD = 0.65;
const AMBIGUOUS_MIN_SCORE = 0.5;
const AMBIGUOUS_MARGIN = 0.05;

/**
 * Classifies the scored candidate list. An auto "confirmed" additionally
 * requires an exact label match plus polity-type and temporal agreement —
 * weaker matches stay "probable" (Work Order §2.4, §B).
 */
export function classifyMatches(scored: ScoredCandidate[]): MatchDecision {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted[0] ?? null;
  const second = sorted[1] ?? null;
  const candidates: MatchCandidate[] = sorted.slice(0, 3).map((c) => ({
    qid: c.qid,
    label: c.label,
    description: c.description,
    score: Math.round(c.score * 1000) / 1000,
  }));

  if (!top || top.score < AMBIGUOUS_MIN_SCORE) {
    return {
      status: 'unmatched',
      confidence: null,
      method: null,
      top: null,
      candidates: [],
    };
  }

  if (
    second &&
    second.score >= AMBIGUOUS_MIN_SCORE &&
    top.score - second.score < AMBIGUOUS_MARGIN
  ) {
    return {
      status: 'ambiguous',
      confidence: null,
      method: 'name+alias+type+temporal',
      top: null,
      candidates,
    };
  }

  const confirmed =
    top.score >= CONFIRMED_THRESHOLD &&
    top.nameScore === 1.0 &&
    top.typeScore >= TYPE_PARTIAL &&
    top.temporalScore >= TEMPORAL_NEUTRAL;

  if (top.score >= CONFIRMED_THRESHOLD && confirmed) {
    return {
      status: 'confirmed',
      confidence: round3(top.score),
      method: 'name+alias+type+temporal',
      top,
      candidates,
    };
  }
  if (top.score >= PROBABLE_THRESHOLD && top.typeScore > 0) {
    return {
      status: 'probable',
      confidence: round3(top.score),
      method: 'name+alias+type+temporal',
      top,
      candidates,
    };
  }
  return {
    status: 'unmatched',
    confidence: null,
    method: null,
    top: null,
    candidates,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
