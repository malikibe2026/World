// Runtime Data Quality Engine — the browser-side counterpart of scripts/pipeline/steps/quality.py.
// Applied to live data (World Bank API, OpenDOSM API) and to comparison sets before display.

import type { Observation, Quality, Series } from '../types';

export type CheckName = 'missing_values' | 'duplicate_records' | 'outliers' | 'year_mismatch' | 'geographic_mismatch' | 'unit_mismatch';

export interface RuntimeIssue {
  check: CheckName;
  severity: 'info' | 'warning' | 'error';
  message: string;
  geoId?: string;
  indicator?: string;
  year?: number;
}

/** Remove duplicate (geo, indicator, year, source) keys, keeping the first, and report them. */
export function dedupe(obs: Observation[]): { rows: Observation[]; issues: RuntimeIssue[] } {
  const seen = new Set<string>();
  const rows: Observation[] = [];
  const issues: RuntimeIssue[] = [];
  for (const o of obs) {
    const k = `${o.geoId}|${o.indicator}|${o.year}|${o.sourceId}`;
    if (seen.has(k)) {
      issues.push({ check: 'duplicate_records', severity: 'warning', message: 'duplicate observation dropped', geoId: o.geoId, indicator: o.indicator, year: o.year });
      continue;
    }
    seen.add(k);
    rows.push(o);
  }
  return { rows, issues };
}

/** Year-on-year jumps larger than `maxRel` (relative) are flagged for review, never removed. */
export function jumpOutliers(series: Series, maxRel = 0.5): RuntimeIssue[] {
  const out: RuntimeIssue[] = [];
  const pts = [...series.points].sort((a, b) => a.year - b.year);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b.year - a.year !== 1 || a.value === 0) continue;
    const rel = (b.value - a.value) / Math.abs(a.value);
    if (Math.abs(rel) > maxRel) {
      out.push({ check: 'outliers', severity: 'info', message: `change of ${(rel * 100).toFixed(0)}% from ${a.year} to ${b.year}`, indicator: series.indicator, year: b.year });
    }
  }
  return out;
}

/** Robust z-score (median / MAD) outliers across a cross-section of values. */
export function robustOutliers(values: Array<{ geoId: string; value: number }>, z = 5): string[] {
  const xs = values.map((v) => v.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (xs.length < 8) return [];
  const med = quantile(xs, 0.5);
  const mad = quantile(xs.map((x) => Math.abs(x - med)).sort((a, b) => a - b), 0.5) || 1e-9;
  return values.filter((v) => Math.abs((0.6745 * (v.value - med)) / mad) > z).map((v) => v.geoId);
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const HARD_BOUNDS: Record<string, [number, number]> = {
  percent: [0, 100.0001],
  per1000: [0, 1000],
};

/** Detects values that are impossible for the declared unit (e.g. a share above 100%). */
export function unitCheck(indicator: string, unit: string, value: number): RuntimeIssue | null {
  const u = unit.toLowerCase();
  const isShare = u.startsWith('% of') && !u.includes('gdp') && !u.includes('exports');
  const bounds = isShare ? HARD_BOUNDS.percent : u.includes('per 1,000') ? HARD_BOUNDS.per1000 : null;
  if (bounds && (value < bounds[0] || value > bounds[1])) {
    return { check: 'unit_mismatch', severity: 'error', message: `value ${value} impossible for unit “${unit}”`, indicator };
  }
  if ((u === 'persons' || u.startsWith('births') || u.startsWith('deaths')) && value < 0) {
    return { check: 'unit_mismatch', severity: 'error', message: 'negative count', indicator };
  }
  return null;
}

/**
 * Comparison alignment: pick the latest year that every location has, else fall back to each
 * location's latest year and report a year_mismatch (the UI then shows the year beside each value).
 */
export function alignYears(perGeo: Record<string, Series | undefined>, preferYear?: number): {
  year: number | null;
  values: Record<string, { value: number; year: number; quality: Quality } | null>;
  issues: RuntimeIssue[];
} {
  const geos = Object.keys(perGeo);
  const yearsSets = geos.map((g) => new Set((perGeo[g]?.points ?? []).map((p) => p.year)));
  const issues: RuntimeIssue[] = [];
  const values: Record<string, { value: number; year: number; quality: Quality } | null> = {};
  let common: number[] = [];
  if (yearsSets.length && yearsSets.every((s) => s.size)) {
    common = [...yearsSets[0]].filter((y) => yearsSets.every((s) => s.has(y))).sort((a, b) => b - a);
  }
  let year: number | null = null;
  if (preferYear !== undefined && common.includes(preferYear)) year = preferYear;
  else if (common.length) year = common.find((y) => preferYear === undefined || y <= preferYear) ?? common[0];
  for (const g of geos) {
    const pts = perGeo[g]?.points ?? [];
    if (!pts.length) {
      values[g] = null;
      issues.push({ check: 'missing_values', severity: 'info', message: 'no data', geoId: g });
      continue;
    }
    const p = year !== null ? pts.find((x) => x.year === year) : undefined;
    if (p) values[g] = { value: p.value, year: p.year, quality: p.quality };
    else {
      const candidates = pts.filter((x) => preferYear === undefined || x.year <= preferYear);
      const latest = (candidates.length ? candidates : pts).reduce((a, b) => (b.year > a.year ? b : a));
      values[g] = { value: latest.value, year: latest.year, quality: latest.quality };
    }
  }
  const usedYears = new Set(Object.values(values).filter(Boolean).map((v) => v!.year));
  if (usedYears.size > 1) issues.push({ check: 'year_mismatch', severity: 'warning', message: `different reference years: ${[...usedYears].sort().join(', ')}` });
  return { year: usedYears.size === 1 ? [...usedYears][0] : year, values, issues };
}

/** Quality for a WPP year given the estimate boundary. */
export function wppQuality(year: number, estimateLast: number, derived = false): Quality {
  if (derived) return 'DERIVED';
  return year <= estimateLast ? 'ESTIMATE' : 'PROJECTION';
}
