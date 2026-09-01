/**
 * Canonical JSON type guards for the knowledge layer.
 *
 * One place for runtime narrowing of untrusted (network/persisted) JSON so
 * call sites never recreate local guards.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Narrows to `Record<string, unknown>`; non-objects read as `{}`. */
export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
