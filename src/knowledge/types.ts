/**
 * Knowledge Layer data model.
 *
 * Separation of concerns (Work Order §5):
 *   polygon/spatial state ≠ entity ≠ Wikidata mapping ≠ knowledge data ≠ UI.
 *
 * The internal History Atlas entity ID is the primary key. The Wikidata QID
 * is only an external knowledge-source link — never a History Atlas key.
 */

export type EntityType = 'polity';

export type MatchStatus = 'confirmed' | 'probable' | 'ambiguous' | 'unmatched';

export interface MatchCandidate {
  qid: string;
  label: string | null;
  description: string | null;
  score: number;
}

/**
 * A historical entity extracted from the polygon dataset. One entity may own
 * many polygon geometries across time slices; the polygon files themselves
 * are never modified by the knowledge layer.
 */
export interface HistoryEntity {
  entityId: string;
  type: EntityType;
  /** Canonical display name (most frequent original casing in the dataset). */
  name: string;
  aliases: string[];

  wikidataId: string | null;
  matchStatus: MatchStatus;
  matchConfidence: number | null;
  matchMethod: string | null;
  matchedLabel: string | null;
  /** Runner-up QIDs kept when the match was ambiguous. */
  candidates: MatchCandidate[];

  /** Distinct original NAME spellings this entity was built from. */
  sourceFeatureNames: string[];

  /** Dataset coverage: earliest / latest year (BC negative) with a feature. */
  firstYear: number;
  lastYear: number;
  featureCount: number;
}

export interface WikipediaKnowledge {
  language: string;
  title: string;
  summary: string;
  url: string;
  thumbnailUrl: string | null;
}

/** Reference to another entity, resolved by label (QID optional). */
export interface KnowledgeReference {
  label: string | null;
  wikidataId: string | null;
}

export interface EntityKnowledge {
  entityId: string;
  wikidataId: string | null;

  label: string;
  description: string | null;

  inception: string | null;
  dissolution: string | null;

  capitals: KnowledgeReference[];
  predecessors: KnowledgeReference[];
  successors: KnowledgeReference[];

  wikipedia: WikipediaKnowledge | null;

  provenance: {
    wikidataFetchedAt: string | null;
    wikipediaFetchedAt: string | null;
  };
}

export interface EntityRegistry {
  /** Schema version, bumped on breaking registry changes. */
  version: 1;
  generatedAt: string;
  entities: HistoryEntity[];
}

export interface KnowledgeRegistry {
  version: 1;
  generatedAt: string;
  /** Keyed by entityId for O(1) lookup at runtime. */
  knowledge: Record<string, EntityKnowledge>;
}
