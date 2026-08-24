/**
 * Diagnostic report types and summary formatters.
 *
 * A `FeatureReport` is produced for every feature in a collection. The
 * `top-level` summary aggregates counts so the dev console can print a
 * one-line overview, and live UI (M5+) can drill down per feature.
 *
 * Severity meanings:
 *  - `error`   : something is structurally wrong (non-finite coord, degenerate
 *                ring, ring not closed) that the normalizer in M3 will need
 *                to repair or skip.
 *  - `warning` : an observable oddity (longitude jump >= 180, suspicious
 *                winding, consecutive duplicate points) that does not by
 *                itself prevent rendering but is a strong correlate of the
 *                known polygon artifact.
 *  - `info`    : benign observation (e.g. clockwise outer ring) we still want
 *                to record for traceability.
 */

export type Severity = 'error' | 'warning' | 'info';

export interface DiagnosticIssue {
  severity: Severity;
  /** Short machine-readable code, e.g. `coord-non-finite`, `ring-open`,
   *  `lon-jump`, `winding-ccw`, `duplicate-point`. */
  code: string;
  /** Human-readable detail; safe to surface in dev-mode UI. */
  message: string;
  /** Optional path into the feature's coordinate tree, e.g.
   *  `polygon[0].ring[1].point[3]`. */
  path?: string;
}

export interface FeatureReport {
  /** Index in the source `features` array. */
  featureIndex: number;
  /** Display name resolved from `properties.NAME` (or the unnamed fallback). */
  displayName: string;
  /** Geometry type tag from the source feature. */
  geometryType: 'MultiPolygon' | 'Polygon';
  /** Number of polygons present. 1 for `Polygon`; `n` for `MultiPolygon`. */
  polygonCount: number;
  /** Total count of rings across all polygons (outer + holes). */
  ringCount: number;
  /** Total count of positions across all rings. */
  positionCount: number;
  /** Issues found for this feature, in insertion order. */
  issues: DiagnosticIssue[];
}

export interface DiagnosticsSummary {
  featureCount: number;
  /** Features with at least one `error` issue. */
  errorFeatureCount: number;
  /** Features with at least one `warning` issue (and no error). */
  warningFeatureCount: number;
  /** Features that passed without any error/warning. */
  cleanFeatureCount: number;
  /** Total rings observed across all features. */
  totalRings: number;
  /** Total positions observed across all features. */
  totalPositions: number;
  /** Histogram keyed by issue code. */
  issueCounts: Record<string, number>;
}

export interface DiagnosticsReport {
  summary: DiagnosticsSummary;
  features: FeatureReport[];
}

/**
 * Compute the summary block from per-feature reports. Centralised so callers
 * never recompute it inconsistently.
 */
export function summarise(reports: FeatureReport[]): DiagnosticsSummary {
  const summary: DiagnosticsSummary = {
    featureCount: reports.length,
    errorFeatureCount: 0,
    warningFeatureCount: 0,
    cleanFeatureCount: 0,
    totalRings: 0,
    totalPositions: 0,
    issueCounts: {},
  };
  for (const r of reports) {
    let hasError = false;
    let hasWarning = false;
    for (const issue of r.issues) {
      if (issue.severity === 'error') hasError = true;
      else if (issue.severity === 'warning') hasWarning = true;
      summary.issueCounts[issue.code] =
        (summary.issueCounts[issue.code] ?? 0) + 1;
    }
    if (hasError) summary.errorFeatureCount += 1;
    else if (hasWarning) summary.warningFeatureCount += 1;
    else summary.cleanFeatureCount += 1;
    summary.totalRings += r.ringCount;
    summary.totalPositions += r.positionCount;
  }
  return summary;
}

/**
 * Multi-line, dev-mode-friendly text summary. Used by `app.ts` to print a
 * single `console.info` block in dev only.
 */
export function formatDevSummary(summary: DiagnosticsSummary): string {
  const codes = Object.entries(summary.issueCounts)
    .toSorted((a, b) => b[1] - a[1])
    .map(([code, n]) => `    ${code}: ${n}`)
    .join('\n');
  return [
    '[history-atlas] geometry diagnostics',
    `  features:       ${summary.featureCount}`,
    `  clean:          ${summary.cleanFeatureCount}`,
    `  with warnings:  ${summary.warningFeatureCount}`,
    `  with errors:    ${summary.errorFeatureCount}`,
    `  rings total:    ${summary.totalRings}`,
    `  positions total:${summary.totalPositions}`,
    '  issues by code:',
    codes.length > 0 ? codes : '    (none)',
  ].join('\n');
}

// ─── Repair report (M3) ────────────────────────────────────────────────

/**
 * Granular action taken by the normalizer. Stable `code` so the dev summary
 * can be histogrammed just like the diagnostics codes.
 */
export type RepairAction =
  | 'removed-non-finite-coord'
  | 'clamped-polar-latitude'
  | 'removed-duplicate-point'
  | 'removed-retracing-loop'
  | 'subdivided-long-segment'
  | 'closed-ring'
  | 'dropped-degenerate-ring'
  | 'dropped-needle-ring'
  | 'rewound-outer-ring'
  | 'rewound-hole-ring'
  | 'dropped-degenerate-polygon'
  | 'dropped-feature-no-polygons';

export interface RepairEntry {
  code: RepairAction;
  /** Coordinate-tree path so the entry can be cross-referenced with the
   *  diagnostic path. */
  path: string;
  /** Optional human-friendly detail. */
  detail?: string;
}

export interface FeatureRepairReport {
  featureIndex: number;
  displayName: string;
  /** Whether the feature survived normalisation (i.e. has at least one
   *  polygon with at least one valid outer ring remaining). */
  kept: boolean;
  entries: RepairEntry[];
}

export interface RepairReport {
  features: FeatureRepairReport[];
  /** Histogram keyed by RepairAction code. */
  actionCounts: Record<string, number>;
  /** Number of features that did not survive normalisation. */
  droppedFeatureCount: number;
}

/**
 * Aggregate per-feature entries into a single RepairReport. Centralised so
 * callers never recompute it inconsistently.
 */
export function summariseRepairs(reports: FeatureRepairReport[]): RepairReport {
  const actionCounts: Record<string, number> = {};
  let droppedFeatureCount = 0;
  for (const r of reports) {
    if (!r.kept) droppedFeatureCount += 1;
    for (const entry of r.entries) {
      actionCounts[entry.code] = (actionCounts[entry.code] ?? 0) + 1;
    }
  }
  return {
    features: reports,
    actionCounts,
    droppedFeatureCount,
  };
}

/**
 * Dev-mode text summary of repair activity, parallel in spirit to
 * `formatDevSummary`.
 */
export function formatDevRepairSummary(report: RepairReport): string {
  const codes = Object.entries(report.actionCounts)
    .toSorted((a, b) => b[1] - a[1])
    .map(([code, n]) => `    ${code}: ${n}`)
    .join('\n');
  return [
    '[history-atlas] geometry repairs applied',
    `  features dropped: ${report.droppedFeatureCount}`,
    '  actions by code:',
    codes.length > 0 ? codes : '    (none)',
  ].join('\n');
}
