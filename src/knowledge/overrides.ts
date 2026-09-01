/**
 * Manual entity overrides (Work Order §B-4).
 *
 * Overrides live in `data/entity-overrides.json`, keyed by History Atlas
 * entity ID, and always take precedence over automatic matching. Invalid
 * QIDs are reported and skipped, never silently applied.
 */

import type { HistoryEntity } from './types';

export interface EntityOverride {
  wikidata_id: string;
  status?: 'confirmed';
  /** Free-form note, e.g. why the automatic match was rejected. */
  note?: string;
}

export type OverrideFile = Record<string, EntityOverride>;

const QID_PATTERN = /^Q\d+$/;

export interface OverrideResult {
  entities: HistoryEntity[];
  applied: string[];
  invalid: Array<{ entityId: string; qid: string }>;
}

export function applyOverrides(
  entities: HistoryEntity[],
  overrides: OverrideFile,
): OverrideResult {
  const applied: string[] = [];
  const invalid: Array<{ entityId: string; qid: string }> = [];
  const next = entities.map((entity) => {
    const override = overrides[entity.entityId];
    if (!override) return entity;
    if (!QID_PATTERN.test(override.wikidata_id)) {
      invalid.push({ entityId: entity.entityId, qid: override.wikidata_id });
      return entity;
    }
    applied.push(entity.entityId);
    return {
      ...entity,
      wikidataId: override.wikidata_id,
      matchStatus: 'confirmed' as const,
      matchConfidence: 1,
      matchMethod: 'manual-override',
      matchedLabel: override.note ?? entity.matchedLabel,
    };
  });
  return { entities: next, applied, invalid };
}
